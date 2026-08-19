# ARCHITECTURE.md — SoulSync / OurSpace Master System Manifest

> **Single Source of Truth for External Tools, AI Assistants & Developers**
> Comprehensive architectural documentation, route index, database schemas, backend API reference, MCP server specification, and zero-maintenance automation guides.

---

## 1. System Overview & Technology Stack

SoulSync (OurSpace) is an intimate, private relationship platform designed for long-distance and co-located couples. It combines live presence indicators, collaborative memory vaults, private chat, dynamic AI date planning, and a self-sustaining LLM backend.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER (Expo 52)                         │
│  React Native · Expo Router (Typed) · Reanimated · Expo Haptics         │
│  Stale-While-Revalidate (SWR) Local Storage · Sonner Toast System       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / REST / Websockets
┌────────────────────────────────────▼────────────────────────────────────┐
│                        BACKEND LAYER (FastAPI Python)                   │
│  FastAPI · Uvicorn · Firestore DB · Groq LLM (Aria Engine)              │
│  Model Context Protocol (MCP) Server (JSON-RPC 2.0 stdio)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Stack Metrics
- **Mobile Frontend**: Expo 52, React Native 0.76, Expo Router, TypeScript, `expo-haptics`, `expo-linear-gradient`, `@clerk/clerk-expo` + custom JWT auth.
- **Backend API**: Python 3.11+, FastAPI, Uvicorn, Async Firestore Client, Groq API (Llama 3 / Mixtral engines).
- **MCP Protocol**: Stdio JSON-RPC 2.0 server (`app/backend/mcp_server.py`).

---

## 2. Complete Application Route Index (35 Routes)

### Flow 1: Auth & Onboarding
- `/(auth)/index`: Login & Signup screen supporting Clerk and custom JWT authentication.
- `/(auth)/pair`: 1-tap partner pairing screen with auto-filling invite links (`soulsync://pair?code=...`).
- `onboarding.tsx`: Interactive onboarding flow for new couples.

### Flow 2: Home & Presence
- `index.tsx`: Main dashboard featuring AI Quick Action Bar, 1-Tap Expressive Vibe Bar, Rhythm Card, Next Moment countdown, and floating love pulse.
- `connect.tsx`: Live presence hub featuring side-by-side weather (`wttr.in`), live music (`NowPlayingCard`), timezone clocks with sleep indicators, and spontaneous wish sharing.
- `breathe.tsx`: Synchronized breathing exercises for long-distance relaxation.
- `heartbeat.tsx`: Real-time haptic heartbeat transmission screen.
- `notifications.tsx`: Activity feed & notifications history with read/unread tracking.

### Flow 3: Communication & Intimacy
- `chat.tsx`: Real-time private chat with festival banners, message pinning, scheduling, and custom deletion haptics.
- `open-when.tsx`: Digital "Open When..." letters for milestone moments.
- `shared-note.tsx`: Real-time collaborative shared canvas note.
- `notes.tsx`: Quick love notes vault.
- `video-call.tsx`: Integrated private video calling interface.

### Flow 4: Discovery & Activities
- `date-ideas.tsx`: Dynamic date ideas generator connected to `/api/ai/date-ideas` and bucket list integration.
- `couple-quiz.tsx`: Interactive question game featuring static banks & **AI Infinite Quiz ✨**.
- `aria.tsx`: Ask Aria AI relationship coach chatbot.
- `shared-lists.tsx`: Joint checklists for groceries, movies, and packing.
- `wishlist.tsx`: Shared gift & experience wishlist with claim status.
- `goals.tsx`: Couple bucket list & shared life milestones.

### Flow 5: Memories & Recaps
- `memories.tsx`: Timeline memory gallery with photo attachments.
- `photos.tsx`: Private shared photo vault.
- `snaps.tsx`: Quick photo snap exchange.
- `journal.tsx`: Personal private reflection journal.
- `our-journal.tsx`: Joint couple journal entries.
- `time-capsule.tsx`: Lockable digital time capsules with release dates.

### Flow 6: Life & Planning
- `calendar.tsx`: Couple calendar with Indian festival guides (Hariyali Teej, Karwa Chauth, Diwali, Raksha Bandhan) and 1-tap calendar sync.
- `trip-planner.tsx`: Long-distance visit countdowns, flight notes, and packing checklists.
- `savings.tsx`: Joint financial savings goal tracker.
- `expenses.tsx`: Split expense logging and settlement.
- `todo.tsx`: Shared task & chore manager.

