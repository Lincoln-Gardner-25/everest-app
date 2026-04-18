# Everest — Project Briefing

## What is this?
A web app for freelance videographers. Core value: **peace of mind** through income tracking.
Primary metric: **Income Per Hour (IPH)** = total earned / total hours logged on a project.
Named after the NK Rugged Landscape model — helping freelancers find and climb their local peaks.

## Tech Stack
- **Next.js 16** + TypeScript + Tailwind v4 + App Router (`src/` dir, `@/*` alias)
- **shadcn/ui** v3 (Tailwind v4 compatible) — components in `src/components/ui/`
- **Firebase**: Auth + Firestore — project `everest-app-c7664` (free Spark plan, $0 cost)
- **FullCalendar** v6 (`@fullcalendar/react`, `daygrid`, `timegrid`, `core`)
- **Zustand** (state), **Recharts** (charts), **Lucide React** (icons)
- **Google Maps**: `@googlemaps/js-api-loader` v2 (functional API: `setOptions()` + `importLibrary()`)
- **Google Places API**: server-side only (Text Search + Place Details)
- **Anthropic Claude API**: `@anthropic-ai/sdk` — AI lead scoring in `/api/leads/search`
- **Excel Export**: `exceljs` — client-side .xlsx generation
- **Fonts**: Inter (body/UI) + Libre Baskerville (headings)
- **Deployment**: Vercel — https://vercel.com/lincoln-gardners-projects/everest-app
- **Source**: GitHub — https://github.com/Lincoln-Gardner-25/everest-app

## Brand
- Primary (Slate Blue): `oklch(0.485 0.092 255)` / `#4A6FA5`
- Secondary (Teal): `oklch(0.73 0.11 192)` / `#2ABFBF`
- Accent (Amber): `oklch(0.76 0.18 72)` / `#F59E0B`
- Success (Green): `oklch(0.70 0.16 162)` / `#10B981`
- Foreground (Charcoal): `oklch(0.22 0.02 264)` / `#1F2937`
- Mood: positive, uplifting, encouraging, modern, simple

