# UX_CONTRACT.md — SoulSync / OurSpace Master UX & Route Workflow Manifest

> **Single Source of Truth for User Experience, Interaction Contracts & Route-by-Route Workflows**
> Every feature, API call, user trigger, state transition, error recovery state, and micro-interaction is strictly governed by this contract.

---

## 1. Core UX Philosophy & System Architecture

1. **Zero Maintenance**: Automatic content updates (festivals, date ideas, quotes, AI vibe checks) via FastAPI + Groq LLM without requiring manual code updates.
2. **Zero White Screens**: Never freeze or render blocking error dialogs during network drops.
3. **Instant Local Caching (0ms Startup)**: Local `AsyncStorage` cache loads instantly upon launch while background network re-verification runs asynchronously.
4. **Unobtrusive Notifications**: Informational updates use top floating **Sonner toasts** (`sonner.show`) instead of intrusive modal alert popups.
5. **Tactile Intimacy**: Custom haptic vibration signatures (`heartbeat`, `celebrate`, `delete`, `pop`, `light`, `medium`) for every pressable interaction.

---

## 2. Micro-Interaction & Haptics Matrix

| User Action | Visual Feedback | Haptic Signal |
| :--- | :--- | :--- |
| **Tab Switch / Chip Tap** | Background highlight | `haptics.light()` |
| **Button Press** | Scale to `0.96` with spring | `haptics.medium()` |
| **Sending "Thinking of You" 💭** | Heart pulse animation | `haptics.heartbeat()` (double-pulse) |
| **Adding Event / Milestone 🎉** | Celebration badge pop | `haptics.celebrate()` (festive pulse) |
| **Deleting Note / Message 🗑️** | Red highlight | `haptics.delete()` (warning pulse) |
| **1-Tap Vibe Selection ✨** | Pill background glow | `haptics.pop()` |
| **Picker / Scroll Wheel ⚙️** | Tick highlight | `haptics.select()` |

---

## 3. Comprehensive Route-by-Route Interaction Workflows (All 35 Screens)

### ── FLOW 1: AUTH & ONBOARDING ──

#### 1.1 `/(auth)/index` — Login & Signup
- **Triggers & Entry**: Unauthenticated app launch or logged-out session.
- **Workflow**:
  1. User toggles between Login and Signup tabs (`haptics.light()`).
  2. Submits email/password or triggers Clerk SSO.
  3. API Call: `POST /api/auth/login` or `POST /api/auth/signup`.
  4. On Success: Caches JWT token locally in `SecureStore`, saves `cached_user_profile` in `AsyncStorage`, and redirects to `/(app)` (or `/(auth)/pair` if not paired).
  5. On Failure: Triggers `sonner.error('Auth Failed', message)` toast.

#### 1.2 `/(auth)/pair` — Partner Pairing & Link Sharing
- **Triggers & Entry**: Initial login when `couple_id` is null, or tapping "Connect Partner".
- **Workflow**:
  1. Displays user's unique 6-character pair code and a "Share Invite Link" button.
  2. Tapping "Share Link" (`haptics.medium()`) generates `https://soulsync.app/pair?code=A1B2C3` and opens system share sheet.
  3. Partner opens link or enters code manually -> API Call: `POST /api/auth/pair` with `{ code }`.
  4. On Success: Server links both users into a `couple` record, fires `haptics.success()`, shows `sonner.success('Paired Successfully! 🎉')`, and navigates to `/(app)`.
  5. Deep-Link Detection: Opening app with `?code=A1B2C3` auto-fills input field.

#### 1.3 `onboarding.tsx` — Initial Setup
- **Triggers & Entry**: First pairing completion.
- **Workflow**:
  1. Steps user through city selection, timezone confirmation, and relationship anniversary date.
  2. API Call: `POST /api/location/me` & `PUT /api/couple-profile`.
  3. Navigates to Home Dashboard (`/(app)`).

---

### ── FLOW 2: HOME & PRESENCE ──

