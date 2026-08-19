"""
SoulSync FastAPI Backend Server
"""
from __future__ import annotations

import os
import secrets
import shutil
import string
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import asyncio
import base64
import bcrypt
import httpx
from cryptography.fernet import Fernet
import os as _os

_FERNET_KEY = _os.environ.get("FERNET_KEY", "")
_fernet: Fernet | None = Fernet(_FERNET_KEY.encode()) if _FERNET_KEY else None


def _enc(text: str) -> str:
    if not _fernet or not text:
        return text
    return _fernet.encrypt(text.encode()).decode()


def _dec(text: str) -> str:
    if not _fernet or not text:
        return text
    try:
        return _fernet.decrypt(text.encode()).decode()
    except Exception:
        return text
import json
import firebase_admin
from firebase_admin import credentials as fb_credentials, firestore_async
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field

# Firestore sort constants (aliases to keep existing code unchanged)
ASCENDING = "ASCENDING"
DESCENDING = "DESCENDING"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()  # reads .env from cwd in dev; Railway injects vars directly

# FIREBASE_SERVICE_ACCOUNT  — set in .env (JSON string of service account key)
# FIREBASE_SERVICE_ACCOUNT_PATH — alternatively, a path to the JSON file
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

# Cloudinary
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY    = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

app = FastAPI(title="SoulSync API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Cloudinary upload helper
# ---------------------------------------------------------------------------

ALLOWED_UPLOAD_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".m4a", ".mp3", ".aac", ".wav", ".mp4", ".mov"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

# Keep local uploads dir as fallback when Cloudinary is not configured
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

async def _upload_to_cloudinary(data: bytes, filename: str, resource_type: str = "auto") -> str:
    """Upload bytes to Cloudinary and return the secure URL.
    Falls back to local /uploads/ if Cloudinary env vars are not set."""
    if not CLOUDINARY_CLOUD_NAME:
        # Local fallback (dev only — files lost on redeploy)
        name = f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
        (UPLOAD_DIR / name).write_bytes(data)
        return f"/uploads/{name}"

    import hashlib, hmac, time as _time
    timestamp = str(int(_time.time()))
    folder = "ourspace"
    # Build signature
    params_to_sign = f"folder={folder}&timestamp={timestamp}"
    sig = hmac.new(
        CLOUDINARY_API_SECRET.encode(),
        params_to_sign.encode(),
        hashlib.sha1,
    ).hexdigest()

    url = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/{resource_type}/upload"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, data={
            "file": f"data:{_mime_from_ext(Path(filename).suffix.lower())};base64,{base64.b64encode(data).decode()}",
            "api_key": CLOUDINARY_API_KEY,
            "timestamp": timestamp,
            "signature": sig,
            "folder": folder,
        })
    resp.raise_for_status()
    return resp.json()["secure_url"]

def _mime_from_ext(ext: str) -> str:
    return {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
        ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".aac": "audio/aac",
        ".wav": "audio/wav", ".mp4": "video/mp4", ".mov": "video/quicktime",
    }.get(ext, "application/octet-stream")

# ---------------------------------------------------------------------------
# DB — Firebase Firestore
# ---------------------------------------------------------------------------

# FIREBASE_SERVICE_ACCOUNT should be the JSON content of your service account
# key file, set as an environment variable (paste the whole JSON as one line).
# Alternatively, set FIREBASE_SERVICE_ACCOUNT_PATH to a file path.

_fb_app = None
db: firestore_async.AsyncClient = None  # type: ignore[assignment]


class MockFirebaseCred(fb_credentials.Base):
    def get_credential(self):
        import google.auth.credentials
        return google.auth.credentials.AnonymousCredentials()


