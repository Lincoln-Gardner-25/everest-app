# Everest — Product Specification

**Version:** 1.0
**Date:** March 2026
**Status:** MVP Complete — Deployed to Production

---

## 1. Product Overview

### Problem Statement
Freelance videographers struggle to understand whether a project was actually profitable. They quote a job, work on it, and often don't know until it's over — if at all — whether they earned a good hourly rate. Without real-time insight, they repeat the same pricing mistakes.

### Solution
Everest is a web app that gives freelancers peace of mind by tracking Income Per Hour (IPH) in real time across projects. It combines time tracking, income tracking, and goal management into a single lightweight tool designed for solo operators.

### Core Metric: Income Per Hour (IPH)
```
IPH = Quoted Amount / Actual Hours Logged
```
IPH is the primary metric shown throughout the app. A project's IPH increases when fewer hours are logged, and decreases when time runs over the quote. The goal is to help users build an intuition for how their time translates to income.

### Name
Named after the NK Rugged Landscape model — the idea that freelancers have a local "peak" they're trying to climb (their income goal), and Everest helps them find it.

---

## 2. Target User

- **Who:** Solo freelance videographers
- **Experience level:** Hobbyist to mid-career professional
- **Pain points:** Losing track of hours, under-quoting, not knowing if projects were worth it
- **Device:** Desktop-first (used while at a computer working)
- **Tech comfort:** Moderate — comfortable with basic web apps

---

## 3. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | `src/` directory, `@/*` path alias |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS v4 | OKLCH color space for brand tokens |
| Components | shadcn/ui v3 | Tailwind v4 compatible build |
| Auth | Firebase Auth | Email/password + Google Sign-In |
| Database | Firestore | Realtime subscriptions via `onSnapshot` |
| State | Zustand | Lightweight global state |
| Charts | Recharts | Dashboard KPI charts |
| Calendar | FullCalendar v6 | `@fullcalendar/react` + `daygrid` + `timegrid` |
| Icons | Lucide React | Consistent icon set |
| Fonts | Inter + Libre Baskerville | Inter = UI body, Libre Baskerville = headings |
| Deployment | Vercel | Hobby plan (free) — auto-deploys from GitHub main |
| Source Control | GitHub | https://github.com/Lincoln-Gardner-25/everest-app |
| Cost | $0 | Firebase Spark (free) + Vercel Hobby (free) |

**Constraint:** No Firebase Cloud Functions — all server logic lives in Next.js API routes or Server Actions (Cloud Functions requires a paid Firebase plan).

---

## 4. Brand & Design System

### Color Palette (Tailwind CSS v4 OKLCH tokens)

| Token | Name | OKLCH | Hex |
|-------|------|-------|-----|
| `--color-primary` | Slate Blue | `oklch(0.485 0.092 255)` | `#4A6FA5` |
| `--color-secondary` | Teal | `oklch(0.73 0.11 192)` | `#2ABFBF` |
| `--color-accent` | Amber | `oklch(0.76 0.18 72)` | `#F59E0B` |
| `--color-success` | Green | `oklch(0.70 0.16 162)` | `#10B981` |
| `--color-foreground` | Charcoal | `oklch(0.22 0.02 264)` | `#1F2937` |
| `--color-muted` | Light Gray | `oklch(0.97 0.003 264)` | — |

### Typography
- **Headings:** Libre Baskerville (serif) — editorial, trustworthy
- **Body / UI:** Inter (sans-serif) — clean, legible

### Mood
Positive, uplifting, encouraging. The app should feel like a supportive coach, not a stressful accounting tool.

---

## 5. Architecture

### Route Structure
```
/                          → redirects to /dashboard (authenticated) or /login
/(auth)/login              → email/password + Google sign-in
/(auth)/signup             → creates account → redirects to /onboarding
/onboarding                → 3-step wizard (no sidebar)
/(app)/dashboard           → protected — KPI overview
/(app)/projects            → protected — project management
/(app)/timer               → protected — time tracking
/(app)/calendar            → protected — calendar view
/(app)/settings            → protected — user profile/goals
```

