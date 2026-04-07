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
| `src/app/(app)/dashboard/page.tsx` | Dashboard — pace banner + IPH + monthly goal + active projects |
| `src/app/(app)/projects/page.tsx` | Full projects CRUD — create, list, edit, complete (via review), delete; real-time IPH stats + color-coded bars |
| `src/app/(app)/timer/page.tsx` | Timer — clock in/out, live elapsed, session history |
| `src/app/(app)/calendar/page.tsx` | Calendar — FullCalendar month/week, sessions + completions |
| `src/app/(app)/settings/page.tsx` | Settings — password change + password reset email + contract scanner toggle |
| `src/context/AuthContext.tsx` | Firebase auth context (signIn, signUp, Google, signOut, connectGmail) — requests `gmail.readonly` scope |
| `src/lib/gmail.ts` | Gmail API service — search signed contracts, extract amounts from thread bodies, import tracking, scan toggle |
| `src/components/projects/GmailImportWizard.tsx` | Import cards for detected contracts — pre-filled fields, smart estimate hints, dismiss/import |
| `src/lib/firebase.ts` | Firebase client (auth + db exports) |
| `src/lib/projects.ts` | Firestore CRUD + realtime subscription for projects |
| `src/lib/sessions.ts` | Firestore CRUD for sessions — clockIn, clockOut, manual create/edit/delete, subscriptions |
| `src/components/projects/ProjectSessionsDialog.tsx` | Per-project time entries dialog — stats, manual entry, edit/delete sessions |
| `src/components/layout/AppSidebar.tsx` | Sidebar nav with sign-out |
| `src/components/projects/ProjectFormDialog.tsx` | Create/edit project dialog with live IPH preview |
| `src/components/projects/ProjectReviewDialog.tsx` | Review dialog on project completion — hours + IPH variance + narrative |
| `src/components/calendar/CalendarView.tsx` | FullCalendar component — color-coded by project, legend, month/week views |
| `src/app/(app)/leads/page.tsx` | Leads — Google Maps + Places search + AI scoring + Excel export |
| `src/app/api/leads/search/route.ts` | API route — geocode, Places Text Search/Details, Claude AI scoring |
| `src/lib/leads.ts` | Firestore CRUD for lead searches — save + fetch past searches |
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
  - projectId: string
  - startTime: timestamp       ← written as serverTimestamp(); may be null briefly on first snapshot
  - endTime: timestamp | null  ← null means actively clocked in
  - durationMinutes: number
  - notes: string

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
- [x] App shell: sidebar, layout, all 5 nav routes
- [x] Projects CRUD — create, list (grouped by status), edit, mark complete, delete
- [x] Projected IPH shown live in the project form
- [x] Firestore security rules (`firestore.rules`) + composite index config (`firestore.indexes.json`)
- [x] `src/lib/sessions.ts` — clockIn, clockOut, createManualSession, updateSession, deleteSession (batched writes), subscribeToActiveSession, subscribeToProjectSessions, subscribeToUserSessions (all with onError callbacks)
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

## What Still Needs Doing
- **Leads feature on `feature/leads-tab` branch** — needs env vars + live end-to-end testing before merging to main
- Add env vars to `.env.local` and Vercel: `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`
- Enable Google Maps JavaScript API + Places API + Geocoding API in Google Cloud Console
- Add Firestore security rules for `leadSearches` collection
- Add composite Firestore index for `leadSearches` (userId + createdAt desc)
- Live test Gmail contract scanner with real Google sign-in + signed contract email
- Verify auto-extracted quoted amounts are accurate across different contract formats

## Google Cloud Console Setup (project: everest-app-c7664)
- **Gmail API**: enabled in APIs & Services > Library
- **OAuth consent screen**: `gmail.readonly` scope added under Data Access > Restricted scopes
- **OAuth client** (Web client, auto-created by Firebase): authorized JS origins include `https://everest-app-delta.vercel.app`; authorized redirect URIs include `https://everest-app-delta.vercel.app/__/auth/handler`
- **Test users**: app is in "Testing" mode — only users listed under Audience > Test users can sign in. Add new testers there.
- **Firebase Auth**: `everest-app-delta.vercel.app` added as authorized domain in Authentication > Settings > Authorized domains
- **Local branches**: `main-one` = pre-merge snapshot of main; `main-two` = main with moneyt merged (same as current `main`); `feature/leads-tab` = leads feature (code complete, needs env vars + testing)

## Important Notes
- All APIs/services are $0 — Firebase Spark (free tier), Vercel Hobby (free)
- Do NOT use Firebase Cloud Functions — logic stays in Next.js API routes/Server Actions (Cloud Functions requires paid plan)
- `actualHoursTotal` on projects is updated atomically via Firestore `increment()` in `clockOut`, `createManualSession`, `updateSession`, and `deleteSession` — never recomputed from scratch. Manual session CRUD uses `writeBatch` for atomic multi-doc updates
- `serverTimestamp()` in `clockIn` resolves asynchronously — the first `onSnapshot` fires with `startTime: null`. Always guard with `isValidTimestamp()` before calling `.toMillis()`. See timer page for the pattern.
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