#### 2.1 `index.tsx` — Home Dashboard
- **Triggers & Entry**: Primary app tab (`/(app)`).
- **Workflow**:
  1. On Mount: Loads cached profile from `AsyncStorage` (0ms delay), then runs SWR fetch to `GET /api/dashboard`.
  2. **1-Tap AI Vibe Check**: Tapping vibe badges (`🥰 Loving`, `✨ Cozy`, `☕ Busy`) triggers `haptics.pop()`, updates `currentVibe` state instantly, shows `sonner.show('Vibe Updated!')`, and posts to `POST /api/ai/vibe-check`. Also queries `GET /api/ai/inferred-vibe` for passive AI mood inference.
  3. **AI Quick Action Bar**: Horizontal pills for `AI Date Ideas`, `AI Indian Festival Guide`, `Ask Aria`, `Couple Quiz`. Tapping opens corresponding modal or screen with `haptics.light()`.
  4. **Floating Heart Button**: Tapping triggers `haptics.heartbeat()`. If paired: posts to `POST /api/messages` (`"💭 thinking of you"`) and shows toast. If unpaired: shows `sonner.show('Connect with Partner 💕')` and opens `/pair`.

#### 2.2 `connect.tsx` — Live Presence Hub
- **Triggers & Entry**: Tapping "Connect 🔗" card on home screen or navigation tab.
- **Workflow**:
  1. **Availability Card**: User selects status (`Available`, `Busy`, `Free for a call`). Triggers `haptics.light()`, posts to `PUT /api/availability`, and updates partner indicator.
  2. **Now Playing Card**: Users share current music track -> `POST /api/connect/now-playing`. Equalizer bar animates dynamically.
  3. **Weather Card**: Fetches live weather for both cities via `wttr.in`. Displays temperature (°C), conditions (☀️, 🌧️, ☁️), humidity, and feels-like degrees. Tapping location icon allows updating city (`POST /api/connect/city`).
  4. **Timezone Clocks**: Displays side-by-side clocks (`Intl.DateTimeFormat`), day differences (`Tomorrow`/`Yesterday`), and call recommendation badge (`Good time to call` vs `Partner sleeping`).
  5. **Spontaneous Wish Card**: Post quick thought (`POST /api/connect/wish`).
  6. **Currently Into Card**: Share current game or show (`POST /api/connect/activity`).

#### 2.3 `breathe.tsx` — Synchronized Breathing
- **Triggers & Entry**: Tapping "Breathe Together" feature pill.
- **Workflow**:
  1. Pulsing animated circle expands (Inhale: 4s) and contracts (Exhale: 4s) using `Reanimated`.
  2. Gentle micro-haptic pulses signal breath transitions.

#### 2.4 `heartbeat.tsx` — Live Heartbeat Transmission
- **Triggers & Entry**: Tapping "Heartbeat Sync" icon.
- **Workflow**:
  1. Holding thumb on screen triggers `haptics.heartbeat()` double-pulse loop.
  2. Transmits pulse events to partner in real time via API socket.

#### 2.5 `notifications.tsx` — Activity Feed
- **Triggers & Entry**: Tapping bell icon in top header.
- **Workflow**:
  1. On Mount: `GET /api/notifications`. If empty or offline, renders clean empty feed without popups (`setNotifications([])`).
  2. Tapping "Read all" (`haptics.medium()`) calls `POST /api/notifications/read-all` and optimistically marks rows as read.

---

### ── FLOW 3: COMMUNICATION & INTIMACY ──

#### 3.1 `chat.tsx` — Live Messaging & Celebrations
- **Triggers & Entry**: Chat tab or floating message shortcut.
- **Workflow**:
  1. Loads messages (`GET /api/messages`). Renders top Indian Festival / Celebration Banner (`🪔 Hariyali Teej in 3 days!`) if applicable.
  2. Typing message + Tap Send (`haptics.medium()`) -> `POST /api/messages`. Message appends optimistically.
  3. Long Press Message Target (`haptics.heavy()`): Opens context menu (Save to Memories, Save to Journal, Copy, Add to Calendar, Delete).
  4. Deleting Message: Triggers `haptics.delete()`, calls `DELETE /api/messages/:id`, and filters message out.

#### 3.2 `open-when.tsx` — Digital "Open When..." Letters
- **Triggers & Entry**: Tapping "Open When" cards.
- **Workflow**:
  1. Displays locked letter envelopes with conditions (e.g. "Open when you miss me").
  2. Tapping locked letter checks condition date; if unlocked, reveals letter text with `haptics.celebrate()`.
  3. Creating letter -> `POST /api/open-when`.

#### 3.3 `shared-note.tsx` — Collaborative Canvas
- **Triggers & Entry**: Tapping "Shared Canvas".
- **Workflow**:
  1. Loads shared note (`GET /api/shared-note`). On network miss, defaults to blank canvas (`setContent('')`).
  2. Auto-saves edits after 1200ms debounce -> `PUT /api/shared-note`. Displays last edit time & author badge.