### Route Groups
- `(auth)` — split-panel layout, no sidebar, unauthenticated access
- `(app)` — sidebar layout, auth-guarded; redirects unauthenticated users to `/login`

### Auth Flow
1. User visits any `/(app)/*` route
2. `(app)/layout.tsx` checks `useAuth()` — if no user, redirects to `/login`
3. After login/signup, users with `onboardingComplete: false` are sent to `/onboarding`
4. After onboarding, users land on `/dashboard`

### Data Flow
- All Firestore reads use realtime `onSnapshot` subscriptions (not one-time fetches)
- Subscriptions are set up in `useEffect` and cleaned up on unmount via the returned unsubscribe function
- `subscribeToProjects` and `subscribeToUserSessions` in their lib files are the canonical patterns for all listeners
- Writes use standard Firestore `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`
- `actualHoursTotal` on projects is updated atomically with `increment()` in `clockOut` — never recalculated from sessions

---

## 6. Firestore Schema

### `users/{userId}`
```
monthlyGoal:        number        — income goal for the current month (dollars)
yearlyGoal:         number        — annual income goal (dollars)
targetHourlyRate:   number        — desired IPH floor (dollars/hr)
specialty:          string[]      — e.g. ["Wedding", "Commercial"]
onboardingComplete: boolean
createdAt:          timestamp
```

### `projects/{projectId}`
```
userId:             string
name:               string        — project title
clientName:         string
projectType:        string        — e.g. "Wedding", "Corporate"
quotedAmount:       number        — total quoted price (dollars)
estimatedHours:     number        — hours estimated when quoting
actualHoursTotal:   number        — running total, incremented via increment() on clockOut
status:             "active" | "review" | "completed"
notes:              string
createdAt:          timestamp
completedAt:        timestamp | null
```

### `sessions/{sessionId}`
```
userId:             string
projectId:          string
startTime:          timestamp     — written as serverTimestamp(); null briefly on first snapshot
endTime:            timestamp | null  — null = actively clocked in
durationMinutes:    number
notes:              string
```

### Firestore Rules
Defined in `firestore.rules`. Must be published in Firebase Console (Firestore → Rules → Publish) for production reads/writes to work.

### Composite Indexes
Defined in `firestore.indexes.json`. Required for Timer and Calendar queries (sessions ordered by startTime + filtered by userId/projectId). Deploy via:
```
npx firebase-tools deploy --only firestore:indexes --project everest-app-c7664
```

---

## 7. Feature Inventory

### 7.1 Authentication
- Email/password sign-in and sign-up
- Google OAuth sign-in
- Auth state managed via `AuthContext` (`src/context/AuthContext.tsx`)
- Form validation with `react-hook-form` + `zod`
- Route protection via `(app)/layout.tsx` — unauthenticated users redirect to `/login`

### 7.2 Onboarding (3-step wizard)
**Step 1 — Income Goal:** User sets monthly income goal (dollar amount)
**Step 2 — Specialty & Rate:** User selects project specialties (multi-select) and sets target hourly rate
**Step 3 — Confirm:** Summary review before saving
On completion, writes to `users/{userId}` in Firestore and sets `onboardingComplete: true`.

### 7.3 Projects
**List view:** Projects grouped by status (Active, In Review, Completed)
**Create:** Dialog form — name, client, project type, quoted amount, estimated hours, notes
**Live IPH preview:** Projected IPH calculated in real time as the user fills in the form
**Edit:** Same dialog pre-populated with existing project data
**Complete:** "Mark complete" → opens Project Review dialog → on confirm, status moves to `completed`
**Delete:** With error handling — permission-specific error message shown via AlertCircle banner

**Status states:**
- `active` — in progress, currently being tracked
- `review` — marked complete by user, pending review confirmation
- `completed` — reviewed and closed