## Key Files
| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout — AuthProvider + TooltipProvider + fonts |
| `src/app/(app)/layout.tsx` | Protected shell — auth guard + sidebar |
| `src/app/(auth)/layout.tsx` | Auth pages layout (split-panel) |
| `src/app/(auth)/login/page.tsx` | Login (email + Google) |
| `src/app/(auth)/signup/page.tsx` | Signup → redirects to /onboarding |
| `src/app/onboarding/page.tsx` | 3-step wizard: goal → specialty → confirm |
| `src/app/(app)/dashboard/page.tsx` | **Redesigned** dashboard — KPI cards (top) + pace/goals box + quick clock-in panel + embedded leads search + Google Calendar |
| `src/app/(app)/project-tracker/page.tsx` | **New** Project Tracker tab — timer (clock-in without project) + full projects list + Gmail contract scanner |
| `src/app/(app)/income-report/page.tsx` | **New** Income Report tab — goals form (monthly goal + target rate) + reflect data below |
| `src/app/(app)/leads/page.tsx` | Leads — Google Maps + Places search + AI scoring + Excel export (unchanged) |
| `src/app/(app)/settings/page.tsx` | Settings — password + Gmail toggle + **Google Calendar connect** + **GoHighLevel stub** |
| `src/app/(app)/projects/page.tsx` | Projects CRUD (kept on disk, superseded by Project Tracker in nav) |
| `src/app/(app)/timer/page.tsx` | Timer (kept on disk, superseded by Project Tracker in nav) |
| `src/app/(app)/calendar/page.tsx` | Calendar (kept on disk, content moved to dashboard) |
| `src/app/(app)/reflect/page.tsx` | Reflect (kept on disk, superseded by Income Report in nav) |
| `src/app/(app)/goals/page.tsx` | Goals (kept on disk, superseded by Income Report in nav) |
| `src/app/api/leads/search/route.ts` | API route — geocode, Places Text Search/Details, Claude AI scoring, Stripe payment gate |
| `src/app/api/webhooks/ghl/route.ts` | **New** GoHighLevel webhook stub — skeleton for contract-signed events |
| `src/components/layout/AppSidebar.tsx` | Sidebar nav — 5 tabs: Dashboard, Project Tracker, Leads, Income Report, Settings |
| `src/components/project-tracker/ProjectTrackerPage.tsx` | **New** combined timer + projects + Gmail scanner component |
| `src/components/project-tracker/AssignProjectDialog.tsx` | **New** dialog shown at clock-out — pick which project to assign the session to |
| `src/components/income-report/IncomeReportPage.tsx` | **New** goals form + reflect content in one component |
| `src/components/dashboard/QuickLeadSearch.tsx` | **New** embedded lead finder for dashboard — cost disclaimer before charging |
| `src/components/dashboard/DashboardCalendar.tsx` | **New** calendar widget for dashboard — uses Google Calendar if connected, local sessions otherwise |
| `src/components/dashboard/GoogleCalendarView.tsx` | **New** FullCalendar view that merges Google Calendar events + local Everest sessions |
| `src/context/AuthContext.tsx` | Firebase auth context — adds `calendarAccessToken`, `connectGoogleCalendar()`, `disconnectGoogleCalendar()` |
| `src/lib/googleCalendar.ts` | **New** Google Calendar API service — createProjectEvent, createClockInEvent, finalizeClockOutEvent, getCalendarEvents |
| `src/lib/sessions.ts` | Sessions CRUD — `clockIn(userId)` now takes no projectId; new `assignAndClockOut()` sets project + ends session atomically |
| `src/lib/gmail.ts` | Gmail API service — search signed contracts, extract amounts, import tracking, scan toggle |
| `src/lib/projects.ts` | Firestore CRUD + realtime subscription for projects |
| `src/lib/leads.ts` | Firestore CRUD for lead searches — save + fetch past searches |
| `src/lib/reflect-utils.ts` | Reflect helpers — project type colors, month filtering, groupBy, currency formatting |
| `src/components/projects/GmailImportWizard.tsx` | Import cards for detected contracts — pre-filled fields, smart estimate hints |
| `src/components/projects/ProjectFormDialog.tsx` | Create/edit project dialog with live IPH preview |
| `src/components/projects/ProjectReviewDialog.tsx` | Review dialog on project completion — hours + IPH variance + narrative |
| `src/components/projects/ProjectSessionsDialog.tsx` | Per-project time entries dialog — stats, manual entry, edit/delete sessions |
| `src/components/calendar/CalendarView.tsx` | FullCalendar component — color-coded by project, legend, month/week views |
| `src/components/reflect/MonthSelector.tsx` | Month navigation (prev/next arrows, disabled at current month) |
| `src/components/reflect/IncomeSummary.tsx` | Total income + color-coded breakdown grid by project type |
| `src/components/reflect/IncomeWaterfallChart.tsx` | Recharts horizontal bar chart — income by project type |
| `src/components/reflect/RankedProjectList.tsx` | Numbered project list sorted by income with IPH |
| `firebase.json` | Firebase CLI config — points to `firestore.rules` and `firestore.indexes.json` |

## Firestore Schema
```
users/{userId}
  - monthlyGoal: number
  - yearlyGoal: number
  - targetHourlyRate: number
  - specialty: string[]
  - onboardingComplete: boolean
  - createdAt: timestamp
  - importedGmailIds: string[]    ← email IDs already imported/dismissed by contract scanner
  - gmailScanEnabled: boolean     ← contract scanner toggle (default: true)

projects/{projectId}
  - userId: string
  - name: string
  - clientName: string
  - projectType: string
  - quotedAmount: number
  - estimatedHours: number
  - actualHoursTotal: number   ← incremented via Firestore increment() on clockOut
  - status: "active" | "review" | "completed"
  - notes: string
  - createdAt: timestamp
  - completedAt: timestamp | null

sessions/{sessionId}
  - userId: string
  - projectId: string | null   ← null when clocked in without a project; assigned at clock-out via assignAndClockOut()
  - startTime: timestamp       ← written as serverTimestamp(); may be null briefly on first snapshot
  - endTime: timestamp | null  ← null means actively clocked in
  - durationMinutes: number
  - notes: string
  - calendarEventId: string | null  ← Google Calendar event ID (set if calendar connected); used to finalize the event on clock-out

leadSearches/{searchId}
  - userId: string
  - location: string
  - radiusMiles: number
  - radiusMeters: number
  - categories: string[]
  - centerLat: number
  - centerLng: number
  - totalLeads: number
  - starLeads: number
  - createdAt: timestamp
  - leads: [{place_id, name, address, phone, website, rating, totalRatings, lat, lng, category, score, reason, isStarLead}]

rateLimits/{type_userId}             ← admin SDK only, no client access
  - count: number
  - resetAt: number (epoch ms)

searchCharges/{chargeId}             ← admin SDK only, audit trail for every paid search
  - userId: string
  - location: string
  - leadCount: number
  - costCents: number
  - paymentIntentId: string
  - enrichmentOptions: object
  - createdAt: timestamp
```