def _init_firebase():
    global _fb_app
    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT", "")
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    if sa_json:
        sa_dict = json.loads(sa_json)
        cred = fb_credentials.Certificate(sa_dict)
        _fb_app = firebase_admin.initialize_app(cred)
    elif sa_path:
        cred = fb_credentials.Certificate(sa_path)
        _fb_app = firebase_admin.initialize_app(cred)
    else:
        if "FIRESTORE_EMULATOR_HOST" not in os.environ:
            os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"
        _fb_app = firebase_admin.initialize_app(MockFirebaseCred(), options={"projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "demo-soulsync")})


@app.on_event("startup")
async def startup():
    global db
    _init_firebase()
    db = firestore_async.client()
    # Start background scheduler
    scheduler.add_job(_dispatch_scheduled_messages, "interval", minutes=1, id="dispatch_scheduled")
    scheduler.add_job(_check_streak_at_risk, "interval", hours=1, id="streak_check")
    scheduler.add_job(_check_upcoming_birthdays, "interval", hours=24, id="birthday_check")
    scheduler.add_job(_check_unlocked_time_capsules, "interval", minutes=5, id="time_capsule_check")
    scheduler.add_job(_check_couple_milestones, "interval", hours=24, id="milestone_check")
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_id() -> str:
    return str(uuid.uuid4())


def serialize(doc: dict, id_field: str = "id") -> dict:
    """Convert Firestore doc to response dict."""
    if doc is None:
        return None
    doc = dict(doc)
    # Firestore docs use string IDs stored in the doc itself; no _id to strip.
    # If the collection-specific id field is missing but "id" is present, copy it.
    if id_field not in doc and "id" in doc:
        doc[id_field] = doc["id"]
    doc.setdefault("id", doc.get(id_field, ""))
    return doc


def serialize_user(doc: dict) -> dict:
    if doc is None:
        return None
    doc = serialize(doc, "user_id")
    doc.pop("password_hash", None)
    doc.pop("sessions", None)
    return doc


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


security = HTTPBearer()


async def _fs_get(collection: str, doc_id: str) -> Optional[dict]:
    """Fetch a single Firestore document by ID."""
    snap = await db.collection(collection).document(doc_id).get()
    if not snap.exists:
        return None
    return {"id": snap.id, **snap.to_dict()}


async def _fs_query(collection: str, filters: list[tuple], order_by: str = None,
                    direction: str = ASCENDING, limit: int = 1000) -> list[dict]:
    """Run a Firestore query. filters = [(field, op, value), ...]"""
    ref = db.collection(collection)
    for field, op, value in filters:
        ref = ref.where(field, op, value)
    if order_by:
        from google.cloud.firestore_v1 import Query
        dir_ = Query.ASCENDING if direction == ASCENDING else Query.DESCENDING
        ref = ref.order_by(order_by, direction=dir_)
    ref = ref.limit(limit)
    docs = []
    async for snap in ref.stream():
        docs.append({"id": snap.id, **snap.to_dict()})
    return docs


async def _fs_find_one(collection: str, filters: list[tuple]) -> Optional[dict]:
    results = await _fs_query(collection, filters, limit=1)
    return results[0] if results else None


from google.cloud.firestore_v1 import ArrayUnion, ArrayRemove


def _uid(user: dict) -> str:
    """Return the user's string ID."""
    return user.get("user_id", user.get("id", ""))


def _cid(couple: dict) -> str:
    """Return the couple's string ID."""
    return couple.get("couple_id", couple.get("id", ""))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    user_id = None
    unverified_payload = None

    # 1. Try Clerk Token decoding
    try:
        unverified_payload = jwt.get_unverified_claims(token)
        if unverified_payload and "sub" in unverified_payload and (unverified_payload["sub"].startswith("user_") or str(unverified_payload.get("iss", "")).find("clerk") != -1):
            clerk_jwks_url = os.getenv("CLERK_JWKS_URL")
            if clerk_jwks_url:
                try:
                    from jwt import PyJWKClient
                    jwk_client = PyJWKClient(clerk_jwks_url)
                    signing_key = jwk_client.get_signing_key_from_jwt(token)
                    payload = jwt.decode(token, signing_key.key, algorithms=["RS256"], options={"verify_aud": False})
                    user_id = payload["sub"]
                except Exception:
                    user_id = unverified_payload["sub"]
            else:
                user_id = unverified_payload["sub"]
    except Exception:
        pass

    # 2. Fallback to custom HS256 JWT
    if not user_id:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload["sub"]
            session = await _fs_find_one("sessions", [("token", "==", token)])
            if not session:
                raise HTTPException(status_code=401, detail="Session revoked")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    # 3. Retrieve or auto-provision Firestore user profile
    user = await _fs_get("users", user_id)
    if not user:
        now = now_iso()
        email_str = unverified_payload.get("email", f"{user_id}@clerk.user") if unverified_payload and isinstance(unverified_payload, dict) else f"{user_id}@clerk.user"
        user_doc = {
            "user_id": user_id,
            "email": email_str,
            "name": "Clerk User",
            "couple_id": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.collection("users").document(user_id).set(user_doc)
        user = {"id": user_id, **user_doc}

    # Presence heartbeat
    try:
        await db.collection("users").document(user_id).update({"last_active_at": now_iso()})
    except Exception:
        pass

    return user


async def get_couple(user: dict) -> Optional[dict]:
    couple_id = user.get("couple_id")
    if not couple_id:
        return None
    return await _fs_get("couples", couple_id)


async def require_couple(user: dict) -> dict:
    """Raises 403 if user has no paired partner."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(403, detail={"reason": "not_paired", "message": "This feature requires connecting with your partner first."})
    return couple


async def get_partner(user: dict, couple: dict) -> Optional[dict]:
    members = couple.get("members", [])
    my_id = user.get("user_id", user.get("id", ""))
    partner_id = next((m for m in members if m != my_id), None)
    if not partner_id:
        return None
    return await _fs_get("users", partner_id)


def couple_filter(couple_id: str, extra: dict = None) -> dict:
    f = {"couple_id": couple_id, "deleted_at": None}
    if extra:
        f.update(extra)
    return f


def owner_or_couple_filter(user_id: str, couple_id: Optional[str], extra: dict = None) -> dict:
    if couple_id:
        f = {"couple_id": couple_id, "deleted_at": None}
    else:
        f = {"owner_id": user_id, "deleted_at": None}
    if extra:
        f.update(extra)
    return f


def doc_base(user: dict, couple: Optional[dict] = None) -> dict:
    now = now_iso()
    d = {
        "owner_id": user.get("user_id", user.get("id", "")),
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    if couple:
        d["couple_id"] = couple.get("couple_id", couple.get("id", ""))
    return d


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PairJoinRequest(BaseModel):
    code: str


class EventCreate(BaseModel):
    title: str
    start_dt: str
    end_dt: str
    all_day: bool = False
    description: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = "personal"
    visibility: str = "partner"
    attendees: list[str] = []
    recurrence: Optional[str] = "none"


class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    all_day: Optional[bool] = None
    description: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None
    visibility: Optional[str] = None
    attendees: Optional[list[str]] = None
    recurrence: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "medium"
    kind: str = "shared"
    category: Optional[str] = None
    assignee_id: Optional[str] = None
    recurring: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    kind: Optional[str] = None
    category: Optional[str] = None
    assignee_id: Optional[str] = None
    recurring: Optional[str] = None
    done: Optional[bool] = None


class RoutineCreate(BaseModel):
    name: str
    schedule: str
    kind: str = "shared"
    steps: list[dict] = []


class RoutineUpdate(BaseModel):
    name: Optional[str] = None
    schedule: Optional[str] = None
    kind: Optional[str] = None
    steps: Optional[list[dict]] = None
    active: Optional[bool] = None


class GoalCreate(BaseModel):
    title: str
    category: str
    target_value: Optional[float] = None
    current_value: float = 0
    unit: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None


class GoalProgress(BaseModel):
    value: float


class MemoryCreate(BaseModel):
    title: str
    content: Optional[str] = None
    memory_date: str
    media_url: Optional[str] = None
    tags: list[str] = []


class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    memory_date: Optional[str] = None
    media_url: Optional[str] = None
    tags: Optional[list[str]] = None


class JournalCreate(BaseModel):
    title: Optional[str] = None
    content: str
    mood: Optional[str] = None
    tags: list[str] = []
    shared: bool = False
    type: Optional[str] = None  # e.g. "dream"
    date: Optional[str] = None


class JournalUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[list[str]] = None
    shared: Optional[bool] = None


class OurJournalCreate(BaseModel):
    title: Optional[str] = None
    content: str
    mood: Optional[str] = None


class ReactRequest(BaseModel):
    emoji: str


class NoteCreate(BaseModel):
    text: str


class CareUpdate(BaseModel):
    when_stressed: list[str] = []
    feels_loved: list[str] = []
    difficult_day: list[str] = []
    notes: Optional[str] = None


class MoodCreate(BaseModel):
    value: int = Field(ge=1, le=10)
    note: Optional[str] = None


class OpenWhenCreate(BaseModel):
    label: str
    content: str
    media_url: Optional[str] = None


class OpenWhenUpdate(BaseModel):
    label: Optional[str] = None
    content: Optional[str] = None
    media_url: Optional[str] = None


class BucketListCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    target_date: Optional[str] = None
    priority: str = "medium"
    location: Optional[str] = None


class BucketListUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    target_date: Optional[str] = None
    priority: Optional[str] = None
    location: Optional[str] = None
    completed: Optional[bool] = None


class TripCreate(BaseModel):
    title: str
    date: str
    notes: Optional[str] = None
    packing_list: list[str] = []
    places: list[str] = []


class TripUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None
    packing_list: Optional[list[str]] = None
    places: Optional[list[str]] = None


class AvailabilityUpdate(BaseModel):
    status: str = Field(pattern="^(available|busy|focusing|sleeping|call|date|dnd)$")


class SharingSettingsUpdate(BaseModel):
    calendar: Optional[str] = None
    journal: Optional[str] = None
    mood: Optional[str] = None
    health: Optional[str] = None
    location: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None
    location_city: Optional[str] = None
    avatar_url: Optional[str] = None


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    existing = await _fs_find_one("users", [("email", "==", req.email)])
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    now = now_iso()
    user_id = make_id()
    user_doc = {
        "user_id": user_id,
        "email": req.email,
        "name": req.name,
        "password_hash": hash_password(req.password),
        "couple_id": None,
        "timezone": "UTC",
        "location_city": None,
        "avatar_url": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.collection("users").document(user_id).set(user_doc)

    token = create_token(user_id)
    session_id = make_id()
    await db.collection("sessions").document(session_id).set({
        "token": token,
        "user_id": user_id,
        "created_at": now,
    })

    return {"session_token": token, "user": serialize_user({**user_doc, "id": user_id})}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = await _fs_find_one("users", [("email", "==", req.email)])
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = user.get("user_id", user["id"])
    token = create_token(user_id)
    session_id = make_id()
    await db.collection("sessions").document(session_id).set({
        "token": token,
        "user_id": user_id,
        "created_at": now_iso(),
    })

    return {"session_token": token, "user": serialize_user(user)}


@app.post("/api/auth/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = await _fs_find_one("sessions", [("token", "==", token)])
    if session:
        await db.collection("sessions").document(session["id"]).delete()
    return {"ok": True}


@app.post("/api/auth/logout-all")
async def logout_all(user: dict = Depends(get_current_user)):
    user_id = user.get("user_id", user.get("id", ""))
    sessions = await _fs_query("sessions", [("user_id", "==", user_id)])
    for s in sessions:
        await db.collection("sessions").document(s["id"]).delete()
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)

@app.get("/api/me")
async def get_me_alias(user: dict = Depends(get_current_user)):
    """Alias for /api/auth/me — returns current user profile."""
    return serialize_user(user)

@app.put("/api/auth/password")
async def change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if not verify_password(req.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=403, detail="Incorrect current password")
    user_id = user.get("user_id", user.get("id", ""))
    await db.collection("users").document(user_id).update({"password_hash": hash_password(req.new_password)})
    return {"ok": True}

@app.get("/api/account/export")
async def export_data(user: dict = Depends(get_current_user)):
    user_id_str = _uid(user)
    result: dict = {"user": dict(user)}
    result["user"].pop("password_hash", None)

    couple = await get_couple(user)
    if couple:
        result["couple"] = couple

    for col_name in _ALL_USER_COLLECTIONS:
        try:
            by_owner = await _fs_query(col_name, [("owner_id", "==", user_id_str)])
            by_user = await _fs_query(col_name, [("user_id", "==", user_id_str)])
            merged = {d["id"]: d for d in by_owner + by_user}
            if merged:
                result[col_name] = list(merged.values())
        except Exception:
            pass

    return result


# ---------------------------------------------------------------------------
# PAIRING
# ---------------------------------------------------------------------------

def _gen_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@app.post("/api/pair/create")
async def pair_create(user: dict = Depends(get_current_user)):
    if user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Already paired")

    code = _gen_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    doc = {
        "code": code,
        "creator_id": _uid(user),
        "expires_at": expires_at.isoformat(),
        "created_at": now_iso(),
    }
    await db.collection("pair_codes").document(code).set(doc)
    return {"code": code, "expires_at": expires_at.isoformat()}


@app.post("/api/pair/join")
async def pair_join(req: PairJoinRequest, user: dict = Depends(get_current_user)):
    if user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Already paired")

    pair_doc = await _fs_get("pair_codes", req.code.upper())
    if not pair_doc:
        raise HTTPException(status_code=404, detail="Invalid code")
    expires_at_str = pair_doc["expires_at"]
    try:
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=410, detail="Code expired")
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Code expired")
    my_id = _uid(user)
    if pair_doc["creator_id"] == my_id:
        raise HTTPException(status_code=400, detail="Cannot pair with yourself")

    creator = await _fs_get("users", pair_doc["creator_id"])
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    if creator.get("couple_id"):
        raise HTTPException(status_code=400, detail="Creator already paired")

    now = now_iso()
    couple_id_str = make_id()
    couple_doc = {
        "couple_id": couple_id_str,
        "members": [pair_doc["creator_id"], my_id],
        "created_at": now,
        "updated_at": now,
        "anniversary": None,
    }
    await db.collection("couples").document(couple_id_str).set(couple_doc)

    await db.collection("users").document(pair_doc["creator_id"]).update({"couple_id": couple_id_str, "updated_at": now})
    await db.collection("users").document(my_id).update({"couple_id": couple_id_str, "updated_at": now})
    await db.collection("pair_codes").document(req.code.upper()).delete()

    return serialize(couple_doc, "couple_id")


@app.get("/api/pair/status")
async def pair_status(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"paired": False, "couple": None, "partner": None}

    partner = await get_partner(user, couple)
    return {
        "paired": True,
        "couple": serialize(couple, "couple_id"),
        "partner": serialize_user(partner) if partner else None,
    }


@app.delete("/api/pair")
async def unpair(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id_str = _cid(couple)
    now = now_iso()

    members = couple.get("members", [])
    for member_id in members:
        await db.collection("users").document(member_id).update({"couple_id": None, "updated_at": now})
    await db.collection("couples").document(couple_id_str).delete()
    return {"ok": True}


# ---------------------------------------------------------------------------
# DASHBOARD
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    partner = await get_partner(user, couple) if couple else None
    my_id = _uid(user)

    now = datetime.now(timezone.utc)
    events = []
    tasks = []
    goals = []
    mood = []
    trips = []

    if couple_id:
        raw_events = await _fs_query("events", [("couple_id", "==", couple_id), ("deleted_at", "==", None)], order_by="start_dt", direction=ASCENDING, limit=5)
        events = [serialize(d, "event_id") for d in raw_events if d.get("start_dt", "") >= now.isoformat()]

        raw_tasks = await _fs_query("tasks", [("couple_id", "==", couple_id), ("done", "==", False), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=10)
        tasks = [serialize(d, "task_id") for d in raw_tasks]

        raw_goals = await _fs_query("goals", [("couple_id", "==", couple_id), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=5)
        goals = [serialize(d, "goal_id") for d in raw_goals]

        thirty_ago = (now - timedelta(days=30)).isoformat()
        raw_mood = await _fs_query("mood", [("owner_id", "==", my_id), ("created_at", ">=", thirty_ago), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=30)
        mood = [serialize(d, "mood_id") for d in raw_mood]

        raw_trips = await _fs_query("trips", [("couple_id", "==", couple_id), ("deleted_at", "==", None)], order_by="date", direction=ASCENDING, limit=3)
        trips = [serialize(d, "trip_id") for d in raw_trips]

    return {
        "profile": serialize_user(user),
        "partner": serialize_user(partner) if partner else None,
        "couple": serialize(couple, "couple_id") if couple else None,
        "events": events,
        "tasks": tasks,
        "goals": goals,
        "mood": mood,
        "trips": trips,
    }


# ---------------------------------------------------------------------------
# EVENTS
# ---------------------------------------------------------------------------

def parse_iso(dt_str: str) -> datetime:
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    return datetime.fromisoformat(dt_str)


def expand_recurring_event(doc: dict, range_start: datetime, range_end: datetime) -> list[dict]:
    recurrence = doc.get("recurrence")
    if not recurrence or recurrence == "none":
        return [serialize(doc, "event_id")]

    orig_start = parse_iso(doc["start_dt"])
    orig_end = parse_iso(doc["end_dt"])
    duration = orig_end - orig_start

    # Fast forward if range_start is after orig_start
    curr_start = orig_start
    if curr_start < range_start:
        if recurrence == "daily":
            days_diff = (range_start - curr_start).days
            if days_diff > 0:
                curr_start += timedelta(days=days_diff)
        elif recurrence == "weekly":
            weeks_diff = (range_start - curr_start).days // 7
            if weeks_diff > 0:
                curr_start += timedelta(weeks=weeks_diff)
        elif recurrence == "monthly":
            months_diff = (range_start.year - curr_start.year) * 12 + range_start.month - curr_start.month
            if months_diff > 0:
                for _ in range(months_diff - 1):
                    next_month = curr_start.month + 1
                    next_year = curr_start.year
                    if next_month > 12:
                        next_month = 1
                        next_year += 1
                    try:
                        curr_start = curr_start.replace(year=next_year, month=next_month)
                    except ValueError:
                        import calendar
                        _, last_day = calendar.monthrange(next_year, next_month)
                        curr_start = curr_start.replace(year=next_year, month=next_month, day=last_day)
        elif recurrence == "yearly":
            years_diff = range_start.year - curr_start.year
            if years_diff > 0:
                try:
                    curr_start = curr_start.replace(year=curr_start.year + (years_diff - 1))
                except ValueError:
                    curr_start = curr_start.replace(year=curr_start.year + (years_diff - 1), day=28)

    curr_end = curr_start + duration
    occurrences = []
    iterations = 0
    while curr_start <= range_end and iterations < 100:
        iterations += 1
        if curr_end >= range_start:
            occ = serialize(doc, "event_id")
            if curr_start != orig_start:
                occ["id"] = f"{occ['id']}_{curr_start.date().isoformat()}"
            occ["start_dt"] = curr_start.isoformat().replace("+00:00", "Z")
            occ["end_dt"] = curr_end.isoformat().replace("+00:00", "Z")
            occurrences.append(occ)

        # Increment
        if recurrence == "daily":
            curr_start += timedelta(days=1)
            curr_end += timedelta(days=1)
        elif recurrence == "weekly":
            curr_start += timedelta(weeks=1)
            curr_end += timedelta(weeks=1)
        elif recurrence == "monthly":
            next_month = curr_start.month + 1
            next_year = curr_start.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            try:
                curr_start = curr_start.replace(year=next_year, month=next_month)
            except ValueError:
                import calendar
                _, last_day = calendar.monthrange(next_year, next_month)
                curr_start = curr_start.replace(year=next_year, month=next_month, day=last_day)
            curr_end = curr_start + duration
        elif recurrence == "yearly":
            try:
                curr_start = curr_start.replace(year=curr_start.year + 1)
            except ValueError:
                curr_start = curr_start.replace(year=curr_start.year + 1, day=28)
            curr_end = curr_start + duration
        else:
            break

    return occurrences


@app.get("/api/events")
async def list_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)

    if couple_id:
        docs = await _fs_query("events", [("couple_id", "==", couple_id), ("deleted_at", "==", None)])
    else:
        docs = await _fs_query("events", [("owner_id", "==", my_id), ("deleted_at", "==", None)])

    # Determine bounds as datetime
    range_start = parse_iso(start) if start else datetime.min.replace(tzinfo=timezone.utc)
    range_end = parse_iso(end) if end else datetime.max.replace(tzinfo=timezone.utc)

    result = []
    for doc in docs:
        recurrence = doc.get("recurrence")
        if not recurrence or recurrence == "none":
            # Filter non-recurring events by range
            doc_start = parse_iso(doc["start_dt"])
            doc_end = parse_iso(doc["end_dt"])
            if doc_start <= range_end and doc_end >= range_start:
                result.append(serialize(doc, "event_id"))
        else:
            # Expand recurring events
            result.extend(expand_recurring_event(doc, range_start, range_end))

    # Sort result by start_dt
    result.sort(key=lambda x: x["start_dt"])
    return result


@app.post("/api/events", status_code=201)
async def create_event(req: EventCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    event_id = make_id()
    doc = {**base, **req.model_dump(), "event_id": event_id}
    await db.collection("events").document(event_id).set(doc)
    return serialize(doc, "event_id")


@app.get("/api/events/{event_id}")
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("events", event_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Event not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return serialize(doc, "event_id")


@app.put("/api/events/{event_id}")
async def update_event(event_id: str, req: EventUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("events", event_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Event not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("events").document(event_id).update(update)
    updated = await _fs_get("events", event_id)
    return serialize(updated, "event_id")


@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("events", event_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Event not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("events").document(event_id).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.post("/api/calendar/sync-profile-events")
async def sync_profile_events(user: dict = Depends(get_current_user)):
    """Auto-create calendar events for anniversary and birthdays from couple profile."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)

    couple_id = _cid(couple)
    profile = await _fs_get("couple_profiles", couple_id)
    if not profile:
        return {"created": 0}

    created = 0
    current_year = datetime.now(timezone.utc).year
    my_id = _uid(user)

    async def ensure_event(date_str: str, title: str, category: str):
        nonlocal created
        if not date_str:
            return
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
            for year in [current_year, current_year + 1]:
                event_date = d.replace(year=year).strftime("%Y-%m-%d")
                existing = await _fs_find_one("events", [("couple_id", "==", couple_id), ("title", "==", title), ("date", "==", event_date)])
                if not existing:
                    event_id = make_id()
                    await db.collection("events").document(event_id).set({
                        "event_id": event_id,
                        "couple_id": couple_id,
                        "owner_id": my_id,
                        "title": title,
                        "start_dt": f"{event_date}T00:00:00Z",
                        "end_dt": f"{event_date}T23:59:00Z",
                        "all_day": True,
                        "category": category,
                        "visibility": "partner",
                        "auto_created": True,
                        "created_at": now_iso(),
                        "updated_at": now_iso(),
                        "deleted_at": None,
                    })
                    created += 1
        except Exception:
            pass

    if profile.get("anniversary"):
        await ensure_event(profile["anniversary"], "💍 Anniversary", "anniversary")
    if profile.get("my_birthday"):
        await ensure_event(profile["my_birthday"], "🎂 Your Birthday", "birthday")
    if profile.get("partner_birthday"):
        members = couple.get("members", [])
        partner_id = next((m for m in members if m != my_id), None)
        partner_name = "Partner"
        if partner_id:
            try:
                partner_doc = await _fs_get("users", partner_id)
                if partner_doc:
                    partner_name = partner_doc.get("name", "Partner").split()[0]
            except Exception:
                pass
        await ensure_event(profile["partner_birthday"], f"🎂 {partner_name}'s Birthday", "birthday")

    return {"created": created}


# ---------------------------------------------------------------------------
# TASKS
# ---------------------------------------------------------------------------

@app.get("/api/tasks")
async def list_tasks(
    done: Optional[str] = None,
    kind: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    if done is not None:
        filters.append(("done", "==", done.lower() == "true"))
    if kind:
        filters.append(("kind", "==", kind))
    docs = await _fs_query("tasks", filters, order_by="created_at", direction=DESCENDING)
    return [serialize(d, "task_id") for d in docs]


@app.get("/api/tasks/assigned-to-me")
async def tasks_assigned_to_me(user: dict = Depends(get_current_user)):
    """Tasks that the partner assigned to this user."""
    couple = await get_couple(user)
    if not couple:
        return []
    my_id = _uid(user)
    docs = await _fs_query("tasks", [
        ("couple_id", "==", _cid(couple)),
        ("assignee_id", "==", my_id),
        ("done", "==", False),
        ("deleted_at", "==", None),
    ])
    # filter out tasks the user assigned to themselves
    return [serialize(d, "task_id") for d in docs if d.get("owner_id") != my_id]


@app.post("/api/tasks", status_code=201)
async def create_task(req: TaskCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    task_id = make_id()
    doc = {**base, **req.model_dump(), "done": False, "completed_at": None, "task_id": task_id}
    await db.collection("tasks").document(task_id).set(doc)
    if req.assignee_id and req.assignee_id != _uid(user):
        name = user.get("name", "Your partner")
        asyncio.create_task(send_push_notification(req.assignee_id, f"📋 {name} assigned you a task", req.title[:80]))
    return serialize(doc, "task_id")


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: str, req: TaskUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("tasks", task_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("tasks").document(task_id).update(update)
    updated = await _fs_get("tasks", task_id)
    return serialize(updated, "task_id")


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("tasks", task_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("tasks").document(task_id).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.post("/api/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("tasks", task_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    new_done = not doc.get("done", False)
    update = {
        "done": new_done,
        "completed_at": now_iso() if new_done else None,
        "updated_at": now_iso(),
    }
    await db.collection("tasks").document(task_id).update(update)
    updated = await _fs_get("tasks", task_id)
    return serialize(updated, "task_id")


# ---------------------------------------------------------------------------
# ROUTINES
# ---------------------------------------------------------------------------

@app.get("/api/routines")
async def list_routines(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("routines", filters, order_by="created_at", direction=DESCENDING)
    return [serialize(d, "routine_id") for d in docs]


@app.post("/api/routines", status_code=201)
async def create_routine(req: RoutineCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    routine_id = make_id()
    doc = {**base, **req.model_dump(), "active": True, "routine_id": routine_id}
    await db.collection("routines").document(routine_id).set(doc)
    return serialize(doc, "routine_id")


@app.put("/api/routines/{routine_id}")
async def update_routine(routine_id: str, req: RoutineUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("routines", routine_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Routine not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("routines").document(routine_id).update(update)
    updated = await _fs_get("routines", routine_id)
    return serialize(updated, "routine_id")


@app.delete("/api/routines/{routine_id}")
async def delete_routine(routine_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("routines", routine_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Routine not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("routines").document(routine_id).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.post("/api/routines/{routine_id}/toggle")
async def toggle_routine(routine_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("routines", routine_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Routine not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("routines").document(routine_id).update({"active": not doc.get("active", True), "updated_at": now_iso()})
    updated = await _fs_get("routines", routine_id)
    return serialize(updated, "routine_id")


# ---------------------------------------------------------------------------
# GOALS
# ---------------------------------------------------------------------------

@app.get("/api/goals")
async def list_goals(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("goals", filters, order_by="created_at", direction=DESCENDING)
    return [serialize(d, "goal_id") for d in docs]


@app.post("/api/goals", status_code=201)
async def create_goal(req: GoalCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    goal_id = make_id()
    doc = {**base, **req.model_dump(), "completed": False, "goal_id": goal_id}
    await db.collection("goals").document(goal_id).set(doc)
    return serialize(doc, "goal_id")


@app.put("/api/goals/{goal_id}")
async def update_goal(goal_id: str, req: GoalUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("goals", goal_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("goals").document(goal_id).update(update)
    updated = await _fs_get("goals", goal_id)
    return serialize(updated, "goal_id")


@app.delete("/api/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("goals", goal_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("goals").document(goal_id).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.post("/api/goals/{goal_id}/progress")
async def update_goal_progress(goal_id: str, req: GoalProgress, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("goals", goal_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    target = doc.get("target_value")
    completed = (target is not None and req.value >= target)
    await db.collection("goals").document(goal_id).update({"current_value": req.value, "completed": completed, "updated_at": now_iso()})
    updated = await _fs_get("goals", goal_id)
    return serialize(updated, "goal_id")


# ---------------------------------------------------------------------------
# MEMORIES
# ---------------------------------------------------------------------------

@app.get("/api/memories")
async def list_memories(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("memories", filters, order_by="memory_date", direction=DESCENDING)
    return [serialize(d, "memory_id") for d in docs]


@app.post("/api/memories", status_code=201)
async def create_memory(req: MemoryCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    memory_id = make_id()
    doc = {**base, **req.model_dump(), "memory_id": memory_id}
    await db.collection("memories").document(memory_id).set(doc)
    # Notify partner
    my_id = _uid(user)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None) if couple else None
    if partner_id:
        name = user.get("name", "Your partner").split()[0]
        title = req.title if hasattr(req, 'title') and req.title else "a memory"
        asyncio.create_task(send_push_notification(
            partner_id,
            f"📸 {name} added a memory",
            f'"{title}" — tap to see it 💕'
        ))
    return serialize(doc, "memory_id")


@app.put("/api/memories/{memory_id}")
async def update_memory(memory_id: str, req: MemoryUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("memories", memory_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Memory not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("memories").document(memory_id).update(update)
    updated = await _fs_get("memories", memory_id)
    return serialize(updated, "memory_id")


@app.delete("/api/memories/{memory_id}")
async def delete_memory(memory_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("memories", memory_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Memory not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("memories").document(memory_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# JOURNAL
# ---------------------------------------------------------------------------

@app.get("/api/journal")
async def list_journal(
    shared: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    couple = await get_couple(user)
    my_id = _uid(user)

    if couple:
        partner = await get_partner(user, couple)
        partner_id = _uid(partner) if partner else None
        if shared and shared.lower() == "true":
            # only shared entries from both partners
            mine = await _fs_query("journal", [("owner_id", "==", my_id), ("shared", "==", True), ("deleted_at", "==", None)])
            partners = await _fs_query("journal", [("owner_id", "==", partner_id), ("shared", "==", True), ("deleted_at", "==", None)]) if partner_id else []
        else:
            mine = await _fs_query("journal", [("owner_id", "==", my_id), ("deleted_at", "==", None)])
            partners = await _fs_query("journal", [("owner_id", "==", partner_id), ("shared", "==", True), ("deleted_at", "==", None)]) if partner_id else []
        merged = {d["id"]: d for d in mine + partners}
        result = sorted(merged.values(), key=lambda d: d.get("created_at", ""), reverse=True)
    else:
        filters = [("owner_id", "==", my_id), ("deleted_at", "==", None)]
        if shared and shared.lower() == "true":
            filters.append(("shared", "==", True))
        result = await _fs_query("journal", filters, order_by="created_at", direction=DESCENDING)

    return [serialize(d, "journal_id") for d in result]


@app.post("/api/journal", status_code=201)
async def create_journal(req: JournalCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    journal_id = make_id()
    doc = {**base, **req.model_dump(), "journal_id": journal_id}
    await db.collection("journal").document(journal_id).set(doc)
    return serialize(doc, "journal_id")


@app.put("/api/journal/{journal_id}")
async def update_journal(journal_id: str, req: JournalUpdate, user: dict = Depends(get_current_user)):
    doc = await _fs_get("journal", journal_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("journal").document(journal_id).update(update)
    updated = await _fs_get("journal", journal_id)
    return serialize(updated, "journal_id")


@app.delete("/api/journal/{journal_id}")
async def delete_journal(journal_id: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("journal", journal_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("journal").document(journal_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# OUR JOURNAL (shared entries with reactions)
# ---------------------------------------------------------------------------

@app.get("/api/our-journal")
async def list_our_journal(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    docs = await _fs_query("journal", [("couple_id", "==", couple_id), ("shared", "==", True), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING)
    result = []
    for doc in docs:
        entry = serialize(doc, "journal_id")
        entry["author_id"] = doc.get("owner_id")
        entry["reactions"] = doc.get("reactions", {})
        result.append(entry)
    return result


@app.post("/api/our-journal", status_code=201)
async def create_our_journal(req: OurJournalCreate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    base = doc_base(user, couple)
    journal_id = make_id()
    doc = {**base, **req.model_dump(), "shared": True, "tags": [], "reactions": {}, "journal_id": journal_id}
    await db.collection("journal").document(journal_id).set(doc)
    entry = serialize(doc, "journal_id")
    entry["author_id"] = doc["owner_id"]
    return entry


@app.post("/api/our-journal/{journal_id}/react")
async def react_our_journal(journal_id: str, req: ReactRequest, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    doc = await _fs_get("journal", journal_id)
    if not doc or doc.get("couple_id") != couple_id or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Entry not found")
    reactions = doc.get("reactions", {})
    my_id = _uid(user)
    users = reactions.get(req.emoji, [])
    if my_id in users:
        users = [u for u in users if u != my_id]
    else:
        users = users + [my_id]
    if users:
        reactions[req.emoji] = users
    else:
        reactions.pop(req.emoji, None)
    await db.collection("journal").document(journal_id).update({"reactions": reactions, "updated_at": now_iso()})
    return {"ok": True, "reactions": reactions}


# ---------------------------------------------------------------------------
# LOVE NOTES (couple's own words — shown on Home instead of stock quotes)
# ---------------------------------------------------------------------------

@app.get("/api/notes")
async def list_notes(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("notes", filters, order_by="created_at", direction=DESCENDING)
    result = []
    for doc in docs:
        entry = serialize(doc, "note_id")
        entry["author_id"] = doc.get("owner_id")
        result.append(entry)
    return result


@app.post("/api/notes", status_code=201)
async def create_note(req: NoteCreate, user: dict = Depends(get_current_user)):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    couple = await get_couple(user)
    base = doc_base(user, couple)
    note_id = make_id()
    doc = {**base, "text": text, "note_id": note_id}
    await db.collection("notes").document(note_id).set(doc)
    entry = serialize(doc, "note_id")
    entry["author_id"] = doc["owner_id"]
    return entry


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("notes", note_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Note not found")
    if doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("notes").document(note_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# CARE PREFERENCES
# ---------------------------------------------------------------------------

@app.get("/api/care")
async def get_care(user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    doc = await _fs_get("care", my_id)
    if not doc:
        return {"owner_id": my_id, "when_stressed": [], "feels_loved": [], "difficult_day": [], "notes": None}
    return serialize(doc, "care_id")


@app.put("/api/care")
async def update_care(req: CareUpdate, user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    now = now_iso()
    existing = await _fs_get("care", my_id)
    if existing:
        await db.collection("care").document(my_id).update({**req.model_dump(), "updated_at": now})
    else:
        await db.collection("care").document(my_id).set({
            "care_id": my_id,
            "owner_id": my_id,
            "created_at": now,
            "updated_at": now,
            **req.model_dump(),
        })
    updated = await _fs_get("care", my_id)
    return serialize(updated, "care_id")


# ---------------------------------------------------------------------------
# MOOD
# ---------------------------------------------------------------------------

@app.get("/api/mood")
async def list_mood(user: dict = Depends(get_current_user)):
    thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    docs = await _fs_query("mood", [("owner_id", "==", _uid(user)), ("created_at", ">=", thirty_ago), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING)
    return [serialize(d, "mood_id") for d in docs]


@app.post("/api/mood", status_code=201)
async def create_mood(req: MoodCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    mood_id = make_id()
    doc = {**base, **req.model_dump(), "mood_id": mood_id}
    await db.collection("mood").document(mood_id).set(doc)

    # Notify partner of mood update
    if couple:
        partner = await get_partner(user, couple)
        if partner:
            partner_id = _uid(partner)
            value = req.value if hasattr(req, 'value') else doc.get('value', 5)
            emoji = "😊" if value >= 7 else "😐" if value >= 4 else "😔"
            sender_name = user.get("name", "Your partner").split()[0]
            asyncio.create_task(send_push_notification(
                partner_id,
                f"{emoji} {sender_name} logged their mood",
                "Tap to check in on them 💕"
            ))

    return serialize(doc, "mood_id")


@app.get("/api/mood/partner")
async def partner_mood(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        raise HTTPException(status_code=404, detail="No partner")

    partner_id = _uid(partner)
    # Check sharing settings
    settings = await _fs_get("sharing_settings", partner_id)
    if settings and settings.get("mood") == "private":
        raise HTTPException(status_code=403, detail="Partner mood is private")

    docs = await _fs_query("mood", [("owner_id", "==", partner_id), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=1)
    if not docs:
        return None
    return serialize(docs[0], "mood_id")


# ---------------------------------------------------------------------------
# OPEN WHEN LETTERS
# ---------------------------------------------------------------------------

@app.get("/api/open-when")
async def list_open_when_sent(user: dict = Depends(get_current_user)):
    docs = await _fs_query("open_when", [("owner_id", "==", _uid(user)), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING)
    return [serialize(d, "open_when_id") for d in docs]


@app.get("/api/open-when/received")
async def list_open_when_received(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        return []
    docs = await _fs_query("open_when", [("owner_id", "==", _uid(partner)), ("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING)
    return [serialize(d, "open_when_id") for d in docs]


@app.post("/api/open-when", status_code=201)
async def create_open_when(req: OpenWhenCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    letter_id = make_id()
    doc = {**base, **req.model_dump(), "opened": False, "opened_at": None, "open_when_id": letter_id}
    await db.collection("open_when").document(letter_id).set(doc)
    return serialize(doc, "open_when_id")


@app.put("/api/open-when/{open_when_id}")
async def update_open_when(open_when_id: str, req: OpenWhenUpdate, user: dict = Depends(get_current_user)):
    doc = await _fs_get("open_when", open_when_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("open_when").document(open_when_id).update(update)
    updated = await _fs_get("open_when", open_when_id)
    return serialize(updated, "open_when_id")


@app.delete("/api/open-when/{open_when_id}")
async def delete_open_when(open_when_id: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("open_when", open_when_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("open_when").document(open_when_id).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.post("/api/open-when/{open_when_id}/open")
async def open_open_when(open_when_id: str, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        raise HTTPException(status_code=404, detail="No partner")

    doc = await _fs_get("open_when", open_when_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Not found")
    # Only the recipient (partner of creator) can open
    if doc.get("owner_id") != _uid(partner):
        raise HTTPException(status_code=403, detail="Forbidden")

    await db.collection("open_when").document(open_when_id).update({"opened": True, "opened_at": now_iso(), "updated_at": now_iso()})

    # Notify the original author that their letter was opened
    author_id = doc.get("owner_id")
    if author_id and author_id != _uid(user):
        reader_name = user.get("name", "Your partner").split()[0]
        trigger = doc.get("label", "a letter")
        asyncio.create_task(send_push_notification(
            author_id,
            f"💌 {reader_name} opened your letter",
            f'They opened: "When {trigger}" 💕'
        ))

    return {"ok": True}


# ---------------------------------------------------------------------------
# BUCKET LIST
# ---------------------------------------------------------------------------

@app.get("/api/bucket-list")
async def list_bucket(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("bucket_list", filters, order_by="created_at", direction=DESCENDING)
    return [serialize(d, "bucket_id") for d in docs]


@app.post("/api/bucket-list", status_code=201)
async def create_bucket(req: BucketListCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    item_id = make_id()
    doc = {**base, **req.model_dump(), "completed": False, "completed_at": None, "bucket_id": item_id}
    await db.collection("bucket_list").document(item_id).set(doc)
    return serialize(doc, "bucket_id")


@app.put("/api/bucket-list/{bucket_id}")
async def update_bucket(bucket_id: str, req: BucketListUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("bucket_list", bucket_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if update.get("completed") is True and not doc.get("completed"):
        update["completed_at"] = now_iso()
    update["updated_at"] = now_iso()
    await db.collection("bucket_list").document(bucket_id).update(update)
    updated = await _fs_get("bucket_list", bucket_id)
    return serialize(updated, "bucket_id")


@app.delete("/api/bucket-list/{bucket_id}")
async def delete_bucket(bucket_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("bucket_list", bucket_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("bucket_list").document(bucket_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# TRIPS / COUNTDOWNS
# ---------------------------------------------------------------------------

@app.get("/api/trips")
async def list_trips(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    my_id = _uid(user)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)] if couple_id else [("owner_id", "==", my_id), ("deleted_at", "==", None)]
    docs = await _fs_query("trips", filters, order_by="date", direction=ASCENDING)
    return [serialize(d, "trip_id") for d in docs]


@app.post("/api/trips", status_code=201)
async def create_trip(req: TripCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    base = doc_base(user, couple)
    trip_id = make_id()
    doc = {**base, **req.model_dump(), "trip_id": trip_id}
    await db.collection("trips").document(trip_id).set(doc)
    return serialize(doc, "trip_id")


@app.put("/api/trips/{trip_id}")
async def update_trip(trip_id: str, req: TripUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("trips", trip_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("trips").document(trip_id).update(update)
    updated = await _fs_get("trips", trip_id)
    return serialize(updated, "trip_id")


@app.delete("/api/trips/{trip_id}")
async def delete_trip(trip_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else None
    doc = await _fs_get("trips", trip_id)
    if not doc or doc.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc.get("couple_id") != couple_id and doc.get("owner_id") != _uid(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.collection("trips").document(trip_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# AVAILABILITY
# ---------------------------------------------------------------------------

@app.get("/api/availability")
async def get_availability(user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    my_doc = await _fs_get("availability", my_id)
    my_status = my_doc.get("status", "available") if my_doc else "available"

    couple = await get_couple(user)
    partner_status = None
    partner_updated_at = None
    if couple:
        partner = await get_partner(user, couple)
        if partner:
            p_doc = await _fs_get("availability", _uid(partner))
            if p_doc:
                partner_status = p_doc.get("status")
                partner_updated_at = p_doc.get("updated_at")

    return {
        "my_status": my_status,
        "partner_status": partner_status,
        "partner_updated_at": partner_updated_at,
    }


@app.put("/api/availability")
async def update_availability(req: AvailabilityUpdate, user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    now = now_iso()
    await db.collection("availability").document(my_id).set({"owner_id": my_id, "status": req.status, "updated_at": now}, merge=True)
    return {"ok": True}


# ---------------------------------------------------------------------------
# SHARING SETTINGS
# ---------------------------------------------------------------------------

SHARING_DEFAULTS = {
    "calendar": "partner",
    "journal": "private",
    "mood": "partner",
    "health": "private",
    "location": "private",
}


@app.get("/api/settings/sharing")
async def get_sharing(user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    doc = await _fs_get("sharing_settings", my_id)
    if not doc:
        return {**SHARING_DEFAULTS, "owner_id": my_id}
    return serialize(doc, "settings_id")


@app.put("/api/settings/sharing")
async def update_sharing(req: SharingSettingsUpdate, user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    now = now_iso()
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    update_data["updated_at"] = now
    existing = await _fs_get("sharing_settings", my_id)
    if existing:
        await db.collection("sharing_settings").document(my_id).update(update_data)
    else:
        await db.collection("sharing_settings").document(my_id).set({
            "owner_id": my_id,
            "created_at": now,
            **SHARING_DEFAULTS,
            **update_data,
        })
    updated = await _fs_get("sharing_settings", my_id)
    return serialize(updated, "settings_id")


# ---------------------------------------------------------------------------
# PROFILE
# ---------------------------------------------------------------------------

@app.put("/api/profile")
async def update_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.collection("users").document(my_id).update(update)
    updated = await _fs_get("users", my_id)
    return serialize_user(updated)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Couple Profile  (anniversary, birthdays, first-met, pet names)
# ---------------------------------------------------------------------------

class CoupleProfileUpdate(BaseModel):
    first_met: Optional[str] = None
    anniversary: Optional[str] = None
    my_birthday: Optional[str] = None
    partner_birthday: Optional[str] = None
    my_pet_name: Optional[str] = None
    partner_pet_name: Optional[str] = None
    photo_url: Optional[str] = None


@app.get("/api/couple-profile")
async def get_couple_profile(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {}
    couple_id = _cid(couple)
    profile = await _fs_get("couple_profiles", couple_id)
    if not profile:
        profile = {}

    # Dynamically fetch birthdays if not set in couple profile
    my_id = _uid(user)
    if "my_birthday" not in profile or not profile["my_birthday"]:
        profile["my_birthday"] = user.get("birthday")

    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
    if partner_id:
        partner = await _fs_get("users", partner_id)
        if partner and ("partner_birthday" not in profile or not profile["partner_birthday"]):
            profile["partner_birthday"] = partner.get("birthday")

    # Dynamically fetch love languages
    ll_doc = await _fs_get("love_languages", my_id)
    profile["my_love_language"] = ll_doc.get("result") if ll_doc else None

    if partner_id:
        pll_doc = await _fs_get("love_languages", partner_id)
        profile["partner_love_language"] = pll_doc.get("result") if pll_doc else None

    return profile


@app.put("/api/couple-profile")
async def update_couple_profile(req: CoupleProfileUpdate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    data = {k: v for k, v in req.dict().items() if v is not None}
    data["couple_id"] = couple_id
    data["updated_at"] = now_iso()
    await db.collection("couple_profiles").document(couple_id).set(data, merge=True)
    return data


# ---------------------------------------------------------------------------
# Media upload
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_media(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")

    resource_type = "video" if ext in {".mp4", ".mov"} else "auto"
    url = await _upload_to_cloudinary(data, file.filename or f"upload{ext}", resource_type)
    return {"url": url}


# ---------------------------------------------------------------------------
# Messages  (simple couple chat — poll-based)
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    content: str
    msg_type: str = "text"          # text | image | audio
    media_url: Optional[str] = None
    duration_s: Optional[int] = None
    reply_to: Optional[dict] = None


@app.get("/api/messages")
async def list_messages(
    since: Optional[str] = Query(None),
    limit: int = Query(60),
    user: dict = Depends(get_current_user),
):
    from collections import defaultdict
    couple = await require_couple(user)
    couple_id = _cid(couple)
    filters = [("couple_id", "==", couple_id)]
    if since:
        filters.append(("created_at", ">", since))
    docs = await _fs_query("messages", filters, order_by="created_at", direction=ASCENDING, limit=limit)
    # Mark all partner messages as read
    my_id = _uid(user)
    for d in docs:
        if d.get("user_id") != my_id and d.get("read_at") is None:
            await db.collection("messages").document(d["id"]).update({"read_at": now_iso()})
    # Fetch reactions for these messages
    msg_ids = [d["id"] for d in docs if d.get("id")]
    reactions_by_msg: dict = defaultdict(list)
    for mid in msg_ids:
        r_docs = await _fs_query("message_reactions", [("message_id", "==", mid)])
        for r in r_docs:
            reactions_by_msg[mid].append({"emoji": r["emoji"], "user_id": r["user_id"]})
    result = []
    for d in docs:
        s = serialize(d)
        s["content"] = _dec(s.get("content") or "")
        s["media_url"] = _dec(s.get("media_url") or "") if s.get("media_url") else s.get("media_url")
        s["read_at"] = d.get("read_at")
        s["reply_to"] = d.get("reply_to")
        s["reactions"] = reactions_by_msg.get(d.get("id", ""), [])
        result.append(s)
    return result


@app.post("/api/messages", status_code=201)
async def send_message(req: MessageCreate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    message_id = make_id()
    doc = {
        "couple_id": _cid(couple),
        "user_id": _uid(user),
        "sender_name": user.get("name", ""),
        "content": _enc(req.content.strip()),
        "msg_type": req.msg_type,
        "media_url": _enc(req.media_url) if req.media_url else req.media_url,
        "duration_s": req.duration_s,
        "reply_to": req.reply_to,
        "created_at": now_iso(),
        "id": message_id,
        "message_id": message_id,
    }
    await db.collection("messages").document(message_id).set(doc)
    # Notify partner
    _partner = await get_partner(user, couple)
    _partner_id = _uid(_partner) if _partner else None
    if _partner_id:
        sender = user.get("name", "Your partner").split()[0]
        content_preview = _dec(doc["content"])[:60] if doc.get("content") else "sent a message"
        asyncio.create_task(send_push_notification(_partner_id, f"💬 {sender}", content_preview))
    return {k: v for k, v in doc.items()}


@app.get("/api/messages/pinned")
async def get_pinned_message(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    docs = await _fs_query("messages", [("couple_id", "==", _cid(couple)), ("pinned", "==", True)], limit=1)
    return serialize(docs[0]) if docs else None


@app.post("/api/messages/{message_id}/pin")
async def toggle_pin_message(message_id: str, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    msgs = await _fs_query("messages", [("id", "==", message_id), ("couple_id", "==", couple_id)], limit=1)
    if not msgs:
        raise HTTPException(status_code=404, detail="Message not found")
    msg = msgs[0]
    new_pinned = not msg.get("pinned", False)
    # Only one pinned message per couple — clear others when pinning.
    if new_pinned:
        pinned_docs = await _fs_query("messages", [("couple_id", "==", couple_id), ("pinned", "==", True)])
        for pd in pinned_docs:
            await db.collection("messages").document(pd["id"]).update({"pinned": False})
    await db.collection("messages").document(message_id).update({"pinned": new_pinned})
    return {"pinned": new_pinned}


# ---------------------------------------------------------------------------
# Snaps  (ephemeral photo messages — view once)
# ---------------------------------------------------------------------------

class SnapCreate(BaseModel):
    photo_url: str
    caption: Optional[str] = None

@app.get("/api/snaps")
async def list_snaps(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    docs = await _fs_query("snaps", [("couple_id", "==", _cid(couple)), ("recipient_id", "==", _uid(user)), ("seen", "==", False)], order_by="created_at", direction=DESCENDING, limit=20)
    return [serialize(d) for d in docs]

@app.post("/api/snaps", status_code=201)
async def send_snap(req: SnapCreate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        raise HTTPException(status_code=404, detail="No partner")
    partner_id = _uid(partner)
    snap_id = make_id()
    doc = {
        "couple_id": _cid(couple),
        "sender_id": _uid(user),
        "sender_name": user.get("name", ""),
        "recipient_id": partner_id,
        "photo_url": req.photo_url,
        "caption": req.caption or "",
        "seen": False,
        "created_at": now_iso(),
        "id": snap_id,
    }
    await db.collection("snaps").document(snap_id).set(doc)
    return doc

@app.post("/api/snaps/{snap_id}/seen")
async def mark_snap_seen(snap_id: str, user: dict = Depends(get_current_user)):
    snap = await _fs_get("snaps", snap_id)
    if snap and snap.get("recipient_id") == _uid(user):
        await db.collection("snaps").document(snap_id).update({"seen": True})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Location  (share current city with partner)
# ---------------------------------------------------------------------------

class LocationUpdate(BaseModel):
    city: str
    lat: Optional[float] = None
    lng: Optional[float] = None

@app.put("/api/location")
async def update_location(req: LocationUpdate, user: dict = Depends(get_current_user)):
    await db.collection("users").document(_uid(user)).update({"location_city": req.city, "location_lat": req.lat, "location_lng": req.lng, "location_updated_at": now_iso()})
    return {"ok": True}

@app.get("/api/presence/partner")
async def partner_presence(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        return {"online": False, "last_active_at": None}
    last = partner.get("last_active_at")
    online = False
    if last:
        try:
            dt = datetime.fromisoformat(last)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            online = (datetime.now(timezone.utc) - dt) < timedelta(seconds=90)
        except (ValueError, TypeError):
            online = False
    return {"online": online, "last_active_at": last, "name": partner.get("name")}


@app.get("/api/location/me")
async def my_location(user: dict = Depends(get_current_user)):
    return {
        "city": user.get("location_city") or user.get("city"),
        "lat":  user.get("location_lat"),
        "lng":  user.get("location_lng"),
        "updated_at": user.get("location_updated_at"),
    }


@app.get("/api/location/partner")
async def partner_location(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    partner = await get_partner(user, couple)
    if not partner:
        return {}
    return {
        "city": partner.get("location_city"),
        "lat":  partner.get("location_lat"),
        "lng":  partner.get("location_lng"),
        "updated_at": partner.get("location_updated_at"),
    }


# ---------------------------------------------------------------------------
# Streak
# ---------------------------------------------------------------------------

@app.get("/api/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    members = couple.get("members", [])

    activity_dates: set = set()

    for member_id in members:
        mood_docs = await _fs_query("mood", [("owner_id", "==", member_id)])
        for doc in mood_docs:
            ca = doc.get("created_at", "")
            if ca:
                activity_dates.add(ca[:10])

    msg_docs = await _fs_query("messages", [("couple_id", "==", couple_id)])
    for doc in msg_docs:
        ca = doc.get("created_at", "")
        if ca:
            activity_dates.add(ca[:10])

    today = datetime.now(timezone.utc).date()
    streak = 0
    last_checkin = max(activity_dates) if activity_dates else None
    check = today
    while True:
        if check.isoformat() in activity_dates:
            streak += 1
            check -= timedelta(days=1)
        else:
            break

    return {"streak": streak, "last_checkin": last_checkin}


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------

class ReactionCreate(BaseModel):
    emoji: str

@app.post("/api/messages/{message_id}/react")
async def toggle_reaction(message_id: str, req: ReactionCreate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    existing = await _fs_find_one("message_reactions", [("message_id", "==", message_id), ("user_id", "==", uid), ("emoji", "==", req.emoji)])
    if existing:
        await db.collection("message_reactions").document(existing["id"]).delete()
        return {"action": "removed"}
    reaction_id = make_id()
    await db.collection("message_reactions").document(reaction_id).set({
        "reaction_id": reaction_id,
        "message_id": message_id,
        "user_id": uid,
        "emoji": req.emoji,
        "created_at": now_iso(),
    })
    return {"action": "added"}

@app.get("/api/messages/{message_id}/reactions")
async def list_reactions(message_id: str, user: dict = Depends(get_current_user)):
    docs = await _fs_query("message_reactions", [("message_id", "==", message_id)])
    return [serialize(d) for d in docs]


# ---------------------------------------------------------------------------
# Wishlist
# ---------------------------------------------------------------------------

class WishlistCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    url: Optional[str] = None
    price: Optional[float] = None

class WishlistUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    url: Optional[str] = None
    price: Optional[float] = None
    claimed_by: Optional[str] = None

@app.get("/api/wishlist")
async def list_wishlist(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    docs = await _fs_query("wishlists", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING)
    return [serialize(d) for d in docs]

@app.post("/api/wishlist", status_code=201)
async def create_wishlist(req: WishlistCreate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    item_id = make_id()
    doc = {**doc_base(user, couple), "title": req.title, "notes": req.notes, "url": req.url, "price": req.price, "claimed_by": None, "item_id": item_id}
    await db.collection("wishlists").document(item_id).set(doc)
    return serialize(doc)

@app.put("/api/wishlist/{item_id}")
async def update_wishlist(item_id: str, req: WishlistUpdate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    item = await _fs_get("wishlists", item_id)
    if not item or item.get("couple_id") != _cid(couple) or item.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    updates = {k: v for k, v in req.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.collection("wishlists").document(item_id).update(updates)
    return {"ok": True}

@app.delete("/api/wishlist/{item_id}")
async def delete_wishlist(item_id: str, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    item = await _fs_get("wishlists", item_id)
    if not item or item.get("couple_id") != _cid(couple) or item.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.collection("wishlists").document(item_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Date ideas
# ---------------------------------------------------------------------------

_DATE_IDEAS = [
    {"id": "1",  "title": "Sunset picnic",          "emoji": "🌅", "description": "Pack a blanket and snacks and watch the sunset together.",           "budget": "free",   "mood": "romantic",    "duration": "2 hours"},
    {"id": "2",  "title": "Stargazing night",        "emoji": "🌟", "description": "Find a dark spot away from the city and stargaze.",                 "budget": "free",   "mood": "romantic",    "duration": "2 hours"},
    {"id": "3",  "title": "Cook a new recipe",       "emoji": "🍳", "description": "Pick a cuisine you've never tried and cook it together.",           "budget": "cheap",  "mood": "cozy",        "duration": "2 hours"},
    {"id": "4",  "title": "Board game marathon",     "emoji": "🎲", "description": "Pull out every board game you own and play all evening.",           "budget": "free",   "mood": "fun",         "duration": "3 hours"},
    {"id": "5",  "title": "Hiking adventure",        "emoji": "🥾", "description": "Find a nearby trail and spend the day outdoors.",                   "budget": "free",   "mood": "adventurous", "duration": "4 hours"},
    {"id": "6",  "title": "Movie marathon",          "emoji": "🎬", "description": "Pick a director or franchise and watch back-to-back films.",        "budget": "free",   "mood": "cozy",        "duration": "5 hours"},
    {"id": "7",  "title": "Fancy dinner out",        "emoji": "🍷", "description": "Dress up and go to a restaurant you've been meaning to try.",       "budget": "splurge","mood": "romantic",    "duration": "3 hours"},
    {"id": "8",  "title": "Escape room",             "emoji": "🔐", "description": "Test your teamwork at a local escape room.",                        "budget": "cheap",  "mood": "fun",         "duration": "1.5 hours"},
    {"id": "9",  "title": "Spa day at home",         "emoji": "🛁", "description": "Face masks, candles, and a relaxing bath together.",                "budget": "cheap",  "mood": "cozy",        "duration": "2 hours"},
    {"id": "10", "title": "Farmers market stroll",  "emoji": "🥦", "description": "Explore a local farmers market and buy ingredients for dinner.",     "budget": "cheap",  "mood": "fun",         "duration": "2 hours"},
    {"id": "11", "title": "Bike ride",              "emoji": "🚴", "description": "Rent or use your bikes for a scenic ride around town.",              "budget": "free",   "mood": "adventurous", "duration": "2 hours"},
    {"id": "12", "title": "Museum visit",           "emoji": "🏛️", "description": "Spend the afternoon wandering through a local museum.",             "budget": "cheap",  "mood": "cozy",        "duration": "3 hours"},
    {"id": "13", "title": "Couples painting class", "emoji": "🎨", "description": "Sign up for a guided paint-and-sip class.",                         "budget": "cheap",  "mood": "fun",         "duration": "2 hours"},
    {"id": "14", "title": "Karaoke night",          "emoji": "🎤", "description": "Belt out your favourite songs at a karaoke bar.",                   "budget": "cheap",  "mood": "fun",         "duration": "3 hours"},
    {"id": "15", "title": "Write love letters",     "emoji": "💌", "description": "Sit down and write heartfelt letters to each other, then read aloud.","budget": "free",  "mood": "romantic",    "duration": "1 hour"},
    {"id": "16", "title": "Rock climbing",          "emoji": "🧗", "description": "Try an indoor climbing gym for the first time.",                     "budget": "cheap",  "mood": "adventurous", "duration": "2 hours"},
    {"id": "17", "title": "Drive-in movie",         "emoji": "🚗", "description": "If one's nearby, catch a film at a drive-in cinema.",               "budget": "cheap",  "mood": "romantic",    "duration": "3 hours"},
    {"id": "18", "title": "Build a puzzle",         "emoji": "🧩", "description": "Tackle a challenging 1000-piece puzzle together.",                   "budget": "free",   "mood": "cozy",        "duration": "4 hours"},
    {"id": "19", "title": "Kayaking or canoeing",   "emoji": "🛶", "description": "Rent a kayak or canoe and paddle through a lake or river.",          "budget": "cheap",  "mood": "adventurous", "duration": "3 hours"},
    {"id": "20", "title": "Bake together",          "emoji": "🍪", "description": "Bake cookies, brownies, or bread and enjoy the results.",            "budget": "cheap",  "mood": "cozy",        "duration": "2 hours"},
    {"id": "21", "title": "Comedy show",            "emoji": "😂", "description": "Catch a live stand-up comedy show at a local venue.",               "budget": "cheap",  "mood": "fun",         "duration": "2 hours"},
    {"id": "22", "title": "Couples massage",        "emoji": "💆", "description": "Book a professional couples massage.",                               "budget": "splurge","mood": "romantic",    "duration": "1.5 hours"},
    {"id": "23", "title": "Go-karting",             "emoji": "🏎️", "description": "Race each other at an indoor or outdoor go-kart track.",            "budget": "cheap",  "mood": "fun",         "duration": "1.5 hours"},
    {"id": "24", "title": "Watch the sunrise",      "emoji": "🌄", "description": "Set an early alarm and find a hilltop to watch the sunrise.",        "budget": "free",   "mood": "romantic",    "duration": "2 hours"},
    {"id": "25", "title": "Thrift store challenge", "emoji": "👗", "description": "Each pick an outfit for the other under $10 at a thrift store.",     "budget": "cheap",  "mood": "fun",         "duration": "2 hours"},
    {"id": "26", "title": "Take a dance class",     "emoji": "💃", "description": "Sign up for a beginner salsa or swing dance class.",                "budget": "cheap",  "mood": "romantic",    "duration": "1.5 hours"},
    {"id": "27", "title": "Camping overnight",      "emoji": "⛺", "description": "Pitch a tent and spend the night under the stars.",                  "budget": "cheap",  "mood": "adventurous", "duration": "overnight"},
    {"id": "28", "title": "Read together",          "emoji": "📚", "description": "Pick a short story or chapter and read it aloud to each other.",     "budget": "free",   "mood": "cozy",        "duration": "1 hour"},
    {"id": "29", "title": "Trivia night",           "emoji": "🧠", "description": "Find a local bar hosting trivia night and compete together.",        "budget": "cheap",  "mood": "fun",         "duration": "2 hours"},
    {"id": "30", "title": "Boat tour",              "emoji": "⛵", "description": "Book a scenic boat or ferry tour of your city's waterfront.",        "budget": "splurge","mood": "romantic",    "duration": "2 hours"},
    {"id": "31", "title": "Pottery class",          "emoji": "🏺", "description": "Channel your inner Ghost moment at a pottery studio.",              "budget": "cheap",  "mood": "romantic",    "duration": "2 hours"},
    {"id": "32", "title": "Volunteer together",     "emoji": "🤝", "description": "Sign up for a local charity or community volunteer day.",            "budget": "free",   "mood": "cozy",        "duration": "3 hours"},
    {"id": "33", "title": "Hot air balloon",        "emoji": "🎈", "description": "Splurge on a hot air balloon ride at sunrise.",                     "budget": "splurge","mood": "adventurous", "duration": "3 hours"},
    {"id": "34", "title": "Backyard fire pit",      "emoji": "🔥", "description": "Light a fire pit, make s'mores, and talk all night.",               "budget": "free",   "mood": "cozy",        "duration": "3 hours"},
    {"id": "35", "title": "Amusement park",         "emoji": "🎡", "description": "Spend a day riding roller coasters and eating funnel cake.",         "budget": "splurge","mood": "fun",         "duration": "6 hours"},
    {"id": "36", "title": "Scavenger hunt",         "emoji": "🗺️", "description": "Create clues around the city or your home for each other.",         "budget": "free",   "mood": "fun",         "duration": "2 hours"},
    {"id": "37", "title": "Winery or brewery tour", "emoji": "🍺", "description": "Visit a local winery or craft brewery for a tasting.",              "budget": "cheap",  "mood": "romantic",    "duration": "2 hours"},
    {"id": "38", "title": "Paragliding or zip-line","emoji": "🪂", "description": "Try an adrenaline activity together for the first time.",            "budget": "splurge","mood": "adventurous", "duration": "3 hours"},
    {"id": "39", "title": "Brunch date",            "emoji": "🥞", "description": "Find a cosy cafe and linger over a long, lazy brunch.",             "budget": "cheap",  "mood": "cozy",        "duration": "2 hours"},
    {"id": "40", "title": "Photo walk",             "emoji": "📷", "description": "Explore the city taking photos -- pick your favourite together.",    "budget": "free",   "mood": "adventurous", "duration": "2 hours"},
]

@app.get("/api/date-ideas")
async def get_date_ideas(
    mood: Optional[str] = Query(None),
    budget: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    import random
    pool = _DATE_IDEAS
    if mood:
        pool = [i for i in pool if i["mood"] == mood]
    if budget:
        pool = [i for i in pool if i["budget"] == budget]
    if not pool:
        pool = _DATE_IDEAS
    return random.sample(pool, min(3, len(pool)))


# ---------------------------------------------------------------------------
# Love language quiz
# ---------------------------------------------------------------------------

class LoveLanguageAnswers(BaseModel):
    answers: List[int]

_LOVE_LANGUAGES = ["words", "acts", "gifts", "time", "touch"]

@app.get("/api/love-language")
async def get_love_language(user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    doc = await _fs_get("love_languages", my_id)
    return {"result": doc["result"] if doc else None}

@app.post("/api/love-language")
async def post_love_language(req: LoveLanguageAnswers, user: dict = Depends(get_current_user)):
    if len(req.answers) != 5:
        raise HTTPException(status_code=400, detail="Exactly 5 answers required")
    result = _LOVE_LANGUAGES[req.answers.index(max(req.answers))]
    my_id = _uid(user)
    await db.collection("love_languages").document(my_id).set({"user_id": my_id, "result": result, "answers": req.answers, "updated_at": now_iso()}, merge=True)
    return {"result": result}


# ---------------------------------------------------------------------------
# Mood history
# ---------------------------------------------------------------------------

@app.get("/api/mood/history")
async def mood_history(days: int = Query(30), user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    members = couple.get("members", [])
    uid = _uid(user)
    partner_id = next((m for m in members if m != uid), None)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    async def _daily(owner_id: str):
        daily: dict = {}
        docs = await _fs_query("mood", [("owner_id", "==", owner_id), ("created_at", ">=", cutoff)], order_by="created_at", direction=ASCENDING)
        for doc in docs:
            d = doc.get("created_at", "")[:10]
            val = doc.get("mood") or doc.get("value") or doc.get("rating")
            if d and val is not None:
                daily[d] = val
        return [{"date": k, "value": v} for k, v in sorted(daily.items())]

    mine = await _daily(uid)
    partner = await _daily(partner_id) if partner_id else []
    return {"mine": mine, "partner": partner}


class WeeklyCheckinSubmit(BaseModel):
    connection: int
    best_moment: str
    appreciation: str
    mood: int


@app.post("/api/weekly-checkin")
async def post_weekly_checkin(req: WeeklyCheckinSubmit, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, detail="Not connected")

    today = datetime.now(timezone.utc)
    year, week, _ = today.isocalendar()
    week_key = f"{year}-W{week:02d}"
    my_id = _uid(user)
    couple_id = _cid(couple)
    checkin_id = f"{couple_id}_{my_id}_{week_key}"

    doc = {
        "couple_id": couple_id,
        "user_id": my_id,
        "week_key": week_key,
        "connection": req.connection,
        "best_moment": req.best_moment,
        "appreciation": req.appreciation,
        "mood": req.mood,
        "created_at": now_iso(),
    }
    await db.collection("weekly_checkins").document(checkin_id).set(doc, merge=True)

    # Also log to mood history
    mood_id = make_id()
    await db.collection("mood").document(mood_id).set({
        "mood_id": mood_id,
        "owner_id": my_id,
        "couple_id": couple_id,
        "value": req.mood,
        "note": f"Weekly check-in: connection {req.connection}/5",
        "created_at": now_iso(),
        "deleted_at": None
    })

    # Notify partner
    partner = await get_partner(user, couple)
    if partner:
        asyncio.create_task(send_push_notification(
            _uid(partner),
            "📝 Weekly check-in complete!",
            f"{user.get('name', 'Your partner').split()[0]} has submitted their check-in."
        ))

    return {"ok": True}


@app.get("/api/weekly-checkin/status")
async def get_weekly_checkin_status(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"my_checkin": None, "partner_checkin": None}

    partner = await get_partner(user, couple)

    today = datetime.now(timezone.utc)
    year, week, _ = today.isocalendar()
    week_key = f"{year}-W{week:02d}"
    my_id = _uid(user)
    couple_id = _cid(couple)

    my_doc = await _fs_get("weekly_checkins", f"{couple_id}_{my_id}_{week_key}")

    partner_doc = None
    if partner:
        p_id = _uid(partner)
        partner_doc = await _fs_get("weekly_checkins", f"{couple_id}_{p_id}_{week_key}")

    return {
        "my_checkin": serialize(my_doc) if my_doc else None,
        "partner_checkin": serialize(partner_doc) if partner_doc else None
    }


class SharedNoteUpdate(BaseModel):
    content: str


@app.get("/api/shared-note")
async def get_shared_note(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    doc = await _fs_get("shared_notes", couple_id)
    if not doc:
        return {"content": "", "updated_at": None, "updated_by": None}
    return {
        "content": doc.get("content", ""),
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by")
    }


@app.post("/api/shared-note")
async def update_shared_note(body: SharedNoteUpdate, user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    await db.collection("shared_notes").document(couple_id).set({
        "couple_id": couple_id,
        "content": body.content,
        "updated_at": now_iso(),
        "updated_by": _uid(user)
    }, merge=True)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@app.get("/api/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    uid = _uid(user)

    messages_sent = len(await _fs_query("messages", [("couple_id", "==", couple_id), ("user_id", "==", uid)]))
    memories_count = len(await _fs_query("memories", [("couple_id", "==", couple_id), ("deleted_at", "==", None)]))
    goals_completed = len(await _fs_query("goals", [("couple_id", "==", couple_id), ("done", "==", True)]))
    moods_logged = len(await _fs_query("mood", [("owner_id", "==", uid)]))
    try:
        letters_sent = len(await _fs_query("open_when", [("couple_id", "==", couple_id)]))
    except Exception:
        letters_sent = 0

    days_together = 0
    anniversary = couple.get("anniversary") or couple.get("created_at")
    if anniversary:
        try:
            start = datetime.fromisoformat(anniversary[:10])
            days_together = (datetime.now(timezone.utc).replace(tzinfo=None) - start).days
        except (ValueError, TypeError):
            days_together = 0

    return {
        "messages_sent": messages_sent,
        "memories_count": memories_count,
        "goals_completed": goals_completed,
        "moods_logged": moods_logged,
        "days_together": max(0, days_together),
        "letters_sent": letters_sent,
    }

@app.get("/api/stats/summary")
async def stats_summary(user: dict = Depends(get_current_user)):
    """Quick stats for the Us tab: messages this week, rituals this week, total memories."""
    couple = await get_couple(user)
    if not couple:
        return {"messages_week": 0, "rituals_week": 0, "memories_total": 0}
    couple_id = _cid(couple)
    week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    messages_week, rituals_week, memories_total = await asyncio.gather(
        _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", week_ago)]),
        _fs_query("rituals", [("couple_id", "==", couple_id), ("created_at", ">=", week_ago)]),
        _fs_query("memories", [("couple_id", "==", couple_id)]),
    )
    return {
        "messages_week": len(messages_week),
        "rituals_week": len(rituals_week),
        "memories_total": len(memories_total),
    }


# ---------------------------------------------------------------------------
# Rituals (goodnight / goodmorning)
# ---------------------------------------------------------------------------

class RitualCreate(BaseModel):
    type: str  # "goodnight" | "goodmorning"

@app.post("/api/ritual")
async def send_ritual(req: RitualCreate, user: dict = Depends(get_current_user)):
    if req.type not in ("goodnight", "goodmorning"):
        raise HTTPException(status_code=400, detail="type must be 'goodnight' or 'goodmorning'")
    couple = await require_couple(user)
    couple_id = _cid(couple)
    uid = _uid(user)
    today = datetime.now(timezone.utc).date().isoformat()
    ritual_id = make_id()
    await db.collection("rituals").document(ritual_id).set({
        "ritual_id": ritual_id,
        "couple_id": couple_id,
        "user_id": uid,
        "type": req.type,
        "date": today,
        "created_at": now_iso(),
    })
    members = couple.get("members", [])
    partner_id = next((m for m in members if m != uid), None)
    emoji = "🌙" if req.type == "goodnight" else "☀️"
    sender_name = user.get("name", "Your partner")
    nudge = f"{emoji} {sender_name} sent you a {req.type}!"
    if partner_id:
        msg_id = make_id()
        await db.collection("messages").document(msg_id).set({
            "message_id": msg_id,
            "id": msg_id,
            "couple_id": couple_id,
            "user_id": uid,
            "sender_name": sender_name,
            "content": nudge,
            "msg_type": "ritual",
            "media_url": None,
            "duration_s": None,
            "created_at": now_iso(),
        })
        _ritual_emoji = "🌙" if req.type == "goodnight" else "☀️"
        asyncio.create_task(send_push_notification(
            partner_id,
            f"{_ritual_emoji} {sender_name}",
            f"sent you a {req.type}! Open the app to see 💕"
        ))
    return {"ok": True, "type": req.type}

@app.get("/api/ritual/today")
async def ritual_today(user: dict = Depends(get_current_user)):
    couple = await require_couple(user)
    couple_id = _cid(couple)
    uid = _uid(user)
    members = couple.get("members", [])
    partner_id = next((m for m in members if m != uid), None)
    today = datetime.now(timezone.utc).date().isoformat()

    async def _sent(user_id: str, rtype: str) -> bool:
        docs = await _fs_query("rituals", [("couple_id", "==", couple_id), ("user_id", "==", user_id), ("type", "==", rtype), ("date", "==", today)], limit=1)
        return len(docs) > 0

    return {
        "sent_goodnight": await _sent(uid, "goodnight"),
        "sent_goodmorning": await _sent(uid, "goodmorning"),
        "partner_sent_goodnight": await _sent(partner_id, "goodnight") if partner_id else False,
        "partner_sent_goodmorning": await _sent(partner_id, "goodmorning") if partner_id else False,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "soulsync"}


# ---------------------------------------------------------------------------
# Push token registration
# ---------------------------------------------------------------------------

class PushTokenRegister(BaseModel):
    token: str
    platform: str = "expo"

@app.post("/api/push-token")
async def register_push_token(req: PushTokenRegister, user: dict = Depends(get_current_user)):
    """Store/update the Expo push token for this user."""
    my_id = _uid(user)
    await db.collection("push_tokens").document(my_id).set({"user_id": my_id, "token": req.token, "platform": req.platform, "updated_at": now_iso()}, merge=True)
    return {"ok": True}

@app.delete("/api/push-token")
async def remove_push_token(user: dict = Depends(get_current_user)):
    await db.collection("push_tokens").document(_uid(user)).delete()
    return {"ok": True}


async def send_push_notification(user_id: str, title: str, body: str, data: dict = {}):
    """Send an Expo push notification to a user. Non-fatal — logs errors."""
    try:
        notif_id = make_id()
        await db.collection("notifications").document(notif_id).set({
            "notif_id": notif_id,
            "user_id": user_id,
            "title": title,
            "body": body,
            "data": data,
            "created_at": now_iso(),
            "read": False
        })
    except Exception:
        pass

    try:
        doc = await _fs_get("push_tokens", user_id)
        if not doc:
            return
        token = doc["token"]
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "data": data, "sound": "chime.wav"},
                timeout=5,
            )
    except Exception:
        pass


@app.get("/api/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await _fs_query("notifications", [("user_id", "==", _uid(user))], order_by="created_at", direction=DESCENDING, limit=100)
    return [serialize(d) for d in docs]


@app.post("/api/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    unread = await _fs_query("notifications", [("user_id", "==", my_id), ("read", "==", False)])
    for n in unread:
        await db.collection("notifications").document(n["id"]).update({"read": True})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Read receipts
# ---------------------------------------------------------------------------

@app.post("/api/messages/{message_id}/read")
async def mark_message_read(message_id: str, user: dict = Depends(get_current_user)):
    my_id = _uid(user)
    msg = await _fs_get("messages", message_id)
    if msg and msg.get("sender_id") != my_id:
        await db.collection("messages").document(message_id).update({"read_at": now_iso()})
    return {"ok": True}


@app.post("/api/messages/read")
async def mark_all_messages_read(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    my_id = _uid(user)
    couple_id = _cid(couple)
    unread = await _fs_query("messages", [("couple_id", "==", couple_id), ("sender_id", "!=", my_id), ("read_at", "==", None)])
    for m in unread:
        await db.collection("messages").document(m["id"]).update({"read_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Typing indicator
# ---------------------------------------------------------------------------

_typing_state: dict[str, dict] = {}  # couple_id -> {user_id, expires_at}


@app.post("/api/typing")
async def set_typing(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    couple_id = _cid(couple)
    import time
    _typing_state[couple_id] = {"user_id": _uid(user), "expires_at": time.time() + 4}
    return {"ok": True}


@app.get("/api/typing")
async def get_typing(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"typing": False, "user_id": None}
    couple_id = _cid(couple)
    import time
    state = _typing_state.get(couple_id)
    if not state or state["expires_at"] < time.time():
        return {"typing": False, "user_id": None}
    if state["user_id"] == _uid(user):
        return {"typing": False, "user_id": None}
    return {"typing": True, "user_id": state["user_id"]}


# ---------------------------------------------------------------------------
# Scheduled messages
# ---------------------------------------------------------------------------

class ScheduledMsgCreate(BaseModel):
    content: str
    send_at: str  # ISO datetime
    msg_type: str = "text"


@app.post("/api/messages/scheduled", status_code=201)
async def schedule_message(req: ScheduledMsgCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    sched_id = make_id()
    doc = {
        "sched_id": sched_id, "couple_id": _cid(couple), "user_id": _uid(user),
        "sender_name": user["name"], "content": _enc(req.content),
        "msg_type": req.msg_type, "send_at": req.send_at,
        "sent": False, "created_at": now_iso(),
    }
    await db.collection("scheduled_messages").document(sched_id).set(doc)
    return {"id": sched_id, "send_at": req.send_at}


@app.get("/api/messages/scheduled")
async def list_scheduled(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    my_id = _uid(user)
    couple_id = _cid(couple)
    docs = await _fs_query("scheduled_messages", [("couple_id", "==", couple_id), ("user_id", "==", my_id), ("sent", "==", False)], order_by="send_at", limit=50)
    return [{"id": d["id"], "content": _dec(d["content"]), "send_at": d["send_at"], "msg_type": d.get("msg_type", "text")} for d in docs]


@app.delete("/api/messages/scheduled/{sid}")
async def delete_scheduled(sid: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("scheduled_messages", sid)
    if doc and doc.get("user_id") == _uid(user):
        await db.collection("scheduled_messages").document(sid).delete()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Groq AI endpoints
# ---------------------------------------------------------------------------

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"

_PROMPTS_DIR = _os.path.join(_os.path.dirname(__file__), "prompts")


def _load_prompt(name: str) -> str:
    """Load a prompt MD file. Falls back to empty string if not found."""
    try:
        with open(_os.path.join(_PROMPTS_DIR, f"{name}.md"), "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


async def _groq(system: str, user_msg: str) -> str:
    if not GROQ_API_KEY:
        return "Add GROQ_API_KEY to .env to enable AI features."
    async with httpx.AsyncClient() as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_msg}], "max_tokens": 300},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


@app.get("/api/ai/journal-prompt")
async def ai_journal_prompt(user: dict = Depends(get_current_user)):
    prompt = await _groq(
        "You are a warm, thoughtful journaling coach for couples in long-distance relationships. Give one specific, emotionally rich journaling prompt. Be concise — one or two sentences max.",
        "Give me a new journaling prompt about my relationship."
    )
    return {"prompt": prompt}


@app.get("/api/ai/date-suggestion")
async def ai_date_suggestion(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    days = 0
    if couple:
        from datetime import datetime
        try:
            days = (datetime.utcnow() - datetime.fromisoformat(couple.get("created_at", "").replace("Z", ""))).days
        except Exception:
            pass
    suggestion = await _groq(
        "You are a creative date-night planner for couples. Suggest one specific, creative virtual or in-person date idea. Be concise and fun.",
        f"We have been together for {days} days. Suggest a date idea."
    )
    return {"suggestion": suggestion}


@app.post("/api/ai/date-idea")
async def ai_date_idea(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    days = 0
    if couple:
        try:
            from datetime import datetime
            days = (datetime.utcnow() - datetime.fromisoformat(couple.get("created_at", "").replace("Z", ""))).days
        except Exception:
            pass
    system = "You are a creative date planner for couples in long distance relationships. Suggest ONE creative virtual date idea. Be specific, practical, and romantic. Format: Title (emoji) | Duration | 2-3 sentence description."
    idea = await _groq(system, f"Couple has been together {days} days. Generate a unique virtual or in-person date idea they probably haven't tried.")
    return {"idea": idea}


class DatePlanRequest(BaseModel):
    title: str
    description: str


@app.post("/api/ai/date-plan")
async def ai_date_plan(req: DatePlanRequest, user: dict = Depends(get_current_user)):
    system = (
        "You are Aria, a creative and romantic relationship assistant. "
        "Create a detailed, step-by-step plan for the following date idea. "
        "Provide: 1. A timeline/schedule of the date, 2. Preparation Checklist (supplies, downloads, setup), "
        "3. Conversation Prompts/Icebreakers to keep things interactive, 4. A special touch to make it romantic. "
        "Keep the plan fun, practical, and highly engaging. Format nicely using markdown lists and headings."
    )
    prompt = f"Date Idea: {req.title}\nDescription: {req.description}"
    plan = await _groq(system, prompt)
    return {"plan": plan}


@app.get("/api/ai/weekly-summary")
async def ai_weekly_summary(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)

    couple_id = _cid(couple)
    my_id = _uid(user)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Gather week's data
    msgs, moods, rituals, memories = await asyncio.gather(
        _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", week_ago)]),
        _fs_query("mood", [("owner_id", "==", my_id), ("created_at", ">=", week_ago)], limit=20),
        _fs_query("rituals", [("couple_id", "==", couple_id), ("created_at", ">=", week_ago)], limit=20),
        _fs_query("memories", [("couple_id", "==", couple_id), ("created_at", ">=", week_ago)], limit=5),
    )
    msgs_count = len(msgs)

    mood_avg = sum(m.get("value", 5) for m in moods) / len(moods) if moods else None

    context = f"""Week data:
- Messages exchanged: {msgs_count}
- Mood average: {f'{mood_avg:.1f}/10' if mood_avg else 'not logged'}
- Rituals completed: {len(rituals)} (goodnight/goodmorning)
- New memories added: {len(memories)}
"""

    system = _load_prompt("aria_weekly_summary")
    summary = await _groq(system, context)
    return {"summary": summary, "generated_at": now_iso()}


# ---------------------------------------------------------------------------
# OurSpace AI endpoints (Aria)
# ---------------------------------------------------------------------------

class ChatSuggestRequest(BaseModel):
    messages: list[dict]  # [{role: "user"|"partner", content: str}]


@app.post("/api/ai/chat-suggest")
async def chat_suggest(req: ChatSuggestRequest, user: dict = Depends(get_current_user)):
    system = _load_prompt("aria_chat_suggest")
    conv = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in req.messages[-5:]])
    raw = await _groq(system, f"Conversation:\n{conv}\n\nSuggest 3 replies:")
    suggestions = [s.strip() for s in raw.strip().split('\n') if s.strip()][:3]
    return {"suggestions": suggestions}


class ConflictCheckRequest(BaseModel):
    messages: list[dict]


@app.post("/api/ai/conflict-check")
async def conflict_check(req: ConflictCheckRequest, user: dict = Depends(get_current_user)):
    system = _load_prompt("aria_conflict_check")
    conv = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in req.messages[-10:]])
    raw = await _groq(system, conv)
    try:
        import json as _json
        start = raw.find('{')
        end = raw.rfind('}') + 1
        return _json.loads(raw[start:end])
    except Exception:
        return {"tension": False, "level": "low", "suggestion": ""}


@app.get("/api/ai/dream-analysis")
async def dream_analysis(user: dict = Depends(get_current_user)):
    # Fetch dream journal entries (type="dream" in journal collection)
    dreams = await _fs_query("journal_entries", [("owner_id", "==", _uid(user)), ("type", "==", "dream")], order_by="created_at", direction=DESCENDING, limit=10)

    if len(dreams) < 2:
        return {"analysis": "Log a few more dreams and I'll start finding patterns for you 🌙"}

    entries_text = "\n---\n".join([f"Date: {d.get('date', '')}\n{d.get('content', '')}" for d in dreams])
    system = _load_prompt("aria_dream_analysis")
    analysis = await _groq(system, entries_text)
    return {"analysis": analysis, "entry_count": len(dreams)}


class FestivalMsgRequest(BaseModel):
    occasion: str
    partner_name: str


@app.post("/api/ai/festival-message")
async def festival_message(req: FestivalMsgRequest, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    days = 0
    if couple:
        try:
            days = (datetime.now(timezone.utc) - datetime.fromisoformat(couple.get("created_at", "").replace("Z", ""))).days
        except Exception:
            pass

    system = _load_prompt("aria_festival_message")
    prompt = f"Occasion: {req.occasion}\nPartner's name: {req.partner_name}\nDays together: {days}\nContext: LDR couple"
    msg = await _groq(system, prompt)
    return {"message": msg}


# ---------------------------------------------------------------------------
# Couple quiz
# ---------------------------------------------------------------------------

_QUIZ_QUESTIONS = [
    {"id": 1, "q": "What is my partner's favourite food?", "category": "lifestyle"},
    {"id": 2, "q": "What would my partner do on a perfect lazy day?", "category": "lifestyle"},
    {"id": 3, "q": "What is my partner most afraid of?", "category": "deep"},
    {"id": 4, "q": "What's my partner's love language?", "category": "relationship"},
    {"id": 5, "q": "What song reminds my partner of us?", "category": "fun"},
    {"id": 6, "q": "Where does my partner dream of travelling?", "category": "travel"},
    {"id": 7, "q": "What does my partner find most attractive about me?", "category": "relationship"},
    {"id": 8, "q": "What is my partner's biggest life goal?", "category": "deep"},
    {"id": 9, "q": "What's my partner's go-to comfort food?", "category": "lifestyle"},
    {"id": 10, "q": "What movie could my partner watch a hundred times?", "category": "fun"},
]


class QuizAnswer(BaseModel):
    question_id: int
    my_answer: str
    actual: Optional[str] = None


@app.get("/api/quiz/questions")
async def get_quiz_questions():
    return _QUIZ_QUESTIONS


@app.post("/api/quiz/answer")
async def submit_quiz_answer(req: QuizAnswer, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    couple_id = _cid(couple)
    my_id = _uid(user)
    qa_doc_id = f"{couple_id}_{my_id}_{req.question_id}"
    await db.collection("quiz_answers").document(qa_doc_id).set({"couple_id": couple_id, "user_id": my_id, "question_id": req.question_id, "my_answer": req.my_answer, "actual": req.actual, "updated_at": now_iso()}, merge=True)
    return {"ok": True}


@app.get("/api/quiz/results")
async def get_quiz_results(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("quiz_answers", [("couple_id", "==", _cid(couple))], limit=200)
    return [{"question_id": d["question_id"], "user_id": d["user_id"], "my_answer": d.get("my_answer"), "actual": d.get("actual")} for d in docs]


class QuizAnswerCreate(BaseModel):
    question: str
    category: str
    answer: str


@app.post("/api/quiz/save")
async def save_quiz_answer(body: QuizAnswerCreate, user: dict = Depends(get_current_user)):
    qa_id = make_id()
    doc = {
        "qa_id": qa_id,
        "owner_id": _uid(user),
        "question": body.question,
        "category": body.category,
        "answer": body.answer,
        "created_at": now_iso(),
    }
    await db.collection("quiz_answers_v2").document(qa_id).set(doc)
    couple = await get_couple(user)
    if couple:
        my_id = _uid(user)
        partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
        if partner_id:
            await send_push_notification(
                partner_id,
                "💬 New answer from your partner",
                f'"{body.question[:40]}..."',
            )
    return {"ok": True}


@app.get("/api/quiz/compare")
async def get_quiz_compare(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []

    my_id = _uid(user)
    partner = await get_partner(user, couple)
    partner_id = _uid(partner) if partner else None

    my_answers = await _fs_query("quiz_answers_v2", [("owner_id", "==", my_id)], limit=500)
    partner_answers = []
    if partner_id:
        partner_answers = await _fs_query("quiz_answers_v2", [("owner_id", "==", partner_id)], limit=500)
        
    partner_map = {d["question"]: d for d in partner_answers}
    
    comparisons = []
    for my_ans in my_answers:
        q = my_ans["question"]
        if q in partner_map:
            p_ans = partner_map[q]
            comparisons.append({
                "question": q,
                "category": my_ans.get("category", "fun"),
                "my_answer": my_ans["answer"],
                "partner_answer": p_ans["answer"],
                "created_at": my_ans.get("created_at")
            })
            
    return comparisons


# ---------------------------------------------------------------------------
# Would-you-rather + Truth or Dare
# ---------------------------------------------------------------------------

import random as _random

_WYR = [
    "Live without music OR without movies?",
    "Always be 10 min late OR always be 20 min early?",
    "Only text OR only call for a year?",
    "Travel to the past OR the future?",
    "Know when you'll die OR how you'll die?",
    "Be always cold OR always hot?",
    "Lose all your memories OR never make new ones?",
    "Have no phone for a month OR no internet for a month?",
    "Always say what you think OR never speak again?",
    "Meet your future kids OR your past grandparents?",
]

_TOD = [
    {"type": "truth", "text": "What's one thing you've never told me?"},
    {"type": "truth", "text": "What's your biggest relationship fear?"},
    {"type": "truth", "text": "What's the most embarrassing thing you've done for love?"},
    {"type": "dare",  "text": "Send me a voice message saying three things you love about me."},
    {"type": "dare",  "text": "Draw a portrait of me and send a photo."},
    {"type": "truth", "text": "What's a habit of mine you secretly love?"},
    {"type": "dare",  "text": "Send me the last photo in your camera roll."},
    {"type": "truth", "text": "When did you first realise you liked me?"},
    {"type": "dare",  "text": "Send me a good morning voice message right now."},
    {"type": "truth", "text": "What's one thing you wish we did more of?"},
]


@app.get("/api/fun/wyr")
async def would_you_rather():
    return {"question": _random.choice(_WYR)}


@app.get("/api/fun/tod")
async def truth_or_dare(type: Optional[str] = None):
    pool = [t for t in _TOD if not type or t["type"] == type] or _TOD
    return _random.choice(pool)


# ---------------------------------------------------------------------------
# Timeline / milestones
# ---------------------------------------------------------------------------

class MilestoneCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD
    emoji: Optional[str] = "✨"
    note: Optional[str] = None


@app.get("/api/milestones")
async def list_milestones(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("milestones", [("couple_id", "==", _cid(couple))], order_by="date", limit=200)
    return [{"id": d["id"], "title": d["title"], "date": d["date"], "emoji": d.get("emoji", "✨"), "note": d.get("note")} for d in docs]


@app.post("/api/milestones", status_code=201)
async def create_milestone(req: MilestoneCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    mid = make_id()
    doc = {"milestone_id": mid, "couple_id": _cid(couple), "title": req.title, "date": req.date, "emoji": req.emoji, "note": req.note, "created_at": now_iso()}
    await db.collection("milestones").document(mid).set(doc)
    return {"id": mid}


@app.delete("/api/milestones/{mid}")
async def delete_milestone(mid: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    await db.collection("milestones").document(mid).delete()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Shared todo / grocery list
# ---------------------------------------------------------------------------

class TodoCreate(BaseModel):
    text: str
    list_type: str = "todo"  # "todo" or "grocery"
    title: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None


@app.get("/api/todos")
async def list_todos(list_type: str = "todo", user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("todos", [("couple_id", "==", _cid(couple)), ("list_type", "==", list_type), ("deleted_at", "==", None)], order_by="created_at", limit=200)
    return [{"id": d["id"], "text": d["text"], "done": d.get("done", False), "done_by": d.get("done_by"), "list_type": d["list_type"]} for d in docs]


@app.post("/api/todos", status_code=201)
async def create_todo(req: TodoCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    tid = make_id()
    my_id = _uid(user)
    doc = {
        "todo_id": tid,
        "couple_id": _cid(couple),
        "owner_id": my_id,
        "text": req.text,
        "title": req.title or req.text,
        "list_type": req.list_type,
        "done": False,
        "done_by": None,
        "assignee_id": req.assignee_id,
        "due_date": req.due_date,
        "created_at": now_iso(),
        "deleted_at": None,
    }
    await db.collection("todos").document(tid).set(doc)

    # Notify partner if a task was assigned to them
    if req.assignee_id and req.assignee_id != my_id:
        name = user.get("name", "Your partner").split()[0]
        text_preview = req.text if len(req.text) <= 50 else req.text[:50] + "..."
        asyncio.create_task(send_push_notification(
            req.assignee_id,
            f"🎯 Task assigned by {name}",
            text_preview
        ))

    return {"id": tid}


@app.get("/api/todos/assigned-to-me")
async def todos_assigned_to_me(user: dict = Depends(get_current_user)):
    """Todos that the partner assigned to this user (have a due_date and assignee)."""
    my_id = _uid(user)
    docs = await _fs_query("todos", [("assignee_id", "==", my_id), ("done", "==", False), ("deleted_at", "==", None)], limit=100)
    docs = [d for d in docs if d.get("due_date")]
    return [{"id": d["id"], "title": d.get("title", d.get("text", "")), "due_date": d.get("due_date"), "assigned_by": d.get("owner_id")} for d in docs]


@app.patch("/api/todos/{tid}/toggle")
async def toggle_todo(tid: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("todos", tid)
    if not doc:
        raise HTTPException(404)
    new_done = not doc.get("done", False)
    await db.collection("todos").document(tid).update({"done": new_done, "done_by": _uid(user) if new_done else None})
    return {"done": new_done}


@app.delete("/api/todos/{tid}")
async def delete_todo(tid: str, user: dict = Depends(get_current_user)):
    await db.collection("todos").document(tid).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Expense splitting
# ---------------------------------------------------------------------------

class ExpenseCreate(BaseModel):
    title: str
    amount: float
    paid_by: str  # "me" or "partner"
    split: str = "50/50"  # "50/50", "all_me", "all_partner"
    date: Optional[str] = None
    category: Optional[str] = "general"


@app.get("/api/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"items": [], "balance": 0}
    docs = await _fs_query("expenses", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=200)
    items = [{"id": d["id"], "title": d["title"], "amount": d["amount"], "paid_by": d["paid_by"], "split": d.get("split", "50/50"), "date": d.get("date"), "category": d.get("category", "general")} for d in docs]
    balance = 0.0
    for it in items:
        amt = it["amount"]
        split = it["split"]
        if split == "50/50":
            half = amt / 2
            if it["paid_by"] == "me":
                balance += half
            else:
                balance -= half
        elif split == "all_me":
            if it["paid_by"] == "partner":
                balance -= amt
        elif split == "all_partner":
            if it["paid_by"] == "me":
                balance += amt
    return {"items": items, "balance": round(balance, 2)}


@app.post("/api/expenses", status_code=201)
async def create_expense(req: ExpenseCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    eid = make_id()
    doc = {"expense_id": eid, "couple_id": _cid(couple), "owner_id": _uid(user), "title": req.title, "amount": req.amount, "paid_by": req.paid_by, "split": req.split, "date": req.date or now_iso()[:10], "category": req.category, "created_at": now_iso(), "deleted_at": None}
    await db.collection("expenses").document(eid).set(doc)
    return {"id": eid}


@app.delete("/api/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    await db.collection("expenses").document(eid).update({"deleted_at": now_iso()})
    return {"ok": True}


@app.get("/api/expenses/summary")
async def expenses_summary(user: dict = Depends(get_current_user)):
    """Return monthly totals and balance."""
    from datetime import datetime
    from collections import defaultdict
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)

    now = datetime.utcnow()
    month_prefix = now.strftime("%Y-%m")
    couple_id = _cid(couple)

    # Get last settlement
    settlements = await _fs_query("settlements", [("couple_id", "==", couple_id)], order_by="settled_at", direction=DESCENDING, limit=1)
    last_settlement = settlements[0] if settlements else None
    since = last_settlement["settled_at"] if last_settlement else "2020-01-01"

    # All expenses since last settlement
    docs = await _fs_query("expenses", [("couple_id", "==", couple_id), ("created_at", ">=", since), ("deleted_at", "==", None)], limit=1000)

    my_id = _uid(user)
    my_total = sum(d.get("amount", 0) for d in docs if d.get("paid_by") == "me" and d.get("owner_id") == my_id)
    partner_total = sum(d.get("amount", 0) for d in docs if not (d.get("paid_by") == "me" and d.get("owner_id") == my_id))
    balance = my_total - partner_total  # positive = partner owes me, negative = I owe partner

    # This month only
    month_docs = [d for d in docs if d.get("created_at", "").startswith(month_prefix)]
    month_total = sum(d.get("amount", 0) for d in month_docs)

    # By category
    by_cat: dict = defaultdict(float)
    for d in month_docs:
        by_cat[d.get("category", "general")] += d.get("amount", 0)

    return {
        "month_total": month_total,
        "balance": balance,
        "my_total_since_settlement": my_total,
        "partner_total_since_settlement": partner_total,
        "by_category": dict(by_cat),
        "last_settled_at": last_settlement["settled_at"] if last_settlement else None,
    }


@app.post("/api/expenses/settle")
async def settle_expenses(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    settle_id = make_id()
    doc = {"settlement_id": settle_id, "couple_id": _cid(couple), "settled_by": _uid(user), "settled_at": now_iso()}
    await db.collection("settlements").document(settle_id).set(doc)
    # Notify partner
    partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
    if partner_id:
        name = user.get("name", "Your partner").split()[0]
        asyncio.create_task(send_push_notification(partner_id, f"✅ {name} settled up", "All debts cleared! 🎉"))
    return {"ok": True}


# ---------------------------------------------------------------------------
# "This day last year" memory
# ---------------------------------------------------------------------------

@app.get("/api/memories/this-day")
async def this_day_last_year(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    from datetime import datetime
    today = datetime.utcnow()
    results = []
    couple_id = _cid(couple)
    for y in range(1, 4):
        date_str = f"{today.year - y}-{today.month:02d}-{today.day:02d}"
        docs = await _fs_query("memories", [("couple_id", "==", couple_id), ("date", "==", date_str)], limit=10)
        for d in docs:
            results.append({"id": d["id"], "title": d["title"], "date": d["date"], "photo_url": d.get("photo_url"), "years_ago": y})
    return results


# ---------------------------------------------------------------------------
# Health / Cycle tracking (BOTH genders)
# ---------------------------------------------------------------------------

class HealthLogCreate(BaseModel):
    date: str  # YYYY-MM-DD
    log_type: str  # "period_start", "period_end", "symptom", "energy", "mood_note"
    value: Optional[int] = None  # 1-10 for energy/mood
    symptoms: Optional[list[str]] = []
    note: Optional[str] = None
    cycle_length: Optional[int] = None  # user can set their avg cycle length (28 default)


@app.post("/api/health/log", status_code=201)
async def log_health(req: HealthLogCreate, user: dict = Depends(get_current_user)):
    hl_id = make_id()
    doc = {
        "health_log_id": hl_id,
        "owner_id": _uid(user),
        "date": req.date,
        "log_type": req.log_type,
        "value": req.value,
        "symptoms": req.symptoms or [],
        "note": req.note,
        "cycle_length": req.cycle_length,
        "created_at": now_iso(),
    }
    await db.collection("health_logs").document(hl_id).set(doc)
    return {"ok": True}


@app.get("/api/health/logs")
async def get_health_logs(days: int = 90, user: dict = Depends(get_current_user)):
    from datetime import datetime, timedelta
    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    docs = await _fs_query("health_logs", [("owner_id", "==", _uid(user)), ("date", ">=", since)], order_by="date", direction=DESCENDING, limit=500)
    return [{"id": d["id"], "date": d["date"], "log_type": d["log_type"], "value": d.get("value"), "symptoms": d.get("symptoms", []), "note": d.get("note")} for d in docs]


@app.get("/api/health/phase")
async def get_health_phase(user: dict = Depends(get_current_user)):
    """Compute current cycle phase from period_start logs. Works for any user."""
    from datetime import datetime, timedelta
    today = datetime.utcnow().date()
    # Find last period_start
    last_start_docs = await _fs_query("health_logs", [("owner_id", "==", _uid(user)), ("log_type", "==", "period_start")], order_by="date", direction=DESCENDING, limit=1)
    last_start_doc = last_start_docs[0] if last_start_docs else None
    if not last_start_doc:
        return {"phase": "unknown", "day": None, "days_until_next": None, "emoji": "❓", "label": "No data yet"}

    cycle_length = last_start_doc.get("cycle_length") or 28
    last_start = datetime.strptime(last_start_doc["date"], "%Y-%m-%d").date()
    day_of_cycle = (today - last_start).days + 1

    # Normalize if past cycle length
    day_in_cycle = ((day_of_cycle - 1) % cycle_length) + 1
    days_until_next = cycle_length - day_in_cycle + 1

    # Phase calculation
    if day_in_cycle <= 5:
        phase = "menstrual"
        emoji = "🩸"
        label = "Period phase"
        tip = "Rest and warmth. Be extra gentle and patient today."
    elif day_in_cycle <= 13:
        phase = "follicular"
        emoji = "🌱"
        label = "Rising energy"
        tip = "Energy is building. Great time for new plans and adventures."
    elif day_in_cycle <= 16:
        phase = "ovulation"
        emoji = "✨"
        label = "Peak energy"
        tip = "Feeling social and energetic. Perfect day for quality time."
    elif day_in_cycle <= 24:
        phase = "luteal"
        emoji = "🍂"
        label = "Slowing down"
        tip = "May need more reassurance. Cozy time > busy plans."
    else:
        phase = "pms"
        emoji = "🌧️"
        label = "PMS window"
        tip = "Extra sensitivity likely. Check their care profile and be present."

    return {
        "phase": phase, "day": day_in_cycle, "cycle_length": cycle_length,
        "days_until_next": days_until_next, "emoji": emoji, "label": label, "tip": tip
    }


@app.get("/api/health/partner-phase")
async def get_partner_health_phase(user: dict = Depends(get_current_user)):
    """Get the partner's cycle phase (they must have shared it)."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
    if not partner_id:
        raise HTTPException(404)

    from datetime import datetime
    today = datetime.utcnow().date()
    p_hl_docs = await _fs_query("health_logs", [("owner_id", "==", partner_id), ("log_type", "==", "period_start")], order_by="date", direction=DESCENDING, limit=1)
    last_start_doc = p_hl_docs[0] if p_hl_docs else None
    if not last_start_doc:
        return {"phase": "unknown", "emoji": "❓", "label": "No data", "tip": "Your partner hasn't logged their cycle yet."}

    cycle_length = last_start_doc.get("cycle_length") or 28
    last_start = datetime.strptime(last_start_doc["date"], "%Y-%m-%d").date()
    day_in_cycle = ((((today - last_start).days)) % cycle_length) + 1
    days_until_next = cycle_length - day_in_cycle + 1

    if day_in_cycle <= 5:
        phase, emoji, label = "menstrual", "🩸", "Period phase"
        tip = "They may need extra warmth and rest today. Check their care profile."
    elif day_in_cycle <= 13:
        phase, emoji, label = "follicular", "🌱", "Rising energy"
        tip = "Energy is picking up — great time to plan something together."
    elif day_in_cycle <= 16:
        phase, emoji, label = "ovulation", "✨", "Peak energy"
        tip = "They're feeling their best. Spontaneous plans will land well."
    elif day_in_cycle <= 24:
        phase, emoji, label = "luteal", "🍂", "Slowing down"
        tip = "They may want cozy time over busy plans. Be reassuring."
    else:
        phase, emoji, label = "pms", "🌧️", "PMS window"
        tip = "Be patient and extra loving. Small gestures mean a lot right now."

    return {"phase": phase, "day": day_in_cycle, "cycle_length": cycle_length,
            "days_until_next": days_until_next, "emoji": emoji, "label": label, "tip": tip}


# ---------------------------------------------------------------------------
# AI Companion (Aria) — full context
# ---------------------------------------------------------------------------

class AriaMessage(BaseModel):
    message: str
    history: Optional[list[dict]] = []  # [{role, content}] last 10 messages


@app.post("/api/ai/aria")
async def aria_chat(req: AriaMessage, user: dict = Depends(get_current_user)):
    """Context-aware AI relationship companion. Knows everything about the couple."""
    couple = await get_couple(user)

    # Gather context
    context_parts = [f"User's name: {user.get('name', 'them')}"]

    if couple:
        couple_id = _cid(couple)
        partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)

        # Days together
        from datetime import datetime
        try:
            days = (datetime.utcnow() - datetime.fromisoformat(couple.get("created_at", "").replace("Z", ""))).days
            context_parts.append(f"They have been together for {days} days.")
        except Exception:
            pass

        # Partner name
        if partner_id:
            partner = await _fs_get("users", partner_id)
            if partner:
                context_parts.append(f"Partner's name: {partner.get('name', 'their partner')}")

        # Recent moods
        recent_moods = await _fs_query("mood", [("owner_id", "==", _uid(user))], order_by="created_at", direction=DESCENDING, limit=3)
        if recent_moods:
            mood_vals = [m.get("value", 5) for m in recent_moods]
            avg = sum(mood_vals) / len(mood_vals)
            context_parts.append(f"User's recent mood average: {avg:.1f}/10 (last {len(mood_vals)} entries).")

        # Partner mood
        if partner_id:
            partner_moods = await _fs_query("mood", [("owner_id", "==", partner_id)], order_by="created_at", direction=DESCENDING, limit=3)
            if partner_moods:
                vals = [m.get("value", 5) for m in partner_moods]
                context_parts.append(f"Partner's recent mood average: {sum(vals)/len(vals):.1f}/10.")

        # Care profile
        my_id = _uid(user)
        care = await _fs_get("care", my_id)
        if care:
            when_stressed = care.get("when_stressed", [])
            if when_stressed:
                context_parts.append(f"User's care preferences when stressed: {', '.join(when_stressed)}.")
        if partner_id:
            partner_care = await _fs_get("care", partner_id)
            if partner_care:
                ps = partner_care.get("when_stressed", [])
                if ps:
                    context_parts.append(f"Partner's care preferences when stressed: {', '.join(ps)}.")

        # Love language
        ll = await _fs_get("love_languages", my_id)
        if ll:
            context_parts.append(f"User's love language: {ll.get('result', 'unknown')}.")
        if partner_id:
            pll = await _fs_get("love_languages", partner_id)
            if pll:
                context_parts.append(f"Partner's love language: {pll.get('result', 'unknown')}.")

        # Cycle phase for both
        async def phase_for(uid: str):
            docs = await _fs_query("health_logs", [("owner_id", "==", uid), ("log_type", "==", "period_start")], order_by="date", direction=DESCENDING, limit=1)
            if not docs:
                return None
            doc = docs[0]
            from datetime import date
            cl = doc.get("cycle_length") or 28
            last = datetime.strptime(doc["date"], "%Y-%m-%d").date()
            day = (((datetime.utcnow().date() - last).days) % cl) + 1
            if day <= 5:
                return "menstrual (period)"
            if day <= 13:
                return "follicular (rising energy)"
            if day <= 16:
                return "ovulation (peak)"
            if day <= 24:
                return "luteal (slowing down)"
            return "PMS window"

        my_phase = await phase_for(my_id)
        if my_phase:
            context_parts.append(f"User's current cycle phase: {my_phase}.")
        if partner_id:
            partner_phase = await phase_for(partner_id)
            if partner_phase:
                context_parts.append(f"Partner's current cycle phase: {partner_phase}.")

        # Streak
        streak_val = 0
        import datetime as _dt_mod
        for i in range(30):
            d = (datetime.utcnow() - _dt_mod.timedelta(days=i)).strftime("%Y-%m-%d")
            d_end = d + "￿"
            my_moods = await _fs_query("mood", [("owner_id", "==", my_id), ("created_at", ">=", d), ("created_at", "<", d_end)], limit=1)
            has_mood = len(my_moods) > 0
            if not has_mood and partner_id:
                partner_moods_day = await _fs_query("mood", [("owner_id", "==", partner_id), ("created_at", ">=", d), ("created_at", "<", d_end)], limit=1)
                has_mood = len(partner_moods_day) > 0
            msgs_day = await _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", d), ("created_at", "<", d_end)], limit=1)
            has_msg = len(msgs_day) > 0
            if has_mood or has_msg:
                streak_val += 1
            else:
                break
        context_parts.append(f"Current streak: {streak_val} days.")

        # Couple profile (anniversary etc)
        profile = await _fs_get("couple_profiles", couple_id)
        if profile:
            if profile.get("anniversary"):
                context_parts.append(f"Anniversary: {profile['anniversary']}.")

    system_prompt = """You are Aria, a warm, empathetic AI relationship companion for couples in the SoulSync app. You have full context about this couple's relationship.

Your role:
- Give personalized, actionable relationship advice
- Help partners understand each other's moods, needs, and cycle phases
- Suggest what to do/say in specific situations
- Be a gentle counselor — never judgmental, always warm
- Use the context provided to give specific advice, not generic platitudes
- Keep responses concise (3–5 sentences max unless they ask for more)
- When someone asks "why is my partner upset/quiet/distant?", use mood + cycle + recent activity context to give a real answer
- Acknowledge both partners' perspectives equally regardless of gender

Context about this couple:
""" + "\n".join(context_parts)

    messages = [{"role": "system", "content": system_prompt}]
    for h in (req.history or [])[-8:]:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": req.message})

    reply = await _groq(system_prompt, req.message) if not req.history else ""
    if req.history:
        # Multi-turn: use full messages array
        try:
            import httpx as _hx
            async with _hx.AsyncClient() as c:
                r = await c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={"model": GROQ_MODEL, "messages": messages, "max_tokens": 400},
                    timeout=15,
                )
                r.raise_for_status()
                reply = r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            reply = f"I'm having trouble connecting right now. ({str(e)[:60]})"

    return {"reply": reply}


# ---------------------------------------------------------------------------
# Occasion-aware dynamic content
# ---------------------------------------------------------------------------

@app.get("/api/occasion")
async def get_occasion(user: dict = Depends(get_current_user)):
    """Returns the most relevant occasion/context for today."""
    from datetime import datetime
    today = datetime.utcnow().date()
    couple = await get_couple(user)
    occasions = []

    if couple:
        couple_id = _cid(couple)
        profile = await _fs_get("couple_profiles", couple_id)

        if profile:
            def days_until_yearly(date_str: str) -> int:
                try:
                    d = datetime.strptime(date_str, "%Y-%m-%d").date()
                    this_year = d.replace(year=today.year)
                    if this_year < today:
                        this_year = this_year.replace(year=today.year + 1)
                    return (this_year - today).days
                except Exception:
                    return 999

            if profile.get("anniversary"):
                d = days_until_yearly(profile["anniversary"])
                if d == 0:
                    occasions.append({"type": "anniversary", "emoji": "💍", "title": "Happy Anniversary!", "message": "Today is your special day 💕", "priority": 10})
                elif d <= 7:
                    occasions.append({"type": "anniversary_soon", "emoji": "💍", "title": f"Anniversary in {d} days", "message": "Start planning something special!", "priority": 8})

            if profile.get("my_birthday"):
                d = days_until_yearly(profile["my_birthday"])
                if d == 0:
                    occasions.append({"type": "birthday_me", "emoji": "🎂", "title": "Happy Birthday!", "message": "It's your birthday — celebrate!", "priority": 10})

            if profile.get("partner_birthday"):
                d = days_until_yearly(profile["partner_birthday"])
                if d == 0:
                    occasions.append({"type": "birthday_partner", "emoji": "🎁", "title": "Partner's Birthday!", "message": "Don't forget to make them feel special today 💕", "priority": 10})
                elif d <= 3:
                    occasions.append({"type": "birthday_partner_soon", "emoji": "🎁", "title": f"Their birthday in {d} days", "message": "Time to plan something thoughtful!", "priority": 7})

        # Partner cycle phase
        partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
        if partner_id:
            h_docs = await _fs_query("health_logs", [("owner_id", "==", partner_id), ("log_type", "==", "period_start")], order_by="date", direction=DESCENDING, limit=1)
            doc = h_docs[0] if h_docs else None
            if doc:
                cl = doc.get("cycle_length") or 28
                last = datetime.strptime(doc["date"], "%Y-%m-%d").date()
                day = (((today - last).days) % cl) + 1
                if day <= 5:
                    occasions.append({"type": "partner_period", "emoji": "🩸", "title": "Be extra gentle today", "message": "Your partner is in their period phase. Check their care profile.", "priority": 6})
                elif day > cl - 4:
                    occasions.append({"type": "partner_pms", "emoji": "🌧️", "title": "PMS window", "message": "Extra sensitivity likely. Small gestures go a long way.", "priority": 5})

        # Low streak
        import datetime as _dt_mod2
        streak_val = 0
        for i in range(5):
            d = (datetime.utcnow() - _dt_mod2.timedelta(days=i)).strftime("%Y-%m-%d")
            d_end = d + "￿"
            msgs_day2 = await _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", d), ("created_at", "<", d_end)], limit=1)
            if msgs_day2:
                streak_val += 1
            else:
                break
        if streak_val == 0:
            occasions.append({"type": "reconnect", "emoji": "💬", "title": "You've been quiet", "message": "Send a message — even a small one matters.", "priority": 4})

    # Sort by priority
    occasions.sort(key=lambda x: -x["priority"])
    return {"occasions": occasions[:3]}


# ---------------------------------------------------------------------------
# Watchlist + Reading list
# ---------------------------------------------------------------------------

class WatchlistCreate(BaseModel):
    title: str
    type: str = "movie"  # "movie", "show", "book"
    note: Optional[str] = None
    url: Optional[str] = None


@app.get("/api/watchlist")
async def list_watchlist(type: Optional[str] = None, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    couple_id = _cid(couple)
    filters = [("couple_id", "==", couple_id), ("deleted_at", "==", None)]
    if type:
        filters.append(("type", "==", type))
    docs = await _fs_query("watchlist", filters, order_by="created_at", direction=DESCENDING, limit=200)
    return [{"id": d["id"], "title": d["title"], "type": d["type"], "note": d.get("note"), "url": d.get("url"), "watched": d.get("watched", False), "watched_at": d.get("watched_at"), "added_by": d.get("added_by")} for d in docs]


@app.post("/api/watchlist", status_code=201)
async def add_watchlist(req: WatchlistCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    wid = make_id()
    doc = {"watchlist_id": wid, "couple_id": _cid(couple), "title": req.title, "type": req.type, "note": req.note, "url": req.url, "watched": False, "watched_at": None, "added_by": _uid(user), "created_at": now_iso(), "deleted_at": None}
    await db.collection("watchlist").document(wid).set(doc)
    return {"id": wid}


@app.patch("/api/watchlist/{wid}/watched")
async def mark_watched(wid: str, user: dict = Depends(get_current_user)):
    doc = await _fs_get("watchlist", wid)
    if not doc:
        raise HTTPException(404)
    new_watched = not doc.get("watched", False)
    await db.collection("watchlist").document(wid).update({"watched": new_watched, "watched_at": now_iso() if new_watched else None})
    return {"watched": new_watched}


@app.delete("/api/watchlist/{wid}")
async def delete_watchlist(wid: str, user: dict = Depends(get_current_user)):
    await db.collection("watchlist").document(wid).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Joint savings goal
# ---------------------------------------------------------------------------

class SavingsGoalCreate(BaseModel):
    title: str
    target_amount: float
    emoji: Optional[str] = "💰"
    deadline: Optional[str] = None


@app.get("/api/savings")
async def list_savings(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("savings", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], limit=50)
    return [{
        "id": d["id"],
        "title": d["title"],
        "target_amount": d["target_amount"],
        "current_amount": d.get("current_amount", 0),
        "emoji": d.get("emoji", "💰"),
        "deadline": d.get("deadline"),
        "contributions": d.get("contributions", [])
    } for d in docs]


@app.post("/api/savings", status_code=201)
async def create_savings(req: SavingsGoalCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    sid = make_id()
    doc = {
        "savings_id": sid,
        "couple_id": _cid(couple),
        "title": req.title,
        "target_amount": req.target_amount,
        "current_amount": 0,
        "emoji": req.emoji,
        "deadline": req.deadline,
        "contributions": [],
        "created_at": now_iso(),
        "deleted_at": None
    }
    await db.collection("savings").document(sid).set(doc)
    return {"id": sid}


@app.patch("/api/savings/{sid}/add")
async def add_to_savings(sid: str, amount: float, user: dict = Depends(get_current_user)):
    goal = await _fs_get("savings", sid)
    if not goal:
        raise HTTPException(404)
    new_amount = goal.get("current_amount", 0) + amount
    contribution = {
        "user_id": _uid(user),
        "name": user.get("name", "Partner").split()[0],
        "amount": amount,
        "timestamp": now_iso()
    }
    await db.collection("savings").document(sid).update({
        "current_amount": new_amount,
        "contributions": ArrayUnion([contribution])
    })

    # Notify partner
    couple = await get_couple(user)
    if couple:
        partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
        if partner_id:
            goal_title = goal.get("title", "our savings goal")
            name = user.get("name", "Your partner").split()[0]
            asyncio.create_task(send_push_notification(
                partner_id,
                "💰 Savings Goal Update",
                f"{name} contributed ₹{amount:g} toward '{goal_title}'! 🎉"
            ))

    return {"ok": True}


@app.delete("/api/savings/{sid}")
async def delete_savings(sid: str, user: dict = Depends(get_current_user)):
    await db.collection("savings").document(sid).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Nudge  (quick emotional pings between partners)
# ---------------------------------------------------------------------------

class NudgeCreate(BaseModel):
    type: str = "thinking_of_you"  # "thinking_of_you", "miss_you", "good_morning", "good_night"


@app.post("/api/nudge", status_code=201)
async def send_nudge(req: NudgeCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple: raise HTTPException(404, "No couple found")

    couple_id = _cid(couple)
    my_id = _uid(user)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)

    # Rate limit: max 5 nudges per 24h per user
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_nudges = await _fs_query("nudges", [("sender_id", "==", my_id), ("created_at", ">=", cutoff)])
    recent_count = len(recent_nudges)
    if recent_count >= 5:
        raise HTTPException(429, detail={"reason": "daily_limit", "message": "You've sent 5 nudges today. Come back tomorrow!"})

    # Cooldown: 60s between nudges
    last_nudges = await _fs_query("nudges", [("sender_id", "==", my_id)], order_by="created_at", direction=DESCENDING, limit=1)
    last_nudge = last_nudges[0] if last_nudges else None
    if last_nudge:
        try:
            last_time = datetime.fromisoformat(last_nudge["created_at"].replace("Z", ""))
            if last_time.tzinfo is None:
                last_time = last_time.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - last_time).total_seconds() < 60:
                raise HTTPException(429, detail={"reason": "cooldown", "message": "Wait a moment before nudging again"})
        except (ValueError, AttributeError):
            pass

    nudge_labels = {
        "thinking_of_you": "💭 thinking of you",
        "miss_you": "🥺 missing you",
        "good_morning": "☀️ good morning",
        "good_night": "🌙 good night",
    }

    nudge_id = make_id()
    doc = {
        "nudge_id": nudge_id,
        "couple_id": couple_id,
        "sender_id": my_id,
        "receiver_id": partner_id,
        "type": req.type,
        "created_at": now_iso(),
    }
    await db.collection("nudges").document(nudge_id).set(doc)

    # Push notification to partner
    if partner_id:
        sender_name = user.get("name", "Your partner").split()[0]
        label = nudge_labels.get(req.type, "thinking of you")
        asyncio.create_task(send_push_notification(
            partner_id,
            f"{sender_name} is {label}",
            "Open the app to respond 💕"
        ))

    return {"ok": True, "type": req.type}


@app.get("/api/nudge/recent")
async def get_recent_nudges(user: dict = Depends(get_current_user)):
    """Get nudges received in last 24h"""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    docs = await _fs_query("nudges", [("receiver_id", "==", _uid(user)), ("created_at", ">=", cutoff)], order_by="created_at", direction=DESCENDING, limit=10)
    return [{"type": d["type"], "sender_id": d["sender_id"], "created_at": d["created_at"]} for d in docs]


@app.get("/api/partner")
async def get_partner_endpoint(user: dict = Depends(get_current_user)):
    """Get the current user's partner's public profile."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "No couple found")

    partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
    if not partner_id:
        raise HTTPException(404, "No partner found")

    partner = await _fs_get("users", partner_id)
    if not partner:
        raise HTTPException(404, "Partner not found")

    return {
        "id": partner_id,
        "name": partner.get("name", ""),
        "email": partner.get("email", ""),
        "avatar_url": partner.get("avatar_url"),
        "status": partner.get("status", "offline"),
        "last_seen": partner.get("last_seen"),
    }


@app.get("/api/couple")
async def get_couple_info(user: dict = Depends(get_current_user)):
    """Get current couple info."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "No couple found")

    my_id = _uid(user)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
    partner_name = None
    if partner_id:
        partner = await _fs_get("users", partner_id)
        if partner:
            partner_name = partner.get("name", "")

    days = 0
    try:
        days = (datetime.now(timezone.utc) - datetime.fromisoformat(couple.get("created_at", "").replace("Z", ""))).days
    except Exception:
        pass

    return {
        "couple_id": _cid(couple),
        "members": couple.get("members", []),
        "partner_id": partner_id,
        "partner_name": partner_name,
        "days_together": days,
        "created_at": couple.get("created_at"),
    }


# ── Background scheduler jobs ──────────────────────────────────────────────

async def _dispatch_scheduled_messages():
    """Send any scheduled messages whose send_time has passed."""
    now = now_iso()
    all_pending = await _fs_query("scheduled_messages", [("sent", "==", False)])
    pending = [s for s in all_pending if s.get("send_at", "") <= now and not s.get("cancelled")]

    for sched in pending[:50]:
        try:
            sched_doc_id = sched.get("sched_id") or sched.get("id")
            # Mark sent first to avoid double-send
            await db.collection("scheduled_messages").document(sched_doc_id).update({"sent": True, "sent_at": now_iso()})
            # Insert as a real message
            msg_id = make_id()
            doc = {
                "message_id": msg_id,
                "couple_id": sched["couple_id"],
                "sender_id": sched.get("user_id", sched.get("sender_id", "")),
                "content": sched.get("content", ""),
                "msg_type": sched.get("msg_type", "text"),
                "media_url": sched.get("media_url"),
                "created_at": now_iso(),
                "read_at": None,
                "reply_to": None,
            }
            await db.collection("messages").document(msg_id).set(doc)
            # Push to partner
            couple = await _fs_get("couples", sched["couple_id"])
            if couple:
                sender_id = sched.get("user_id", sched.get("sender_id", ""))
                partner_id = next((m for m in couple.get("members", []) if m != sender_id), None)
                sender = await _fs_get("users", sender_id)
                if partner_id and sender:
                    name = sender.get("name", "Your partner").split()[0]
                    preview = _dec(doc["content"])[:60] if doc.get("content") else "sent a message"
                    await send_push_notification(partner_id, f"💬 {name}", preview)
        except Exception as e:
            print(f"[scheduler] Error dispatching scheduled message: {e}")


async def _check_unlocked_time_capsules():
    """Send push notifications when a time capsule reaches its open time."""
    now = now_iso()
    all_caps = await _fs_query("time_capsules", [("deleted_at", "==", None)])
    capsules = [c for c in all_caps if c.get("opens_at", "") <= now and not c.get("unlocked_push_sent")]

    for cap in capsules[:100]:
        couple_id = cap.get("couple_id")
        cap_id = cap.get("capsule_id") or cap.get("id")
        if not couple_id:
            continue
        couple = await _fs_get("couples", couple_id)
        if not couple:
            continue

        members = couple.get("members", [])
        for member_id in members:
            asyncio.create_task(send_push_notification(
                member_id,
                "🔓 Time Capsule Unlocked!",
                "Your time capsule is now ready to be opened. Open the app to read it! 💖"
            ))

        await db.collection("time_capsules").document(cap_id).update({"unlocked_push_sent": True})


async def _check_streak_at_risk():
    """Push notification if a couple hasn't messaged today and it's past 8 PM UTC."""
    now = datetime.now(timezone.utc)
    if now.hour < 20:  # Only check after 8 PM UTC
        return

    today = now.strftime("%Y-%m-%d")
    today_end = today + "￿"
    couples = await _fs_query("couples", [])

    for couple in couples:
        couple_id = _cid(couple)
        # Check if anyone messaged today
        today_msgs = await _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", today), ("created_at", "<", today_end)], limit=1)
        if today_msgs:
            continue

        # Check streak > 2 (only worth warning if they had a streak)
        streak = 0
        for i in range(1, 8):
            d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            d_end = d + "￿"
            had_msgs = await _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", d), ("created_at", "<", d_end)], limit=1)
            if had_msgs: streak += 1
            else: break

        if streak >= 2:
            for member_id in couple.get("members", []):
                await send_push_notification(
                    member_id,
                    "🔥 Don't break your streak!",
                    f"You're on a {streak}-day streak — send a message to keep it going 💕"
                )


async def _check_upcoming_birthdays():
    """Push reminder 3 days before partner's birthday."""
    today = datetime.now(timezone.utc).date()
    in_3_days = (today + timedelta(days=3)).strftime("%m-%d")
    today_str = today.strftime("%m-%d")

    couples = await _fs_query("couples", [])
    for couple in couples:
        couple_id = _cid(couple)
        profile = await _fs_get("couple_profiles", couple_id)
        if not profile: continue

        members = couple.get("members", [])

        def days_until_birthday(date_str: str) -> Optional[int]:
            if not date_str: return None
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
                this_year = d.replace(year=today.year)
                if this_year < today: this_year = this_year.replace(year=today.year + 1)
                return (this_year - today).days
            except Exception:
                return None

        partner_bday = profile.get("partner_birthday")
        if partner_bday:
            days = days_until_birthday(partner_bday)
            if days in (0, 1, 3):
                for member_id in members:
                    msg = "🎂 It's their birthday today!" if days == 0 else f"🎁 Their birthday is in {days} days!"
                    await send_push_notification(member_id, msg, "Don't forget to make them feel special 💕")


async def _check_couple_milestones():
    """Daily check for couple milestones (100 days, 6 months, 1 year, etc.) and push notifications."""
    today = datetime.now(timezone.utc).date()
    couples = await _fs_query("couples", [])

    for couple in couples:
        couple_id = _cid(couple)
        members = couple.get("members", [])
        if not members: continue

        profile = await _fs_get("couple_profiles", couple_id)
        start_date_str = None
        if profile and profile.get("anniversary"):
            start_date_str = profile["anniversary"]
        else:
            start_date_str = couple.get("created_at")
            
        if not start_date_str:
            continue
            
        try:
            start_date = datetime.fromisoformat(start_date_str[:10]).date()
            days_together = (today - start_date).days
            
            if days_together <= 0:
                continue
                
            milestone_msg = None
            if days_together == 100:
                milestone_msg = "🎉 You've been together for 100 days today! 💖"
            elif days_together == 182:
                milestone_msg = "🎉 You've been together for 6 months today! 💖"
            elif days_together == 365:
                milestone_msg = "🎉 Happy 1 year together today! 💍💖"
            elif days_together > 365 and days_together % 365 == 0:
                years = days_together // 365
                milestone_msg = f"🎉 Happy {years} years together today! 💍💖"
            elif days_together in (200, 300, 500, 1000):
                milestone_msg = f"🎉 You've been together for {days_together} days today! 💖"
                
            if milestone_msg:
                for member_id in members:
                    await send_push_notification(
                        member_id,
                        milestone_msg,
                        "Open the Us tab to celebrate your milestones together! 💕"
                    )
        except Exception as e:
            logger.error(f"Error checking milestone for couple {couple_id}: {e}")


# ─── Photos (permanent shared gallery) ───────────────────────────────────────

class PhotoUpload(BaseModel):
    url: str
    title: str = ""


@app.get("/api/photos")
async def list_photos(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("photos", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=500)
    return [
        {
            "id": d["id"],
            "url": d["url"],
            "title": d.get("title"),
            "uploaded_by": d.get("uploaded_by"),
            "created_at": d.get("created_at"),
        }
        for d in docs
    ]


@app.post("/api/photos", status_code=201)
async def upload_photo(req: PhotoUpload, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "No couple found")
    photo_id = make_id()
    doc = {
        "photo_id": photo_id,
        "couple_id": _cid(couple),
        "url": req.url,
        "title": req.title,
        "uploaded_by": _uid(user),
        "created_at": now_iso(),
        "deleted_at": None,
    }
    await db.collection("photos").document(photo_id).set(doc)
    # Notify partner
    partner_id = next((m for m in couple.get("members", []) if m != _uid(user)), None)
    if partner_id:
        name = user.get("name", "Your partner").split()[0]
        asyncio.create_task(send_push_notification(
            partner_id,
            f"📷 {name} added a photo",
            "Open the app to see it 💕",
        ))
    return {"id": photo_id}


@app.delete("/api/photos/{photo_id}")
async def delete_photo(photo_id: str, user: dict = Depends(get_current_user)):
    await db.collection("photos").document(photo_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ── Connect endpoints ──────────────────────────────────────────────────────────

class NowPlayingCreate(BaseModel):
    track: str
    artist: Optional[str] = None


@app.post("/api/connect/now-playing")
async def set_now_playing(req: NowPlayingCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    my_id = _uid(user)
    couple_id = _cid(couple)
    doc_id = f"{couple_id}_{my_id}_now_playing"
    await db.collection("connect_status").document(doc_id).set({"track": req.track, "artist": req.artist, "updated_at": now_iso(), "type": "now_playing", "user_id": my_id, "couple_id": couple_id}, merge=True)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
    if partner_id and req.track:
        name = user.get("name", "Your partner").split()[0]
        asyncio.create_task(send_push_notification(partner_id, f"🎵 {name} is listening", f"{req.track}{' — ' + req.artist if req.artist else ''}"))
    return {"ok": True}


@app.get("/api/connect/now-playing")
async def get_now_playing(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"mine": None, "partner": None}
    my_id = _uid(user)
    couple_id = _cid(couple)
    docs = await _fs_query("connect_status", [("couple_id", "==", couple_id), ("type", "==", "now_playing")])
    mine = next((d for d in docs if d["user_id"] == my_id), None)
    partner = next((d for d in docs if d["user_id"] != my_id), None)

    def fmt(d):
        return {"track": d["track"], "artist": d.get("artist"), "updated_at": d.get("updated_at")} if d else None

    return {"mine": fmt(mine), "partner": fmt(partner)}


@app.delete("/api/connect/now-playing")
async def clear_now_playing(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    couple_id = _cid(couple) if couple else ""
    my_id = _uid(user)
    doc_id = f"{couple_id}_{my_id}_now_playing"
    await db.collection("connect_status").document(doc_id).delete()
    return {"ok": True}


class WishCreate(BaseModel):
    text: str


@app.post("/api/connect/wish")
async def set_wish(req: WishCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    my_id = _uid(user)
    couple_id = _cid(couple)
    doc_id = f"{couple_id}_{my_id}_wish"
    await db.collection("connect_status").document(doc_id).set({"text": req.text, "updated_at": now_iso(), "type": "wish", "user_id": my_id, "couple_id": couple_id}, merge=True)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
    if partner_id:
        name = user.get("name", "Your partner").split()[0]
        asyncio.create_task(send_push_notification(partner_id, f"💭 {name} is wishing...", req.text[:80]))
    return {"ok": True}


@app.get("/api/connect/wish")
async def get_wish(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"mine": None, "partner": None}
    my_id = _uid(user)
    couple_id = _cid(couple)
    docs = await _fs_query("connect_status", [("couple_id", "==", couple_id), ("type", "==", "wish")])
    mine = next((d for d in docs if d["user_id"] == my_id), None)
    partner = next((d for d in docs if d["user_id"] != my_id), None)

    def fmt(d):
        return {"text": d["text"], "updated_at": d.get("updated_at")} if d else None

    return {"mine": fmt(mine), "partner": fmt(partner)}


class CityCreate(BaseModel):
    city: str


@app.post("/api/connect/city")
async def set_city(req: CityCreate, user: dict = Depends(get_current_user)):
    await db.collection("users").document(_uid(user)).update({"location_city": req.city})
    return {"ok": True}


class ActivityCreate(BaseModel):
    type: str  # "game" or "show"
    title: str


@app.post("/api/connect/activity")
async def set_activity(req: ActivityCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    my_id = _uid(user)
    couple_id = _cid(couple)
    doc_id = f"{couple_id}_{my_id}_activity"
    await db.collection("connect_status").document(doc_id).set({"activity_type": req.type, "title": req.title, "updated_at": now_iso(), "type": "activity", "user_id": my_id, "couple_id": couple_id}, merge=True)
    return {"ok": True}


@app.get("/api/connect/activity")
async def get_activity(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"mine": None, "partner": None}
    my_id = _uid(user)
    couple_id = _cid(couple)
    docs = await _fs_query("connect_status", [("couple_id", "==", couple_id), ("type", "==", "activity")])
    mine = next((d for d in docs if d["user_id"] == my_id), None)
    partner = next((d for d in docs if d["user_id"] != my_id), None)

    def fmt(d):
        return {"type": d.get("activity_type"), "title": d["title"], "updated_at": d.get("updated_at")} if d else None

    return {"mine": fmt(mine), "partner": fmt(partner)}


# ─── Heartbeat ────────────────────────────────────────────────────────────────

@app.post("/api/heartbeat/tap")
async def heartbeat_tap(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "No couple found")
    tap_id = make_id()
    couple_id = _cid(couple)
    my_id = _uid(user)
    doc = {
        "tap_id": tap_id,
        "couple_id": couple_id,
        "sender_id": my_id,
        "tapped_at": now_iso(),
        "delivered": False,
    }
    await db.collection("heartbeat_taps").document(tap_id).set(doc)
    # Clean up taps older than 10 seconds
    cutoff = (datetime.utcnow() - timedelta(seconds=10)).isoformat()
    old_taps = await _fs_query("heartbeat_taps", [("couple_id", "==", couple_id)])
    for t in old_taps:
        if t.get("tapped_at", "") < cutoff:
            await db.collection("heartbeat_taps").document(t["id"]).delete()
    return {"ok": True}


@app.get("/api/heartbeat/poll")
async def heartbeat_poll(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return {"taps": []}
    my_id = _uid(user)
    couple_id = _cid(couple)
    cutoff = (datetime.utcnow() - timedelta(seconds=3)).isoformat()
    all_taps = await _fs_query("heartbeat_taps", [("couple_id", "==", couple_id), ("delivered", "==", False), ("tapped_at", ">=", cutoff)])
    taps = [t for t in all_taps if t.get("sender_id") != my_id]
    for t in taps:
        await db.collection("heartbeat_taps").document(t["id"]).update({"delivered": True})
    return {"taps": [{"tapped_at": t["tapped_at"]} for t in taps]}


# ─── Time Capsule ─────────────────────────────────────────────────────────────

class TimeCapsuleCreate(BaseModel):
    message: str
    opens_at: str  # ISO datetime string
    media_url: Optional[str] = None


@app.get("/api/time-capsules")
async def list_time_capsules(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("time_capsules", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="opens_at", limit=50)
    now = datetime.utcnow().isoformat()
    result = []
    for d in docs:
        unlocked = d.get("opens_at", "") <= now
        result.append({
            "id": d["id"],
            "opens_at": d.get("opens_at"),
            "message": d.get("message") if unlocked else None,
            "media_url": d.get("media_url") if unlocked else None,
            "unlocked": unlocked,
            "author_id": d.get("author_id"),
            "created_at": d.get("created_at"),
        })
    return result


@app.get("/api/time-capsule")
async def list_time_capsule_alias(user: dict = Depends(get_current_user)):
    """Alias for /api/time-capsules."""
    couple = await get_couple(user)
    if not couple:
        return []
    docs = await _fs_query("time_capsules", [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)], order_by="opens_at", limit=20)
    return [{"id": d["id"], "message": d.get("message", ""), "opens_at": d.get("opens_at"), "author_id": d.get("author_id"), "created_at": d.get("created_at")} for d in docs]

@app.get("/api/partner-activity")
async def partner_activity(user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    members = couple.get("members", [])
    my_id = _uid(user)
    couple_id = _cid(couple)
    partner_id = next((m for m in members if m != my_id), None)
    if not partner_id:
        return []

    activities = []

    # Last mood
    moods = await _fs_query("mood", [("owner_id", "==", partner_id), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=1)
    mood = moods[0] if moods else None
    if mood and mood.get("created_at"):
        activities.append({"type": "mood", "text": "logged their mood", "time": mood["created_at"]})

    # Last memory added by partner
    mems = await _fs_query("memories", [("couple_id", "==", couple_id), ("owner_id", "==", partner_id), ("deleted_at", "==", None)], order_by="created_at", direction=DESCENDING, limit=1)
    mem = mems[0] if mems else None
    if mem and mem.get("created_at"):
        activities.append({"type": "memory", "text": "added a memory", "time": mem["created_at"]})

    # Last ritual from partner
    rituals = await _fs_query("rituals", [("sender_id", "==", partner_id)], order_by="created_at", direction=DESCENDING, limit=1)
    ritual = rituals[0] if rituals else None
    if ritual and ritual.get("created_at"):
        rtype = ritual.get("type", "")
        label = "sent a good morning ☀️" if rtype == "goodmorning" else "sent a good night 🌙" if rtype == "goodnight" else "sent a thinking of you 💭"
        activities.append({"type": "ritual", "text": label, "time": ritual["created_at"]})

    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:3]


@app.post("/api/time-capsules", status_code=201)
async def create_time_capsule(req: TimeCapsuleCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "No couple found")
    capsule_id = make_id()
    doc = {
        "capsule_id": capsule_id,
        "couple_id": _cid(couple),
        "author_id": _uid(user),
        "message": req.message,
        "opens_at": req.opens_at,
        "media_url": req.media_url,
        "created_at": now_iso(),
        "deleted_at": None,
    }
    await db.collection("time_capsules").document(capsule_id).set(doc)
    return {"id": capsule_id}


@app.post("/api/time-capsules/{cid}/open")
async def open_time_capsule_endpoint(cid: str, user: dict = Depends(get_current_user)):
    capsule = await _fs_get("time_capsules", cid)
    if not capsule:
        raise HTTPException(404, detail="Capsule not found")

    if capsule.get("opened_by_recipient"):
        return {"ok": True}

    author_id = capsule.get("author_id")
    reader_id = _uid(user)

    if author_id and author_id != reader_id:
        await db.collection("time_capsules").document(cid).update({"opened_by_recipient": True})
        
        # Format the sealed date nicely
        created_str = "some time ago"
        if capsule.get("created_at"):
            try:
                created_str = datetime.fromisoformat(capsule["created_at"][:10]).strftime("%B %d, %Y")
            except Exception:
                pass
                
        name = user.get("name", "Your partner").split()[0]
        asyncio.create_task(send_push_notification(
            author_id,
            "⏳ Time Capsule Opened!",
            f"{name} just opened the time capsule you sealed on {created_str}! 📭"
        ))
        
    return {"ok": True}


# ---------------------------------------------------------------------------
# ACTIVITY HEARTBEAT (feature 3)
# ---------------------------------------------------------------------------

@app.post("/api/activity/ping")
async def activity_ping(user: dict = Depends(get_current_user)):
    """Record that the user is active right now."""
    await db.collection("users").document(_uid(user)).update({"last_active": now_iso(), "last_active_at": now_iso()})
    return {"ok": True}


@app.get("/api/partner")
async def get_partner_info(user: dict = Depends(get_current_user)):
    """Return the partner's public profile including last_active."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "Not paired")
    partner = await get_partner(user, couple)
    if not partner:
        raise HTTPException(404, "Partner not found")
    p = serialize_user(partner)
    # Expose last_active for online indicator
    p["last_active"] = partner.get("last_active") or partner.get("last_active_at")
    return p


# ---------------------------------------------------------------------------
# SHARED LISTS (feature 1)
# ---------------------------------------------------------------------------

GROQ_API_KEY_VAL = os.getenv("GROQ_API_KEY", "")


class ListItemCreate(BaseModel):
    category: str
    title: str
    image_url: Optional[str] = None
    emoji_cover: Optional[str] = None
    added_by: str
    status: str = "want"
    notes: Optional[str] = None


class ListStatusUpdate(BaseModel):
    status: str


@app.post("/api/lists/item", status_code=201)
async def create_list_item(req: ListItemCreate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(403, "Not paired")

    image_url = req.image_url
    emoji_cover = req.emoji_cover

    # For categories without a dedicated image API, ask Groq for a description + emoji
    if not image_url and req.category in ("restaurants", "places", "games", "podcasts"):
        try:
            groq_prompt = (
                f"Give a single emoji and a one-line description for: '{req.title}' (category: {req.category}). "
                "Format: EMOJI | description"
            )
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY_VAL}", "Content-Type": "application/json"},
                    json={
                        "model": "llama3-8b-8192",
                        "messages": [{"role": "user", "content": groq_prompt}],
                        "max_tokens": 60,
                    },
                    timeout=8,
                )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"].strip()
                parts = content.split("|")
                emoji_cover = parts[0].strip() if parts else "✨"
        except Exception:
            emoji_cover = {"restaurants": "🍜", "places": "🌍", "games": "🎮", "podcasts": "🎙️"}.get(req.category, "✨")

    now = now_iso()
    list_id = make_id()
    doc = {
        "list_id": list_id,
        "couple_id": _cid(couple),
        "owner_id": _uid(user),
        "category": req.category,
        "title": req.title,
        "image_url": image_url,
        "emoji_cover": emoji_cover,
        "added_by": req.added_by,
        "status": req.status,
        "notes": req.notes,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    await db.collection("shared_lists").document(list_id).set(doc)

    # Notify partner
    partner = await get_partner(user, couple)
    if partner:
        asyncio.create_task(send_push_notification(
            _uid(partner),
            f"📋 {req.added_by} added to list",
            f"{req.title} ({req.category})",
        ))

    return serialize(doc)


@app.get("/api/lists")
async def get_list_items(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        return []
    filters = [("couple_id", "==", _cid(couple)), ("deleted_at", "==", None)]
    if category:
        filters.append(("category", "==", category))
    docs = await _fs_query("shared_lists", filters, order_by="created_at", direction=DESCENDING)
    return [serialize(d) for d in docs]


@app.put("/api/lists/{item_id}/status")
async def update_list_item_status(item_id: str, req: ListStatusUpdate, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(403)
    await db.collection("shared_lists").document(item_id).update({"status": req.status, "updated_at": now_iso()})
    return {"ok": True}


@app.delete("/api/lists/{item_id}")
async def delete_list_item(item_id: str, user: dict = Depends(get_current_user)):
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(403)
    await db.collection("shared_lists").document(item_id).update({"deleted_at": now_iso()})
    return {"ok": True}


# ---------------------------------------------------------------------------
# PROFILE PHOTO & EXTENDED PROFILE UPDATE (features 5)
# ---------------------------------------------------------------------------

AVATARS_DIR = Path(__file__).parent / "static" / "avatars"
AVATARS_DIR.mkdir(parents=True, exist_ok=True)


class PhotoUrlRequest(BaseModel):
    url: str


@app.post("/api/profile/photo")
async def set_profile_photo(req: PhotoUrlRequest, user: dict = Depends(get_current_user)):
    """Save the avatar URL (already uploaded via /api/upload) to the user doc."""
    await db.collection("users").document(_uid(user)).update({"avatar_url": req.url, "updated_at": now_iso()})
    return {"ok": True, "avatar_url": req.url}


class ExtendedProfileUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    birthday: Optional[str] = None
    timezone: Optional[str] = None
    avatar_url: Optional[str] = None


@app.put("/api/profile")
async def update_profile(req: ExtendedProfileUpdate, user: dict = Depends(get_current_user)):
    updates: dict = {"updated_at": now_iso()}
    if req.name is not None:
        updates["name"] = req.name
    if req.city is not None:
        updates["location_city"] = req.city
    if req.bio is not None:
        updates["bio"] = req.bio[:120]
    if req.birthday is not None:
        updates["birthday"] = req.birthday
    if req.timezone is not None:
        updates["timezone"] = req.timezone
    if req.avatar_url is not None:
        updates["avatar_url"] = req.avatar_url
    my_id = _uid(user)
    await db.collection("users").document(my_id).update(updates)
    updated = await _fs_get("users", my_id)
    return serialize_user(updated)


# ---------------------------------------------------------------------------
# UNLINK PARTNER (feature 6)
# ---------------------------------------------------------------------------

@app.delete("/api/couple")
async def unlink_couple(user: dict = Depends(get_current_user)):
    """Disconnect both partners from each other and delete the couple doc."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404, "Not paired")

    couple_id = _cid(couple)
    partner = await get_partner(user, couple)

    now = now_iso()
    # Remove couple_id from both users
    for member_id in couple.get("members", []):
        await db.collection("users").document(member_id).update({"couple_id": None, "updated_at": now})
    # Soft-delete the couple doc
    await db.collection("couples").document(couple_id).update({"deleted_at": now})

    # Notify the partner
    if partner:
        asyncio.create_task(send_push_notification(
            _uid(partner),
            "💔 Partner unlinked",
            "Your partner has unlinked from your couple.",
        ))

    return {"ok": True}


# ---------------------------------------------------------------------------
# DELETE ACCOUNT (feature 6)
# ---------------------------------------------------------------------------

_ALL_USER_COLLECTIONS = [
    "sessions", "mood", "journal", "messages", "tasks", "goals",
    "events", "memories", "notes", "open_when", "bucket_list", "trips",
    "routines", "journal_entries", "our_journal", "photos", "snaps",
    "time_capsules", "rituals", "wishlists", "date_ideas", "expenses",
    "savings", "quiz_answers", "health", "pair_codes", "push_tokens",
    "shared_lists", "availability",
]


@app.delete("/api/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """
    Permanently delete the calling user's account and all associated data.
    Also unlinks their partner (if paired) and notifies them.
    """
    my_id = _uid(user)
    couple = await get_couple(user)

    # If paired, unlink the partner first
    if couple:
        couple_id = _cid(couple)
        partner = await get_partner(user, couple)
        for member_id in couple.get("members", []):
            await db.collection("users").document(member_id).update({"couple_id": None, "updated_at": now_iso()})
        await db.collection("couples").document(couple_id).update({"deleted_at": now_iso()})
        if partner:
            asyncio.create_task(send_push_notification(
                _uid(partner),
                "💔 Account deleted",
                "Your partner has deleted their account.",
            ))

    # Delete all user-owned documents in every collection
    for col_name in _ALL_USER_COLLECTIONS:
        try:
            owner_docs = await _fs_query(col_name, [("owner_id", "==", my_id)])
            for d in owner_docs:
                await db.collection(col_name).document(d["id"]).delete()
            user_docs = await _fs_query(col_name, [("user_id", "==", my_id)])
            for d in user_docs:
                await db.collection(col_name).document(d["id"]).delete()
        except Exception:
            pass

    # Delete the user document itself
    await db.collection("users").document(my_id).delete()

    return {"ok": True}


# ---------------------------------------------------------------------------
# Notify / Availability
# ---------------------------------------------------------------------------

class AvailabilityNotifyRequest(BaseModel):
    status: str  # e.g. "free", "busy", "call me"

@app.post("/api/notify/availability")
async def notify_availability(req: AvailabilityNotifyRequest, user: dict = Depends(get_current_user)):
    """Send partner a push notification about your availability status."""
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)
    my_id = _uid(user)
    partner_id = next((m for m in couple.get("members", []) if m != my_id), None)
    name = user.get("name", "Your partner").split()[0]
    labels = {
        "free": f"🟢 {name} is free to talk!",
        "busy": f"🔴 {name} is busy right now",
        "call me": f"📞 {name} wants you to call",
        "5 mins": f"⏱ {name} will be free in 5 mins",
        "later": f"🌙 {name} will reach out later",
    }
    title = labels.get(req.status, f"{name} updated their availability")
    asyncio.create_task(send_push_notification(partner_id, title, ""))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Daily Quote (Groq-powered, cached per day)
# ---------------------------------------------------------------------------

import hashlib as _hashlib
from datetime import date as _date
import json as _json


@app.get("/api/daily-quote")
async def daily_quote():
    """Return a fresh love/relationship quote. Cached per day — same quote all day."""
    today = str(_date.today())

    cached_docs = await _fs_query("daily_content", [("type", "==", "quote"), ("date", "==", today)], limit=1)
    cached = cached_docs[0] if cached_docs else None
    if cached:
        return {"text": cached["text"], "author": cached["author"], "date": today}

    system = """You are a curator of beautiful, meaningful quotes about love, connection,
and long-distance relationships. Return ONE quote that is:
- Genuinely moving, not cliché
- From a real author, poet, writer, or philosopher (name them)
- Between 15-40 words
- Relevant to couples who are physically apart but emotionally close

Format your response as exactly two lines:
Line 1: The quote text (no quotation marks)
Line 2: — Author Name"""

    prompt = f"Today is {today}. Give me a fresh quote I haven't given before."

    try:
        raw = await _groq(system, prompt)
        lines = [l.strip() for l in raw.strip().split('\n') if l.strip()]
        text = lines[0] if lines else "Distance means so little when someone means so much."
        author = lines[1].lstrip('—- ') if len(lines) > 1 else "Unknown"

        dc_id = make_id()
        await db.collection("daily_content").document(dc_id).set({"type": "quote", "date": today, "text": text, "author": author})
        return {"text": text, "author": author, "date": today}
    except Exception:
        return {"text": "Distance means so little when someone means so much.", "author": "Tom McNeal", "date": today}


@app.post("/api/daily-quote/refresh")
async def refresh_quote(user: dict = Depends(get_current_user)):
    """Request a new quote (max 5 per day per user)."""
    today = str(_date.today())
    key = f"quote_refresh_{_uid(user)}_{today}"
    count_doc = await _fs_get("rate_limits", key)
    count = count_doc["count"] if count_doc else 0
    if count >= 5:
        raise HTTPException(429, "Max 5 quote refreshes per day")

    if count_doc:
        await db.collection("rate_limits").document(key).update({"count": count + 1})
    else:
        await db.collection("rate_limits").document(key).set({"key": key, "count": 1})

    # Delete existing quote for today
    old_docs = await _fs_query("daily_content", [("type", "==", "quote"), ("date", "==", today)], limit=1)
    for old in old_docs:
        await db.collection("daily_content").document(old["id"]).delete()

    system = "Return ONE beautiful, unique love quote (15-40 words) from a real author. Format: quote text on line 1, '— Author' on line 2. Make it different from common ones."
    raw = await _groq(system, f"Give me quote #{count + 2} for today. Be creative.")
    lines = [l.strip() for l in raw.strip().split('\n') if l.strip()]
    text = lines[0] if lines else "You are my greatest adventure."
    author = lines[1].lstrip('—- ') if len(lines) > 1 else "Unknown"
    dc_id = make_id()
    await db.collection("daily_content").document(dc_id).set({"type": "quote", "date": today, "text": text, "author": author})
    return {"text": text, "author": author, "date": today}


# ---------------------------------------------------------------------------
# Monthly Journal Summary (Aria-powered, cached per month)
# ---------------------------------------------------------------------------

@app.get("/api/ai/monthly-journal")
async def monthly_journal(force: int = 0, user: dict = Depends(get_current_user)):
    """Generate or return cached monthly relationship summary for the current month."""
    from datetime import date as _date, datetime, timedelta
    couple = await get_couple(user)
    if not couple:
        raise HTTPException(404)

    couple_id = _cid(couple)
    today = _date.today()
    month_key = f"{today.year}-{today.month:02d}"

    # Force-invalidate cache if requested
    if force:
        old_mj = await _fs_query("daily_content", [("type", "==", "monthly_journal"), ("couple_id", "==", couple_id), ("month", "==", month_key)], limit=1)
        for old in old_mj:
            await db.collection("daily_content").document(old["id"]).delete()

    # Check cache
    cached_mj = await _fs_query("daily_content", [("type", "==", "monthly_journal"), ("couple_id", "==", couple_id), ("month", "==", month_key)], limit=1)
    cached = cached_mj[0] if cached_mj else None
    if cached:
        return {"summary": cached["summary"], "month": month_key, "cached": True}

    # Need at least 7 days into the month before generating
    if today.day < 7:
        return {"summary": None, "month": month_key, "cached": False, "reason": "too_early"}

    # Gather month's data
    month_start = datetime(today.year, today.month, 1).isoformat()

    msgs, mood_docs, ritual_docs, memory_docs, event_docs = await asyncio.gather(
        _fs_query("messages", [("couple_id", "==", couple_id), ("created_at", ">=", month_start)]),
        _fs_query("mood", [("couple_id", "==", couple_id), ("created_at", ">=", month_start)], limit=60),
        _fs_query("rituals", [("couple_id", "==", couple_id), ("created_at", ">=", month_start)], limit=60),
        _fs_query("memories", [("couple_id", "==", couple_id), ("created_at", ">=", month_start)], limit=10),
        _fs_query("events", [("couple_id", "==", couple_id), ("date", ">=", month_start[:10])], limit=10),
    )
    msg_count = len(msgs)

    avg_mood = round(sum(m.get("value", 5) for m in mood_docs) / len(mood_docs), 1) if mood_docs else None
    month_name = today.strftime("%B %Y")

    context = f"""Month: {month_name}
Messages exchanged: {msg_count}
Rituals completed (good morning/night): {len(ritual_docs)}
Memories added: {len(memory_docs)}
Events this month: {len(event_docs)}
Average mood: {f'{avg_mood}/10' if avg_mood else 'not tracked'}
Memory titles: {', '.join(m.get('title', '') for m in memory_docs[:3]) if memory_docs else 'none'}"""

    system = open(_os.path.join(_PROMPTS_DIR, "aria_weekly_summary.md")).read()
    # Override for monthly format
    system += "\n\nThis is a MONTHLY journal entry, not weekly. Write 4 short paragraphs: what connected them / what was beautiful / what was hard / what to look forward to next month."

    summary = await _groq(system, context)

    # Cache it
    mj_id = make_id()
    await db.collection("daily_content").document(mj_id).set({"type": "monthly_journal", "couple_id": couple_id, "month": month_key, "summary": summary, "generated_at": now_iso()})
    return {"summary": summary, "month": month_key, "cached": False}


# Dynamic Festivals (Groq-powered, cached per month)
# ---------------------------------------------------------------------------

@app.get("/api/festivals")
async def get_festivals():
    """Return festivals for current + next 3 months. Cached per month. Auto-sustaining per year."""
    today = _date.today()
    cache_key = f"{today.year}-{today.month:02d}"

    cached_fests = await _fs_query("daily_content", [("type", "==", "festivals"), ("month", "==", cache_key)], limit=1)
    cached = cached_fests[0] if cached_fests else None
    if cached:
        return {"festivals": cached["festivals"]}

    system = """You are an expert Indian & World Cultural Calendar Assistant.
List all major festivals, holidays, and observances for the given months.
Specifically include all Indian and Hindu festivals (e.g. Teej - Hariyali & Hartalika, Karwa Chauth, Raksha Bandhan, Janmashtami, Ganesh Chaturthi, Navratri, Dussehra, Dhanteras, Diwali, Chhath Puja, Bhai Dooj, Vasant Panchami, Maha Shivratri, Holi, Baisakhi, Ugadi, Onam, Pongal, Vishu, Ram Navami, Hanuman Jayanti, Durga Puja, etc.) as well as global observances.

Calculate accurate dates for the requested year according to the Hindu lunar calendar (Panchang) and solar calendar.

Return ONLY valid JSON array in this format:
[
  {"date": "YYYY-MM-DD", "name": "Hariyali Teej", "emoji": "🌿", "culture": "Indian", "couple_significance": "A festival of love and devotion where women wear green and swings are put up."},
  {"date": "YYYY-MM-DD", "name": "Raksha Bandhan", "emoji": "🪢", "culture": "Indian", "couple_significance": "Celebrating love, protection, and cherished bonds."},
  {"date": "YYYY-MM-DD", "name": "Karwa Chauth", "emoji": "🌕", "culture": "Indian", "couple_significance": "A sacred fast of love and longevity for couples."}
]

Rules:
- Calculate accurate dates for the given year
- Include 20-30 festivals total across the months requested
- Include relevant Indian/Hindu festivals occurring in those months
- One emoji per festival
- Dates in YYYY-MM-DD format"""

    months = []
    for i in range(4):
        m = today.month + i
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        months.append(f"{y}-{m:02d}")

    prompt = f"List all Indian, Hindu, and global festivals for these months: {', '.join(months)}. Year: {today.year}."

    try:
        raw = await _groq(system, prompt)
        start = raw.find('[')
        end = raw.rfind(']') + 1
        festivals = _json.loads(raw[start:end])

        fest_id = make_id()
        await db.collection("daily_content").document(fest_id).set({"type": "festivals", "month": cache_key, "festivals": festivals})
        return {"festivals": festivals}
    except Exception:
        return {"festivals": []}


@app.get("/api/ai/indian-festivals-guide")
async def indian_festivals_guide(user: dict = Depends(get_current_user)):
    """AI endpoint providing personalized couple recommendations for upcoming Indian festivals."""
    today = _date.today()
    cache_key = f"fest_guide_{today.year}_{today.month:02d}_{today.day:02d}"

    cached_docs = await _fs_query("daily_content", [("type", "==", "indian_guide"), ("cache_key", "==", cache_key)], limit=1)
    if cached_docs:
        return cached_docs[0]["data"]

    system = """You are Aria, an AI relationship & cultural guide for modern Indian couples.
Provide a warm, inspiring guide for upcoming Indian/Hindu festivals over the next 60 days.
Focus on couple rituals, traditional outfit ideas (ethnic wear like sarees, kurtas, lehengas), date ideas, and gifting suggestions.

Return ONLY valid JSON in this format:
{
  "featured_festival": {
    "name": "Hariyali Teej",
    "emoji": "🌿",
    "date": "YYYY-MM-DD",
    "days_away": 5,
    "title": "Festival of Green & Love",
    "description": "Celebrate love with green attire, mehendi, and sweet Ghevar.",
    "outfit_suggestion": "Green Saree or Kurta set with glass bangles",
    "date_idea": "Surprise date with mehendi & traditional sweets"
  },
  "upcoming_festivals": [
    {
      "name": "Raksha Bandhan",
      "emoji": "🪢",
      "date": "YYYY-MM-DD",
      "days_away": 12,
      "tip": "Plan sweet boxes & personalized gifts ahead of time."
    }
  ]
}"""

    prompt = f"Today is {today.isoformat()}. Year is {today.year}. Generate personalized Indian festival guide for the couple."

    try:
        raw = await _groq(system, prompt)
        start = raw.find('{')
        end = raw.rfind('}') + 1
        guide_data = _json.loads(raw[start:end])

        doc_id = make_id()
        await db.collection("daily_content").document(doc_id).set({"type": "indian_guide", "cache_key": cache_key, "data": guide_data})
        return guide_data
    except Exception:
        return {
            "featured_festival": {
                "name": "Karwa Chauth",
                "emoji": "🌕",
                "date": f"{today.year}-10-20",
                "days_away": 10,
                "title": "A Sacred Celebration of Love",
                "description": "Fasting together, moonlit prayers, and sweet memories.",
                "outfit_suggestion": "Vibrant Red or Maroon Ethnic Wear",
                "date_idea": "Rooftop dinner under the moon after breaking fast",
            },
            "upcoming_festivals": [],
        }


# ---------------------------------------------------------------------------
# Dynamic AI Date Ideas & Couple Quiz (Self-Sustaining LLM Endpoints)
# ---------------------------------------------------------------------------

@app.get("/api/ai/date-ideas")
async def dynamic_date_ideas(user: dict = Depends(get_current_user)):
    """Return fresh, seasonally-curated couple date ideas generated by internal LLM."""
    today = _date.today()
    cache_key = f"date_ideas_{today.year}_{today.month:02d}"

    cached_docs = await _fs_query("daily_content", [("type", "==", "date_ideas"), ("cache_key", "==", cache_key)], limit=1)
    if cached_docs:
        return {"ideas": cached_docs[0]["ideas"]}

    system = """You are a romantic date planner. Generate 6 unique, creative, and memorable date ideas for couples.
Mix indoor, outdoor, budget-friendly, and special occasion dates.

Return ONLY valid JSON array:
[
  {
    "id": "1",
    "title": "Stargazing & Hot Cocoa",
    "emoji": "🌌",
    "description": "Pack cozy blankets, warm cocoa, and drive away from city lights to watch the night sky.",
    "category": "Outdoor",
    "estimated_cost": "$$"
  }
]"""

    prompt = f"Month: {today.strftime('%B %Y')}. Generate 6 fresh date ideas suited for this season."

    try:
        raw = await _groq(system, prompt)
        start = raw.find('[')
        end = raw.rfind(']') + 1
        ideas = _json.loads(raw[start:end])

        doc_id = make_id()
        await db.collection("daily_content").document(doc_id).set({"type": "date_ideas", "cache_key": cache_key, "ideas": ideas})
        return {"ideas": ideas}
    except Exception:
        return {
            "ideas": [
                {"id": "1", "title": "Surprise Mehendi & Sweets", "emoji": "🌿", "description": "Plan a sweet day with traditional mehendi, sweets, and music.", "category": "Cultural", "estimated_cost": "$"},
                {"id": "2", "title": "Rooftop Sunset Picnic", "emoji": "🌅", "description": "Set up fairy lights and favorite snacks to watch the sunset.", "category": "Romantic", "estimated_cost": "$"},
                {"id": "3", "title": "Cozy Movie Marathon", "emoji": "🎬", "description": "Build a pillow fort, pop popcorn, and watch classic romantic movies.", "category": "Indoor", "estimated_cost": "$"}
            ]
        }


@app.get("/api/ai/quiz-questions")
async def dynamic_quiz_questions(user: dict = Depends(get_current_user)):
    """Return fresh couple quiz & trivia questions generated by internal LLM."""
    system = """Generate 5 fun, deep, and engaging couple trivia questions.
Format as JSON array:
[
  {
    "id": "q1",
    "question": "What is your partner's ultimate comfort food when stressed?",
    "options": ["Biryani / Comfort Curry", "Ice Cream / Sweets", "Pizza / Fast Food", "Home-cooked comfort meal"]
  }
]"""

    try:
        raw = await _groq(system, "Generate 5 fresh couple questions.")
        start = raw.find('[')
        end = raw.rfind(']') + 1
        questions = _json.loads(raw[start:end])
        return {"questions": questions}
    except Exception:
        return {
            "questions": [
                {"id": "q1", "question": "What was your partner's first impression of you?", "options": ["Sweet & Charming", "Funny & Witty", "Shy & Cute", "Unforgettable"]},
                {"id": "q2", "question": "What is your dream vacation together?", "options": ["Himalayan Mountain Retreat", "Goa / Beach Paradise", "European Romance", "Cozy Cabin Staycation"]}
            ]
        }


@app.get("/api/ai/inferred-vibe")
async def get_inferred_vibe(user: dict = Depends(get_current_user)):
    """Passively analyze couple interaction context and return AI-inferred vibe."""
    today = _date.today()
    cache_key = f"vibe_{user['user_id']}_{today.isoformat()}"

    cached_docs = await _fs_query("daily_content", [("type", "==", "vibe_check"), ("cache_key", "==", cache_key)], limit=1)
    if cached_docs:
        return cached_docs[0]["vibe"]

    system = """Analyze recent couple interactions and return an inferred relationship vibe.
Format as JSON:
{
  "user_vibe": "✨ Cozy & Warm",
  "partner_vibe": "🥰 Loving & Playful",
  "emoji": "✨",
  "summary": "You two are in a sweet, relaxed groove today."
}"""

    try:
        raw = await _groq(system, "Determine today's couple vibe.")
        start = raw.find('{')
        end = raw.rfind('}') + 1
        vibe_data = _json.loads(raw[start:end])

        doc_id = make_id()
        await db.collection("daily_content").document(doc_id).set({"type": "vibe_check", "cache_key": cache_key, "vibe": vibe_data})
        return vibe_data
    except Exception:
        return {
            "user_vibe": "✨ Cozy & Warm",
            "partner_vibe": "🥰 Loving",
            "emoji": "✨",
            "summary": "Feeling sweet and connected today."
        }


@app.post("/api/ai/vibe-check")
async def update_vibe_check(payload: dict, user: dict = Depends(get_current_user)):
    """Update current user's 1-tap vibe state."""
    vibe = payload.get("vibe", "✨ Cozy")
    emoji = payload.get("emoji", "✨")

    today = _date.today()
    doc_id = f"vibe_{user['user_id']}_{today.isoformat()}"
    vibe_record = {
        "user_id": user["user_id"],
        "vibe": vibe,
        "emoji": emoji,
        "updated_at": datetime.utcnow().isoformat()
    }
    await db.collection("moods").document(doc_id).set(vibe_record)
    return {"success": True, "vibe": vibe_record}


# ---------------------------------------------------------------------------
# Notifications & Activity Feed Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Fetch user activity notifications."""
    try:
        docs = await _fs_query("notifications", [("user_id", "==", user["user_id"])], limit=20)
        return docs
    except Exception:
        return []


@app.post("/api/notifications/read-all")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    try:
        docs = await _fs_query("notifications", [("user_id", "==", user["user_id"])], limit=50)
        for d in docs:
            await db.collection("notifications").document(d["id"]).update({"read": True})
    except Exception:
        pass
    return {"success": True}





