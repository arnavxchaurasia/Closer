# DESIGN_CONTRACT.md — SoulSync / OurSpace Master Design & UI Manifest

> **Single Source of Truth for Visual Design, Component Contracts & Application Architecture**
> Every current and future UI screen, layout, theme token, and component interaction is strictly judged against this contract to guarantee 100% visual consistency and brand harmony across all 35 application routes.

---

## 1. System Overview & Technology Stack

SoulSync (OurSpace) is an intimate, private relationship platform designed for long-distance and co-located couples. It combines live presence indicators, collaborative memory vaults, private chat, dynamic AI date planning, and a self-sustaining LLM backend.

- **Mobile Frontend**: Expo 52, React Native 0.76, Expo Router (Typed), TypeScript, Reanimated 3, Expo Haptics, Expo Linear Gradient, `@clerk/clerk-expo` + custom JWT auth.
- **Backend API**: Python 3.11+, FastAPI, Uvicorn, Async Firestore Client, Groq API (Llama 3 / Mixtral engines).
- **MCP Protocol**: Stdio JSON-RPC 2.0 server (`app/backend/mcp_server.py`).

---

## 2. Brand Personality & Target User

- **Brand Personality**: Warm, intimate, elegant, soothing, and luxurious. It feels like a private sanctuary built exclusively for two people.
- **Target User**: Long-distance and co-located couples who want an intimate, zero-friction space to share daily moments, weather, music, memories, and thoughts.
- **Visual Principle**: Glassmorphism with warm obsidian dark mode, soft rounded cards, tactile micro-haptics, and zero jarring default browser/framework styles.

---

## 3. Color Palette & Design Tokens

### Dark Mode Tokens (Primary Theme)
- **Background (`bg`)**: `#12100E` (Deep obsidian warm dark)
- **Surface (`surface`)**: `#1C1916` (Soft warm card surface)
- **Surface Level 2 (`surface2`)**: `#251F1C` (Subtle input/pill background)
- **Surface Level 3 (`surface3`)**: `#2E2722` (High contrast containers)
- **Primary Accent (`rose`)**: `#D97B66` (Warm terracotta rose)
- **Primary Glow (`roseDim`)**: `rgba(217, 123, 102, 0.15)`
- **Secondary Accent (`gold`)**: `#BFA67E` (Champagne gold)
- **Secondary Glow (`goldDim`)**: `rgba(191, 166, 126, 0.15)`
- **Utility Blue (`blue`)**: `#6B9BF5` / `rgba(107, 155, 245, 0.15)`
- **Utility Green (`green`)**: `#7AB88A` / `rgba(122, 184, 138, 0.15)`
- **Primary Text (`text`)**: `#F5F0EC` (Warm off-white, high legibility)
- **Secondary Text (`textSec`)**: `#C4AFA8` (Soft muted rose-tinted text)
- **Muted Text (`muted`)**: `#7A6A64` (Subtle metadata & labels)
- **Borders & Dividers (`line`)**: `rgba(245, 240, 236, 0.08)`
- **Strong Borders (`lineStr`)**: `rgba(245, 240, 236, 0.14)`

### Light Mode Tokens
- **Background (`bg`)**: `#F9F7F2` (Cream warm paper)
- **Surface (`surface`)**: `#FFFFFF` (Pure white card)
- **Surface Level 2 (`surface2`)**: `#F0EDE8`
- **Primary Text (`text`)**: `#261C1A` (Deep warm dark brown)

---

## 4. Typography Scale

- **H1 (Large Headers)**: `30px` · `Weight: 700` · `Letter Spacing: -0.5px`
- **H2 (Section Titles)**: `24px` · `Weight: 700` · `Letter Spacing: -0.3px`
- **H3 (Card Headers)**: `20px` · `Weight: 600`
- **H4 (Subheaders)**: `18px` · `Weight: 600`
- **Body**: `15px` · `Weight: 400` · `Line Height: 22px`
- **Body Medium**: `14px` · `Weight: 400` · `Line Height: 20px`
- **Caption**: `12px` · `Weight: 400` · `Muted`
- **Label / Eyebrow**: `11px` · `Weight: 700` · `Letter Spacing: 1.4px` · `UPPERCASE`

---