## What's Built
- [x] Next.js scaffold + Tailwind v4 + brand colors/fonts
- [x] shadcn/ui initialized and themed
- [x] Firebase Auth — email/password + Google sign-in
- [x] AuthContext + route protection (unauthenticated → /login)
- [x] Login and signup pages with form validation (react-hook-form + zod)
- [x] 3-step onboarding wizard (monthly goal, target rate, specialty → saves to Firestore)
- [x] App shell: sidebar, layout, all nav routes
- [x] Projects CRUD — create, list (grouped by status), edit, mark complete, delete
- [x] Projected IPH shown live in the project form
- [x] Firestore security rules (`firestore.rules`) + composite index config (`firestore.indexes.json`)
- [x] `src/lib/sessions.ts` — clockIn, clockOut, assignAndClockOut, createManualSession, updateSession, deleteSession (batched writes), subscribeToActiveSession, subscribeToProjectSessions, subscribeToUserSessions (all with onError callbacks)
- [x] Timer — project selector (locks while clocked in), live HH:MM:SS clock, Clock In/Out, session history, serverTimestamp null guard
- [x] Dashboard KPIs — greeting, pace banner (ahead/on-track/behind/neutral), monthly income progress bar, IPH vs target, active project count
- [x] Project Review dialog — triggered on "Mark complete"; shows estimated vs actual hours, projected vs actual IPH, color-coded variance, narrative insight
- [x] Calendar — FullCalendar month/week views, color-coded sessions as time blocks, completed projects as all-day revenue badges, project legend; dynamically imported (ssr: false)
- [x] Settings — password change (direct) + password reset email (via Firebase); uses setDoc merge:true (safe for users who skipped onboarding)
- [x] Manual time entries — ProjectSessionsDialog with date picker, hours input, quick-hour presets, batch entry, live IPH preview, edit/delete existing sessions
- [x] Real-time project stats — active project cards show actual hours logged + live IPH (not just estimates)
- [x] IPH color coding — project card accent bars: green (above projected IPH), amber (between target and projected), red (below target hourly rate); uses live `targetHourlyRate` from Firestore
- [x] Clickable project cards — click anywhere on a card to open time entries dialog
- [x] `firebase.json` for CLI deployments
- [x] Projects delete error handling — try/catch in `handleDelete` with AlertCircle error banner; permission-specific error message
- [x] GitHub repo created and all code pushed — https://github.com/Lincoln-Gardner-25/everest-app
- [x] Vercel deployed — production deployment confirmed successful (status: success); GitHub → Vercel auto-deploy on every push to `main`
- [x] All 7 Firebase env vars added to Vercel dashboard (`NEXT_PUBLIC_FIREBASE_*`)
- [x] `.env.local` excluded from git (`.env*` pattern in `.gitignore`); `.claude/` session files also excluded
- [x] Gmail Contract Scanner — auto-detect signed contracts from Gmail inbox, pre-fill project name + client name + quoted amount, smart estimate hints from past projects
- [x] Auto-extract quoted amount — fetches full email thread bodies via Gmail API, parses dollar amounts, pre-fills the largest amount found
- [x] Contract scanner settings toggle — on/off switch in Settings page, stored in Firestore (`gmailScanEnabled`)
- [x] Firestore-based import tracking — imported/dismissed email IDs stored in `users/{uid}.importedGmailIds` (cross-device)
- [x] `moneyt` branch merged to `main` — deployed to Vercel
- [x] Leads tab — sidebar nav entry (Search icon), links to /leads
- [x] Leads page UI — two-column layout: left (input panel + results summary + past searches), right (Google Map)
- [x] Leads input panel — location text input, radius selector (5/10/25/50 mi), multi-select business categories (19 types in 3 groups)
- [x] Leads API route (`/api/leads/search`) — geocode → Places Text Search → Place Details (200ms delay) → dedup → Claude AI scoring (batch, claude-sonnet-4-20250514) → return scored leads
- [x] Google Map — `@googlemaps/js-api-loader` v2, radius circle, star pins (score 7-10) + standard pins, InfoWindow with business details + Promote button
- [x] Leads Firestore persistence — `leadSearches` collection, past searches list (last 10), click to reload from Firestore (no re-API)
- [x] Excel export — `exceljs` client-side, styled headers, star rows highlighted gold, sorted by score, summary row
- [x] Loading/error/empty states for leads search
- [x] **`final-project` branch — major UX restructure (all below)**
- [x] Nav reduced from 8 tabs → 5: Dashboard, Project Tracker, Leads, Income Report, Settings
- [x] **Project Tracker** (`/project-tracker`) — clock in without selecting a project first; live HH:MM:SS timer; AssignProjectDialog opens on clock-out (pick project + see elapsed time); projects list + create/edit/delete below; Gmail contract scanner at top
- [x] `clockIn(userId)` — no longer requires `projectId`; stores `projectId: null` in Firestore until assigned at clock-out
- [x] `assignAndClockOut(sessionId, projectId, startTime, calendarEventId?)` — atomic `writeBatch`: sets projectId + endTime + durationMinutes on session, increments `actualHoursTotal` on project
- [x] **Income Report** (`/income-report`) — goals form (monthly goal + target hourly rate, specialty removed) with Firestore save; full reflect section below (MonthSelector, IncomeSummary, IncomeWaterfallChart, RankedProjectList)
- [x] **Dashboard redesign** — Row 1: 3 KPI cards; Row 2: Pace+Goals box (left 2/3) + Quick Clock-In panel (right 1/3); Row 3: Embedded lead finder (QuickLeadSearch); Row 4: DashboardCalendar
- [x] Dashboard Quick Clock-In panel — shows most recent active project, live elapsed time, clock-in/out without leaving dashboard, AssignProjectDialog on clock-out
- [x] Dashboard embedded lead finder — location + client type inputs, cost disclaimer banner before charging, up to 8 results inline, link to full Leads tab
- [x] Dashboard calendar — shows local FullCalendar if Google Calendar not connected; upgrades to merged Google Calendar + local session view when connected
- [x] **Google Calendar integration** — opt-in connect in Settings via GIS token flow (`https://www.googleapis.com/auth/calendar` scope); token stored in sessionStorage; `src/lib/googleCalendar.ts` service: createProjectEvent, createClockInEvent, finalizeClockOutEvent, getCalendarEvents, deleteCalendarEvent
- [x] Google Calendar events — all-day event on project create; timed event on clock-in (placeholder end); finalized with real end time + duration on clock-out; `calendarEventId` stored on session doc
- [x] **GoHighLevel stub** — `/api/webhooks/ghl/route.ts` skeleton + "Coming Soon" card in Settings with disabled API key input
- [x] AuthContext additions — `calendarAccessToken`, `connectGoogleCalendar()`, `disconnectGoogleCalendar()`, `signOut` clears both Gmail and Calendar tokens
- [x] Dashboard leads search — fixed 401 Unauthorized; now sends `Authorization: Bearer {token}` header via `user.getIdToken()`
- [x] Leads cost disclaimer on dashboard — amber banner with Cancel + "Confirm & Search" buttons gates every dashboard lead search