### 7.4 Project Review Dialog
Triggered when user marks a project complete. Shows:
- Estimated vs actual hours with variance
- Projected IPH (based on estimate) vs actual IPH (based on logged hours)
- Color-coded variance indicators (green = better than projected, amber = over)
- Narrative insight — a generated sentence summarizing how the project went
- Confirm/cancel — confirming finalizes the project as `completed`

### 7.5 Timer
- Project selector — dropdown of active projects; locks while a session is running
- Live HH:MM:SS clock — ticks every second via `setInterval`
- Clock In / Clock Out buttons
- Session history for the selected project — list of past sessions with date, start/end times, duration
- `serverTimestamp()` null guard — `isValidTimestamp()` prevents calling `.toMillis()` on a pending FieldValue (first `onSnapshot` may have `startTime: null`)

### 7.6 Dashboard
- **Greeting:** Time-of-day aware ("Good morning / afternoon / evening")
- **Pace banner:** Compares completed-project income earned this month vs. the expected pace for this point in the month. States: `ahead`, `on-track`, `behind`, `neutral` (no data). Color-coded with icon.
- **Monthly income progress bar:** `earned this month / monthly goal` — shows dollar amounts and percentage
- **IPH vs target:** Average IPH across completed projects this month vs. target hourly rate
- **Active project count:** Number of projects currently in `active` status

### 7.7 Calendar
- FullCalendar with month and week views (toggle)
- Work sessions displayed as time blocks, color-coded by project
- Completed projects displayed as all-day revenue badges on their `completedAt` date
- Project legend — lists projects with their assigned colors
- Dynamically imported (`next/dynamic` with `ssr: false`) to avoid SSR issues with FullCalendar

### 7.8 Settings
- Edit monthly income goal
- Edit target hourly rate
- Edit specialties (multi-select)
- Uses `setDoc` with `{ merge: true }` — safe whether or not the user document already exists (covers Google sign-in users who skipped onboarding)

---

## 8. Key Files

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout — wraps app in `AuthProvider` + `TooltipProvider` + font variables |
| `src/app/(app)/layout.tsx` | Protected shell — auth guard + sidebar |
| `src/app/(auth)/layout.tsx` | Auth pages layout — split-panel design |
| `src/app/(auth)/login/page.tsx` | Login page — email + Google sign-in |
| `src/app/(auth)/signup/page.tsx` | Signup page → redirects to `/onboarding` |
| `src/app/onboarding/page.tsx` | 3-step onboarding wizard |
| `src/app/(app)/dashboard/page.tsx` | Dashboard — pace banner + IPH + monthly goal + active projects |
| `src/app/(app)/projects/page.tsx` | Projects CRUD — list, create, edit, complete, delete |
| `src/app/(app)/timer/page.tsx` | Timer — clock in/out, live clock, session history |
| `src/app/(app)/calendar/page.tsx` | Calendar — FullCalendar wrapper |
| `src/app/(app)/settings/page.tsx` | Settings — goals, rate, specialty |
| `src/context/AuthContext.tsx` | Firebase auth context — `signIn`, `signUp`, `signInWithGoogle`, `signOut` |
| `src/lib/firebase.ts` | Firebase client init — exports `auth` and `db` |
| `src/lib/projects.ts` | Firestore CRUD + realtime subscription for projects |
| `src/lib/sessions.ts` | Firestore CRUD for sessions — `clockIn`, `clockOut`, `subscribeToActiveSession`, `subscribeToProjectSessions`, `subscribeToUserSessions` |
| `src/components/layout/AppSidebar.tsx` | Sidebar nav with sign-out button |
| `src/components/projects/ProjectFormDialog.tsx` | Create/edit project dialog with live IPH preview |
| `src/components/projects/ProjectReviewDialog.tsx` | Completion review dialog — hours + IPH variance + narrative |
| `src/components/calendar/CalendarView.tsx` | FullCalendar component — color-coded sessions + legend |
| `src/components/ui/` | shadcn/ui components |
| `firestore.rules` | Firestore security rules — must be deployed to Firebase Console |
| `firestore.indexes.json` | Composite index config — deploy via Firebase CLI |
| `firebase.json` | Firebase CLI config |
| `.env.local` | Firebase env vars (excluded from git) |