### Flow 7: Health & Settings
- `health.tsx`: Period & menstrual cycle tracker with symptom logging.
- `health-partner.tsx`: Partner cycle insight view with care recommendations.
- `couple-profile.tsx`: Couple profile, relationship start date, and anniversary setup.
- `us.tsx`: Relationship stats, streak counters, and check-in history.
- `more.tsx`: App settings, dark mode toggle, haptics configuration, and security options.

---

## 3. Database Schema & Data Models (Firestore)

- **`users`**: `{ user_id, email, name, avatar_url, couple_id, city, timezone, created_at }`
- **`couples`**: `{ couple_id, members: [user_id_1, user_id_2], pair_code, together_since, anniversary, created_at }`
- **`messages`**: `{ id, couple_id, user_id, content, msg_type, created_at, pinned, scheduled_for }`
- **`events`**: `{ id, couple_id, title, category, start_dt, end_dt, all_day, description, color, visibility }`
- **`moods`**: `{ doc_id, user_id, vibe, emoji, updated_at }`
- **`notifications`**: `{ id, user_id, title, body, read, created_at }`
- **`trips`**: `{ trip_id, couple_id, title, date, notes, packing_list: [], places: [] }`
- **`daily_content`**: `{ doc_id, type, cache_key, ideas/questions/vibe, created_at }`

---

## 4. Backend API Endpoints (FastAPI `server.py`)

### Authentication & User
- `GET /api/auth/me`: Get current logged-in user profile.
- `POST /api/auth/pair`: Pair with partner using 6-character code.
- `GET /api/location/me` / `GET /api/location/partner`: Get city & timezone metadata.

### Automation & Internal LLM (`/api/ai/*`)
- `GET /api/ai/date-ideas`: Generate seasonal date ideas via Groq LLM with Firestore caching.
- `GET /api/ai/quiz-questions`: Generate fresh couple trivia questions.
- `GET /api/ai/inferred-vibe`: Passively infer couple relationship vibe.
- `POST /api/ai/vibe-check`: Save 1-tap vibe selection.
- `POST /api/ai/date-plan`: Generate a step-by-step date execution plan.
- `POST /api/ai/chat`: Stream responses from Aria AI coach.

### Features & Communication
- `GET/POST /api/messages`: Fetch and send chat messages.
- `GET/POST /api/events`: Fetch and schedule calendar events.
- `GET /api/notifications`: Fetch user activity feed.
- `POST /api/notifications/read-all`: Mark all notifications as read.
- `GET/PUT /api/trips`: Manage long-distance trip countdowns and checklists.

---

## 5. Model Context Protocol (MCP) Server Specification

- **File Location**: [`app/backend/mcp_server.py`](file:///d:/Closer-main/app/backend/mcp_server.py)
- **Protocol**: JSON-RPC 2.0 stdio
- **Exposed Tools**:
  1. `get_couple_status`: Returns pairing state, partner details, anniversary, and days together.
  2. `get_upcoming_festivals_and_events`: Returns upcoming Indian cultural festivals and couple events.
  3. `add_couple_event`: Adds a scheduled calendar event for the couple.
  4. `send_love_note`: Sends a love note message into the chat.
  5. `ask_aria_ai`: Queries Aria AI for relationship advice and date recommendations.

---

## 6. Zero-Maintenance & Reliability Architecture

1. **Self-Sustaining LLM Endpoints**: Dates, quiz questions, and Indian festival guides are generated by Groq LLM and cached in Firestore `daily_content`. Next year or next month, content updates automatically without app code updates.
2. **Defensive Fallback Payloads**: Every LLM request has static fallback dictionaries in case of server timeouts or offline network drops.
3. **Session Persistence**: Session tokens are removed **ONLY** on explicit HTTP 401 Unauthorized responses.
4. **Sonner Error Toast System**: Informational errors display as top floating toasts instead of intrusive alert dialogs.

---

## 7. Linked Design & UX Contracts

- **Design System Contract**: [`DESIGN_CONTRACT.md`](file:///d:/Closer-main/DESIGN_CONTRACT.md)
- **User Experience Contract**: [`UX_CONTRACT.md`](file:///d:/Closer-main/UX_CONTRACT.md)