## What Still Needs Doing
- **Google Cloud Console** — enable **Google Calendar API** in APIs & Services > Library for project `everest-app-c7664`
- **OAuth consent screen** — add `https://www.googleapis.com/auth/calendar` scope under Data Access > Scopes (same screen where `gmail.readonly` was added)
- **GoHighLevel** — real webhook implementation deferred; needs GHL account access + webhook secret from user's brother before building out; stub is in place at `/api/webhooks/ghl/route.ts`
- **Expense tracking** — not yet built; deferred to future sprint
- Add env vars to `.env.local` and Vercel: `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY` (if not already added)
- Live test Gmail contract scanner with real Google sign-in + signed contract email
- Live test Google Calendar connect flow in Settings — verify events appear in Google Calendar on project create + clock in/out
- Merge `final-project` branch to `main` + push to Vercel when ready to deploy

## Google Cloud Console Setup (project: everest-app-c7664)
- **Gmail API**: enabled in APIs & Services > Library
- **Google Calendar API**: must be enabled in APIs & Services > Library (required for final-project calendar features)
- **OAuth consent screen**: `gmail.readonly` scope added under Data Access > Restricted scopes; `https://www.googleapis.com/auth/calendar` scope must also be added for calendar integration
- **OAuth client** (Web client, auto-created by Firebase): authorized JS origins include `https://everest-app-delta.vercel.app`; authorized redirect URIs include `https://everest-app-delta.vercel.app/__/auth/handler`
- **Test users**: app is in "Testing" mode — only users listed under Audience > Test users can sign in. Add new testers there.
- **Firebase Auth**: `everest-app-delta.vercel.app` added as authorized domain in Authentication > Settings > Authorized domains
- **Local branches**: `main-one` = pre-merge snapshot of main; `main-two` = main with moneyt merged (same as current `main`); `feature/leads-tab` = leads feature (code complete, needs env vars + testing); `final-project` = major UX restructure (current active branch)