#### 3.4 `notes.tsx` — Quick Love Notes
- **Triggers & Entry**: Tapping "Love Notes" tile.
- **Workflow**:
  1. Grid of adhesive love notes. Tapping "+" opens creation sheet -> `POST /api/notes`.
  2. Deleting note triggers `haptics.delete()`.

#### 3.5 `video-call.tsx` — Private Video Call
- **Triggers & Entry**: Tapping video call icon in chat header.
- **Workflow**:
  1. Initializes video call room for couple (`couple_id`).
  2. Tapping End Call returns to chat.

---

### ── FLOW 4: DISCOVERY & ACTIVITIES ──

#### 4.1 `date-ideas.tsx` — Dynamic Date Generator & Plan Builder
- **Triggers & Entry**: Tapping "Date Ideas" tile or home action pill.
- **Workflow**:
  1. Filter by categories: `Virtual`, `Local`, `Adventure`, `Cozy`, `Romantic`, `Creative`.
  2. Tapping "Generate Idea ✨" calls `/api/ai/date-ideas` (or `/api/ai/date-idea`) to fetch fresh seasonal ideas from internal LLM.
  3. Tapping "Add to Bucket List 💕" -> `POST /api/goals`.
  4. Tapping "Build plan with Aria ✨" calls `POST /api/ai/date-plan` and displays step-by-step date itinerary.

#### 4.2 `couple-quiz.tsx` — Question Game & AI Infinite Quiz
- **Triggers & Entry**: Tapping "Question Game" tile.
- **Workflow**:
  1. Lobby tab allows picking category (`Deep`, `Fun`, `Spicy`, `Relationship`, `Dreams`, `Memories`, `WYR`, `Truth or Dare`, `AI Infinite Quiz ✨`).
  2. Swiping right (`Answer →`) opens answer modal -> `POST /api/quiz/save`. Swiping left (`← Skip`) advances card (`haptics.light()`).
  3. Compare Answers Tab: Calls `GET /api/quiz/compare` to show side-by-side answers for matching questions.

#### 4.3 `aria.tsx` — Ask Aria AI Coach
- **Triggers & Entry**: Tapping Aria AI icon in header or quick pill.
- **Workflow**:
  1. Conversational AI chat interface for relationship advice and date planning.
  2. Sends user prompt -> `POST /api/ai/chat`. Streams or returns Aria's guidance.

#### 4.4 `shared-lists.tsx` — Joint Checklists
- **Triggers & Entry**: Tapping "Shared Lists".
- **Workflow**:
  1. Category tabs for Groceries, Movies to Watch, Packing, and House Chores.
  2. Checking item (`haptics.light()`) updates checkmark state.

#### 4.5 `wishlist.tsx` — Shared Gift Wishlist
- **Triggers & Entry**: Tapping "Wishlist".
- **Workflow**:
  1. Add gift item (`title`, `url`, `price`, `image`).
  2. Partner can tap "Claim Gift 🎁" to mark as claimed secretly.

#### 4.6 `goals.tsx` — Couple Bucket List & Milestones
- **Triggers & Entry**: Tapping "Our Goals / Bucket List".
- **Workflow**:
  1. Tracks short-term and lifetime couple goals.
  2. Tapping goal progress bar updates completion percentage.

---

### ── FLOW 5: MEMORIES & RECAPS ──

#### 5.1 `memories.tsx` — Memory Gallery
- **Triggers & Entry**: Tapping "Memories".
- **Workflow**:
  1. Timeline feed of saved moments, notes, and photos -> `GET /api/memories`.
  2. Adding memory -> `POST /api/memories`.

#### 5.2 `photos.tsx` — Private Photo Vault
- **Triggers & Entry**: Tapping "Photos".
- **Workflow**:
  1. Shared photo grid with lightbox preview. Uploading photo -> `POST /api/photos`.

#### 5.3 `snaps.tsx` — Quick Photo Snaps
- **Triggers & Entry**: Tapping "Snaps".
- **Workflow**:
  1. Send quick temporary photo snap to partner.

#### 5.4 `journal.tsx` — Personal Reflection Journal
- **Triggers & Entry**: Tapping "My Journal".
- **Workflow**:
  1. Private individual journal entries -> `GET/POST /api/journal`.

#### 5.5 `our-journal.tsx` — Joint Couple Journal
- **Triggers & Entry**: Tapping "Our Journal".
- **Workflow**:
  1. Shared entries visible to both partners -> `GET/POST /api/our-journal`.