## 5. Spacing, Radius & Glassmorphic Elevation

### Spacing Scale
- `xs: 4px` · `sm: 8px` · `md: 16px` · `lg: 24px` · `xl: 32px` · `xxl: 48px`

### Border Radius
- `sm: 8px` (Chips & small badges)
- `md: 12px` (Inputs & action items)
- `lg: 16px` (Standard cards)
- `xl: 24px` (Large glassmorphic feature containers)
- `full: 999px` (Pills & floating action buttons)

### Shadows & Glassmorphism
- **Standard Card Elevation**: `shadowColor: '#000'`, `shadowOpacity: 0.15`, `shadowRadius: 16`, `shadowOffset: { width: 0, height: 6 }`
- **Primary Glow Elevation**: `shadowColor: '#D97B66'`, `shadowOpacity: 0.25`, `shadowRadius: 10`

---

## 6. Component Style Contracts

### Buttons (`src/components/Button.tsx`)
- Must use `reanimated` spring physics (`mass: 0.3`, `stiffness: 400`, `damping: 30`) on press.
- Must trigger haptic feedback (`haptics.light()` or `haptics.medium()`).
- Height: `sm: 40px`, `md: 48px`, `lg: 56px`. Corner radius: `18px`.

### Inputs (`src/components/Input.tsx`)
- Surface 2 background (`#251F1C`), subtle 1px border (`line`).
- Active focus state highlights border with `rose` (`#D97B66`).

### Cards (`src/components/Card.tsx`)
- `backgroundColor: colors.surface`, `borderWidth: 1`, `borderColor: colors.line`.
- Corner radius: `radius.xl` (`24px`).

---

## 7. Complete Application Route Index by Flow (35 Routes)

```
1. AUTH & ONBOARDING FLOW
├── Login / Signup (/(auth)/index)
├── Partner Pairing (/(auth)/pair)
└── Initial Onboarding (onboarding.tsx)

2. HOME & PRESENCE FLOW
├── Home Dashboard (index.tsx)
├── Live Connection Hub (connect.tsx)
├── Breathe Together (breathe.tsx)
├── Heartbeat Sync (heartbeat.tsx)
└── Activity Feed & Notifications (notifications.tsx)

3. COMMUNICATION & INTIMACY FLOW
├── Live Chat (chat.tsx)
├── Open When Letters (open-when.tsx)
├── Collaborative Shared Note (shared-note.tsx)
├── Quick Love Notes (notes.tsx)
└── Video Call (video-call.tsx)

4. DISCOVERY & ACTIVITIES FLOW
├── AI Date Ideas (date-ideas.tsx)
├── Couple Quiz & Trivia (couple-quiz.tsx)
├── Ask Aria AI Coach (aria.tsx)
├── Shared Lists (shared-lists.tsx)
├── Wishlist (wishlist.tsx)
└── Bucket List & Goals (goals.tsx)

5. MEMORIES & RECAPS FLOW
├── Memories Gallery (memories.tsx)
├── Photo Vault (photos.tsx)
├── Quick Snaps (snaps.tsx)
├── Personal Journal (journal.tsx)
├── Our Joint Journal (our-journal.tsx)
└── Time Capsule (time-capsule.tsx)

6. LIFE & PLANNING FLOW
├── Couple Calendar (calendar.tsx)
├── Trip Planner (trip-planner.tsx)
├── Joint Savings (savings.tsx)
├── Expense Tracker (expenses.tsx)
└── Shared Todo (todo.tsx)

7. HEALTH & SETTINGS FLOW
├── Period & Cycle Sync (health.tsx)
├── Partner Health View (health-partner.tsx)
├── Couple Profile (couple-profile.tsx)
├── Relationship Milestones (us.tsx)
└── App Settings & More (more.tsx)
```

---

## 8. Do / Don't Design Rules

- ❌ **DON'T**: Use harsh default colors (`#FF0000`, `#0000FF`) or plain unstyled inputs.
- ✅ **DO**: Use curated theme tokens (`colors.rose`, `colors.gold`, `colors.surface2`).
- ❌ **DON'T**: Design screens with static non-interactive lists.
- ✅ **DO**: Add micro-haptics, spring animations, and smooth touch feedback to every pressable item.