## Important Notes
- All APIs/services are $0 — Firebase Spark (free tier), Vercel Hobby (free)
- Do NOT use Firebase Cloud Functions — logic stays in Next.js API routes/Server Actions (Cloud Functions requires paid plan)
- `actualHoursTotal` on projects is updated atomically via Firestore `increment()` in `clockOut`, `assignAndClockOut`, `createManualSession`, `updateSession`, and `deleteSession` — never recomputed from scratch. Manual session CRUD uses `writeBatch` for atomic multi-doc updates
- `serverTimestamp()` in `clockIn` resolves asynchronously — the first `onSnapshot` fires with `startTime: null`. Always guard with `isValidTimestamp()` before calling `.toMillis()`. See timer page for the pattern.
- `clockIn(userId)` no longer takes a `projectId` — project is assigned atomically at clock-out via `assignAndClockOut()`. Sessions with `projectId: null` are in-flight (active). CalendarView and all session consumers must handle `projectId: null`.
- `pendingCalendarEventId` — stored in a `useRef` on ProjectTrackerPage. Holds the Google Calendar event ID created at clock-in so it can be finalized at clock-out. Cleared after clock-out. If the user refreshes mid-session, a fresh complete event is created at clock-out instead.
- Google Calendar token — obtained via Google Identity Services (GIS) token flow, stored in sessionStorage under key `everest_calendar_token`. Restored from sessionStorage on auth state change. Session-scoped: user must reconnect after browser close.
- Dashboard leads search requires `Authorization: Bearer {token}` header — always call `user.getIdToken()` and include it. The `/api/leads/search` route validates the Firebase ID token server-side.
- Settings uses `setDoc` with `{ merge: true }` — safe whether or not the user doc exists (covers Google sign-in users who skipped onboarding)
- Use `subscribeToProjects` / `subscribeToUserSessions` patterns from their respective lib files for all realtime listeners
- Firestore security rules are in `firestore.rules` — must be published in Firebase Console to allow reads/writes in production
- Dev server: `npm run dev` → localhost:3000 (or port 3001 if 3000 is taken)
- `.claude/launch.json` is configured for port 3001 (used by Claude's preview tool)
- To deploy updates: `git add <files> && git commit -m "message" && git push` — Vercel auto-deploys from `main` on every push
- GitHub repo: https://github.com/Lincoln-Gardner-25/everest-app
- Vercel project: https://vercel.com/lincoln-gardners-projects/everest-app
- `@googlemaps/js-api-loader` v2 uses functional API — `setOptions({ key, v })` + `importLibrary("maps")`, NOT the old `new Loader({ apiKey }).load()`. Property names are `key` (not `apiKey`) and `v` (not `version`).
- Leads API route calls Google Places server-side only (`GOOGLE_PLACES_API_KEY` — no `NEXT_PUBLIC_` prefix). Client only uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for map rendering.
- **Pre-commit hook** at `.git/hooks/pre-commit` — calls Claude API (`claude-haiku-4-5-20251001`) on every commit to auto-update the "What's Built" / "What Still Needs Doing" / "Key Files" sections. Requires `ANTHROPIC_API_KEY` in shell env; skips gracefully if not set. To enable: `echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc && source ~/.zshrc`
