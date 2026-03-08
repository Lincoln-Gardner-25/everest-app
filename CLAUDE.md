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
- **Fonts**: Inter (body/UI) + Libre Baskerville (headings)
- **Deployment**: Vercel (not yet configured)

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
| `src/app/(app)/projects/page.tsx` | Full projects CRUD — create, list, edit, complete (via review), delete |
| `src/app/(app)/timer/page.tsx` | Timer — clock in/out, live elapsed, session history |
| `src/app/(app)/calendar/page.tsx` | Calendar — FullCalendar month/week, sessions + completions |
| `src/app/(app)/settings/page.tsx` | Settings — edit monthly goal, target rate, specialty |
| `src/context/AuthContext.tsx` | Firebase auth context (signIn, signUp, Google, signOut) |
| `src/lib/firebase.ts` | Firebase client (auth + db exports) |
| `src/lib/projects.ts` | Firestore CRUD + realtime subscription for projects |
| `src/lib/sessions.ts` | Firestore CRUD for sessions — clockIn, clockOut, subscriptions |
| `src/components/layout/AppSidebar.tsx` | Sidebar nav with sign-out |
| `src/components/projects/ProjectFormDialog.tsx` | Create/edit project dialog with live IPH preview |
| `src/components/projects/ProjectReviewDialog.tsx` | Review dialog on project completion — hours + IPH variance + narrative |
| `src/components/calendar/CalendarView.tsx` | FullCalendar component — color-coded by project, legend, month/week views |
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
- [x] `src/lib/sessions.ts` — clockIn, clockOut, subscribeToActiveSession, subscribeToProjectSessions, subscribeToUserSessions (all with onError callbacks)
- [x] Timer — project selector (locks while clocked in), live HH:MM:SS clock, Clock In/Out, session history, serverTimestamp null guard
- [x] Dashboard KPIs — greeting, pace banner (ahead/on-track/behind/neutral), monthly income progress bar, IPH vs target, active project count
- [x] Project Review dialog — triggered on "Mark complete"; shows estimated vs actual hours, projected vs actual IPH, color-coded variance, narrative insight
- [x] Calendar — FullCalendar month/week views, color-coded sessions as time blocks, completed projects as all-day revenue badges, project legend; dynamically imported (ssr: false)
- [x] Settings — monthly goal + target rate + specialty; uses setDoc merge:true (safe for users who skipped onboarding)
- [x] `firebase.json` for CLI deployments

## What Still Needs Doing
1. **Deploy Firestore rules** — paste `firestore.rules` into Firebase Console → Firestore → Rules → Publish
2. **Deploy Firestore indexes** — run `npx firebase-tools login` then `npx firebase-tools deploy --only firestore:indexes --project everest-app-c7664` (or click the auto-generated links in browser console errors)
3. **Deploy to Vercel** — run `npx vercel` from project root; add Firebase env vars in Vercel dashboard

## Important Notes
- All APIs/services are $0 — Firebase Spark (free tier), Vercel Hobby (free)
- Do NOT use Firebase Cloud Functions — logic stays in Next.js API routes/Server Actions (Cloud Functions requires paid plan)
- `actualHoursTotal` on projects is updated atomically via Firestore `increment()` in `clockOut` — never recomputed from scratch
- `serverTimestamp()` in `clockIn` resolves asynchronously — the first `onSnapshot` fires with `startTime: null`. Always guard with `isValidTimestamp()` before calling `.toMillis()`. See timer page for the pattern.
- Settings uses `setDoc` with `{ merge: true }` — safe whether or not the user doc exists (covers Google sign-in users who skipped onboarding)
- Use `subscribeToProjects` / `subscribeToUserSessions` patterns from their respective lib files for all realtime listeners
- Firestore security rules are in `firestore.rules` — must be published in Firebase Console to allow reads/writes in production
- Dev server: `npm run dev` → localhost:3000 (or port 3001 if 3000 is taken)
- `.claude/launch.json` is configured for port 3001 (used by Claude's preview tool)
