import os, uuid, pytest
from fastapi.testclient import TestClient
import jose.jwt

os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"
import server
from server import app

# In-memory mock database store for automated testing
mock_db = {
    "users": {},
    "sessions": {},
    "sharing_settings": {},
    "notes": {},
    "mood": {},
}

async def mock_fs_get(col: str, doc_id: str):
    doc = mock_db.get(col, {}).get(doc_id)
    return {"id": doc_id, **doc} if doc else None

async def mock_fs_find_one(col: str, filters: list):
    for doc_id, doc in mock_db.get(col, {}).items():
        match = True
        for field, op, val in filters:
            if op == "==" and doc.get(field) != val:
                match = False
                break
        if match:
            return {"id": doc_id, **doc}
    return None

async def mock_fs_query(col: str, filters: list, order_by=None, direction=None, limit=None):
    results = []
    for doc_id, doc in mock_db.get(col, {}).items():
        match = True
        for field, op, val in filters:
            if op == "==" and doc.get(field) != val:
                match = False
                break
        if match:
            results.append({"id": doc_id, **doc})
    return results[:limit] if limit else results

class MockCollection:
    def __init__(self, col):
        self.col = col
    def document(self, doc_id):
        return MockDocRef(self.col, doc_id)

class MockDocRef:
    def __init__(self, col, doc_id):
        self.col = col
        self.doc_id = doc_id
    async def set(self, data, merge=False):
        if self.col not in mock_db:
            mock_db[self.col] = {}
        if merge and self.doc_id in mock_db[self.col]:
            mock_db[self.col][self.doc_id].update(data)
        else:
            mock_db[self.col][self.doc_id] = dict(data)
    async def update(self, data):
        if self.col in mock_db and self.doc_id in mock_db[self.col]:
            mock_db[self.col][self.doc_id].update(data)
    async def delete(self):
        if self.col in mock_db:
            mock_db[self.col].pop(self.doc_id, None)

class MockFirestoreClient:
    def collection(self, col):
        return MockCollection(col)

# Monkeypatch database helpers for unit testing
server._fs_get = mock_fs_get
server._fs_find_one = mock_fs_find_one
server._fs_query = mock_fs_query
server.db = MockFirestoreClient()

client = TestClient(app)

def test_auth_register_and_profile():
    test_id = uuid.uuid4().hex[:8]
    email = f"test_{test_id}@example.com"
    password = "SecretPassword123!"
    name = f"Test User {test_id}"

    # Register
    r = client.post("/api/auth/register", json={"email": email, "name": name, "password": password})
    assert r.status_code == 200, f"Register failed: {r.text}"
    data = r.json()
    assert "session_token" in data
    token = data["session_token"]

    headers = {"Authorization": f"Bearer {token}"}

    # Fetch profile (/api/auth/me)
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == email

    # Update profile (/api/profile)
    r = client.put("/api/profile", json={"name": f"Updated {name}"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["name"] == f"Updated {name}"


def test_clerk_token_authentication():
    clerk_id = "user_2test" + uuid.uuid4().hex[:6]
    dummy_clerk_token = jose.jwt.encode({"sub": clerk_id, "email": f"{clerk_id}@example.com", "iss": "https://clerk.dev"}, "secret", algorithm="HS256")
    headers = {"Authorization": f"Bearer {dummy_clerk_token}"}

    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["user_id"] == clerk_id


def test_privacy_and_sharing_settings():
    test_id = uuid.uuid4().hex[:8]
    email = f"test_sharing_{test_id}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "name": "Sharing User", "password": "Password123!"})
    assert r.status_code == 200
    token = r.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get sharing settings
    r = client.get("/api/settings/sharing", headers=headers)
    assert r.status_code == 200
    settings = r.json()
    assert "calendar" in settings

    # Update sharing settings
    updated_payload = {"calendar": "busy_only", "mood": "partner", "journal": "private"}
    r = client.put("/api/settings/sharing", json=updated_payload, headers=headers)
    assert r.status_code == 200
    res = r.json()
    assert res["calendar"] == "busy_only"
    assert res["mood"] == "partner"
    assert res["journal"] == "private"


def test_couple_invite_and_notes():
    test_id = uuid.uuid4().hex[:8]
    email = f"test_notes_{test_id}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "name": "Notes User", "password": "Password123!"})
    assert r.status_code == 200
    token = r.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Note
    r = client.post("/api/notes", json={"text": "A sweet test love note"}, headers=headers)
    assert r.status_code == 201
    note = r.json()
    assert note["text"] == "A sweet test love note"

    # List Notes
    r = client.get("/api/notes", headers=headers)
    assert r.status_code == 200
    notes = r.json()
    assert any(n.get("note_id") == note.get("note_id") for n in notes)