#### 5.6 `time-capsule.tsx` — Digital Time Capsules
- **Triggers & Entry**: Tapping "Time Capsules".
- **Workflow**:
  1. Create locked time capsule with future release date (e.g. Next Anniversary).
  2. Locked capsules show countdown timer until release date.

---

### ── FLOW 6: LIFE & PLANNING ──

#### 6.1 `calendar.tsx` — Couple Calendar & Indian Festival Sync
- **Triggers & Entry**: Calendar tab.
- **Workflow**:
  1. Displays couple events + upcoming Indian cultural festivals (Hariyali Teej, Karwa Chauth, Diwali, Raksha Bandhan).
  2. Tapping "Sync Festival" (`haptics.celebrate()`) calls `POST /api/events` to add festival to couple calendar.
  3. Adding custom event -> `POST /api/events`.

#### 6.2 `trip-planner.tsx` — Long-Distance Trip Countdown
- **Triggers & Entry**: Tapping "Trip Planner".
- **Workflow**:
  1. On Mount: `GET /api/trips`. Offline/empty error fallback initializes `setTrips([])`.
  2. Add/Edit Trip: Destination, Date (`YYYY-MM-DD`), Flight Notes, Things to Do, Packing Checklist.
  3. Displays live countdown badge (`14 days, 6 hours left ✈️`).

#### 6.3 `savings.tsx` — Joint Financial Savings
- **Triggers & Entry**: Tapping "Savings".
- **Workflow**:
  1. Track shared savings target (e.g. "Vacation Fund: $1,200 / $2,000").
  2. Contribution logs update total progress bar.

#### 6.4 `expenses.tsx` — Split Expense Tracker
- **Triggers & Entry**: Tapping "Expenses".
- **Workflow**:
  1. Log shared expenses and calculate balance split.

#### 6.5 `todo.tsx` — Shared Task Manager
- **Triggers & Entry**: Tapping "Todo List".
- **Workflow**:
  1. Add shared tasks, assign to self/partner, and check off completion.

---

### ── FLOW 7: HEALTH & SETTINGS ──

#### 7.1 `health.tsx` — Period & Cycle Sync
- **Triggers & Entry**: Tapping "Cycle Tracker".
- **Workflow**:
  1. Log cycle start date, period length, and daily symptoms (`Cramps`, `Mood`, `Energy`).
  2. Calculates phase (`Follicular`, `Luteal`, `Ovulation`, `Period`).

#### 7.2 `health-partner.tsx` — Partner Cycle View
- **Triggers & Entry**: Tapping "Partner's Cycle".
- **Workflow**:
  1. Displays partner's current cycle phase + AI care recommendations (e.g. "Bring warm tea & chocolates today 🍫").

#### 7.3 `couple-profile.tsx` — Couple Setup
- **Triggers & Entry**: Tapping couple avatar in header.
- **Workflow**:
  1. Edit relationship start date, anniversary, couple photo, and nicknames.

#### 7.4 `us.tsx` — Relationship Stats & Recap
- **Triggers & Entry**: Tapping "Us" tab.
- **Workflow**:
  1. Displays days together counter (`742 Days Together`), message streak, and weekly love recap.

#### 7.5 `more.tsx` — App Settings & Security
- **Triggers & Entry**: Settings menu icon.
- **Workflow**:
  1. Toggle Dark/Light theme, toggle haptics (`setHapticsEnabled`), change password, unlink partner, or delete account.

---

## 4. Backend API Endpoints Reference (`app/backend/server.py`)

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
- **Exposed Tools**: `get_couple_status`, `get_upcoming_festivals_and_events`, `add_couple_event`, `send_love_note`, `ask_aria_ai`.

---

## 6. Database Schema & Data Models (Firestore)

- **`users`**: `{ user_id, email, name, avatar_url, couple_id, city, timezone, created_at }`
- **`couples`**: `{ couple_id, members: [user_id_1, user_id_2], pair_code, together_since, anniversary, created_at }`
- **`messages`**: `{ id, couple_id, user_id, content, msg_type, created_at, pinned, scheduled_for }`
- **`events`**: `{ id, couple_id, title, category, start_dt, end_dt, all_day, description, color, visibility }`
- **`moods`**: `{ doc_id, user_id, vibe, emoji, updated_at }`
- **`notifications`**: `{ id, user_id, title, body, read, created_at }`
- **`trips`**: `{ trip_id, couple_id, title, date, notes, packing_list: [], places: [] }`
- **`daily_content`**: `{ doc_id, type, cache_key, ideas/questions/vibe, created_at }`