---

## 9. Deployment

### Vercel (Frontend)
- **URL:** https://vercel.com/lincoln-gardners-projects/everest-app
- **Auto-deploy:** Every push to `main` triggers a new production deployment
- **Env vars:** All 7 `NEXT_PUBLIC_FIREBASE_*` vars added to Vercel dashboard
- **Deploy command:** `git add <files> && git commit -m "message" && git push`

### Firebase
- **Project:** `everest-app-c7664`
- **Auth providers:** Email/Password, Google
- **Firestore:** Production database on Spark (free) plan

### GitHub
- **Repo:** https://github.com/Lincoln-Gardner-25/everest-app
- **Branch strategy:** `main` is the production branch
- **Secrets excluded:** `.env.local` excluded via `.gitignore`; `.claude/` also excluded

---

## 10. Remaining Deployment Steps

These are manual steps that cannot be done via code — they require console access:

| # | Task | Where | Why |
|---|------|--------|-----|
| 1 | Publish Firestore security rules | Firebase Console → Firestore → Rules → Publish | Production reads/writes are blocked without published rules |
| 2 | Deploy Firestore indexes | Run `npx firebase-tools deploy --only firestore:indexes --project everest-app-c7664` | Required for Timer and Calendar queries to run without errors |
| 3 | Add Vercel domain to Firebase Auth | Firebase Console → Authentication → Settings → Authorized domains | Required for Google Sign-In to work on the production URL |

---

## 11. Engineering Notes & Gotchas

### `serverTimestamp()` null guard
`clockIn` writes `startTime` as `serverTimestamp()`. Firestore resolves this asynchronously — the first `onSnapshot` fires before the server responds, so `startTime` is `null` in that first event. Always guard with `isValidTimestamp()` before calling `.toMillis()`:
```ts
function isValidTimestamp(ts: unknown): ts is { toMillis: () => number } {
  return ts != null && typeof (ts as { toMillis?: unknown }).toMillis === "function";
}
```
See `src/app/(app)/timer/page.tsx` for the canonical pattern.

### `actualHoursTotal` is append-only
`actualHoursTotal` on a project is updated atomically via Firestore `increment()` inside `clockOut`. It is never recalculated from sessions. This means deleting a session does not automatically correct the total.

### Settings uses `setDoc` with `merge: true`
This covers the case where a Google sign-in user skipped onboarding and has no user document — `merge: true` creates or updates without overwriting unrelated fields.

### FullCalendar must be dynamically imported
FullCalendar uses browser APIs that are incompatible with Next.js SSR. `CalendarView` must be imported with:
```ts
const CalendarView = dynamic(() => import("@/components/calendar/CalendarView"), { ssr: false });
```

### No Cloud Functions
All logic lives in client-side React or Next.js API routes/Server Actions. Firebase Cloud Functions require the Blaze (paid) plan.

### Port configuration
- Dev server: `npm run dev` → `localhost:3000` (falls back to `3001` if taken)
- `.claude/launch.json` is configured for port `3001` for Claude's preview tool

---

## 12. Feature Backlog (Not Yet Built)

These features have been identified but not yet implemented:

- **Invoice generation** — export a PDF invoice from a completed project
- **Multi-rate sessions** — different billing rates per session (e.g. shoot vs. edit)
- **Client portal** — shareable project status page for clients
- **Earnings history / analytics** — charts showing IPH trends over time (Recharts is already installed)
- **Push notifications / reminders** — nudge when no sessions logged in X days
- **Mobile layout** — current design is desktop-first; responsive optimization needed
- **Dark mode** — brand palette supports it but not yet implemented
- **CSV export** — export session/project data for tax reporting
