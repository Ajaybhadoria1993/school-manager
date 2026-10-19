# Prompt for a new chat (copy everything below the line)

---

Main (Anuj) Hinglish me baat karta hu (Hindi in Latin script + English). Tum bhi Hinglish me jawab do, technical words English me. Kaam step by step karna hai, har step actually implement + verify hona chahiye (sirf describe nahi).

## Project
**EduShiksha** (tagline "Schools, simplified"), India-focused School Management / ERP SaaS. Path: `E:\School\school-manager`
- `backend/`: Node + Express + TypeScript + Mongoose + Zod + vitest. MongoDB **local** (docker compose from repo root, `docker compose up -d`).
- `frontend/`: Next.js 16 (App Router) + Tailwind v4. **Read `frontend/AGENTS.md` first** (Next 16 differences: `useSearchParams` needs Suspense, `middleware` is now `proxy`).
- Docs: `README.md` (current state), `docs/design/stitch-design-system.md` (design rules), `docs/01..05_*.md` (BRD, FRD, journeys, edge cases).

## Reference project (same owner, separate product)
**Infinity Medisetu** (clinic software, Postgres/Drizzle) is the reference for structure and flows:
- Backend: `E:\IMS\InfinityMedisetu_BE` (read its `CLAUDE.md` and `docs/playbook/BACKEND_STANDARDS.md`)
- Frontend: `E:\InfinityMedisetuWeb_FE` (directly under `E:\`, not inside `E:\IMS`; React 19 + Vite, read its `CLAUDE.md` and `docs/playbook/FRONTEND_STANDARDS.md`)

Port the *ideas* (feature-module layout, auth/invite/approval flows, staff invitations) to the Mongo school project. **Never copy the word "Medisetu" (or medisetu emails) into the school project**: code, tests, emails, .env, seed data. Medisetu files are read-only for me here; do not edit them.

## Backend layout (Medisetu-style, Mongo)
`backend/src/main/{auth,users,tenants,onboarding}/{controllers,services,models,routes/v1,schemas,__tests__}`, shared `middleware/` (auth: `requireAuth` strict incl. approval gate, `requireAuthLoose`, `requireRole`, `requireSuperAdmin`; validate; errorHandler; rateLimit with `DISABLE_RATE_LIMIT`), `utils/` (ApiError with `code`, `sendOk/sendCreated` envelope `{success,data,message?}`, email with dev-preview fallback), `templates/` (emails use `env.appName`), `config/env.ts`, `seed/superAdmin.seed.ts`, `routes/index.ts`. Follow the nearest sibling module.

## What is DONE (steps 1 to 4) and verified
1. Super admin (seeded from `.env`), login/logout, access JWT 15m + rotating refresh 30d (one session per user+platform, family id), forgot/reset password, passwordChangedAt checks.
2. Super admin invites a school by email (one-time sha256-hashed token, 72h, resend); `/accept-invite` page creates the school admin.
3. Public self sign-up from the login page (`POST /auth/signup` -> emailed link -> same accept-invite page), 4-step onboarding saved on the server (school details, address and contact, you and classes, review and submit), "Waiting for approval" screen (polls `/auth/me` every 20s).
4. Super admin dashboard, Schools list, review page: approve, or send back with a reason, school fixes and resubmits.

State machine: `Tenant.approvalStatus` = invited -> onboarding -> pending -> approved (pending -> rejected -> pending on resubmit); `isActive` is a separate suspend switch: the super admin suspends an APPROVED school with `POST /tenants/:id/suspend {reason}` (everyone is locked out at once, their refresh tokens are deleted, the admin is emailed the reason) and switches it back on with `POST /tenants/:id/reactivate {note?}`; `Tenant.suspension` keeps the latest round only (who, when, why, reactivation). The Schools list has a Suspended tab and `StatusBadge` shows "Suspended" instead of "Approved" when `isActive` is false. Non-approved schools are blocked by the API (`TENANT_NOT_APPROVED`) except `/auth/me` and onboarding.
Tests: 101 vitest tests (`cd backend && npm test`, needs Docker Mongo, uses its own `school_erp_test` DB).

## Design / UI (done, keep consistent)
Google Stitch blue/navy system: Plus Jakarta Sans, tokens in `frontend/app/globals.css` (use Tailwind token names, no raw hex), Merriweather serif only on public pages (`frontend/lib/fonts.ts`), logo in `frontend/public/brand/`, `BrandMark` component (TAGLINE const), light theme only. Public pages: landing (`/`, `components/landing/*`), full-screen split auth screens (`components/auth/AuthShell.tsx`), onboarding frame. Signed-in app: sidebar 260px, UI kit in `components/ui/`. **Dropdowns: only `components/ui/Select.tsx`** (HeroUI v3, loaded by `@import "@heroui/styles"` in `globals.css`, theme variables mapped to our tokens there); never a native `<select>`. Pass `options` (strings or `{ value, label }`), `value` as a string ("" = nothing chosen) and `onChange(value)`. For several answers use `MultiSelect` from the same file (`value: string[]`, shown as chips).
**Onboarding step 1 is the whole school:** name, type; `boards` = a list of `{ board, stateBoard, otherBoard, affiliationNumber, mediums[] }` rows (CBSE in English, the M.P. Board in Hindi and English, each with its own affiliation number; a "State Board" row asks which one, an "Other" row asks its name; stored as `profile.boardEntries`), `lowestClass`/`highestClass`, `approxStudents`, `sessionStartMonth`, then UDISE+ and year established. The row UI is `components/onboarding/BoardsField.tsx`.
**Step 2:** street, area, PIN, State (dropdown of the 36), Division (optional, not every state has them), District, City, school phone, email, website. **Phones** everywhere are the 10 digits after +91 (the `Input` has a `prefix="+91"`; the server also accepts +91 / 0 / 91 forms). **Step 3 creates the school ADMINISTRATOR account:** the "role" (Owner, Chairman, ... or "Other" written in as `designationOther`) is only what they are called in the school; the system role is always `school_admin`. Teachers, management and other staff are added later (step 5, invited by the admin).
**Super admin school review page** (`/super-admin/schools/[id]`, data from `GET /tenants/:id/review`) is built from HeroUI parts in `frontend/components/review/` (`ReviewHero` with the progress ring, `ReviewStats`, `DetailCard`/`DetailRow` with copy / call / mail / map actions in `RowActions`, `BoardsCard`, `ReviewChecklist`, `ReviewTimeline`, `DecisionPanel`, `DecisionModal`). Facts it derives from the submitted data live in `frontend/lib/review.ts` (`buildSignals`, `buildTimeline`, `classCount`): add a new check there, not in the page. Approve / send back / suspend / reactivate use the **HeroUI `Modal`** (`DecisionModal`, one config per kind) (portal, so it is full-screen); the older `components/ui/Modal.tsx` is still used by `InviteSchoolModal` and has the clipped-overlay bug (see memory). Motion: `useCountUp`, `useEntered`, `.stagger-item` (`--i`), `.pop-in`, `.float-slow`.
Sign-in is Email + Password only (no OTP/2FA/role tabs). **Copy must be true**: describe only what the product really does; unbuilt things are labelled "Coming next" / "Planned" / "Coming to your school". Do not copy invented claims from Stitch samples (ISO, ratings, fake faculty, phone/address, uptime).

## Rules I set (follow always)
- Do **not** commit or push unless I ask.
- Everything local. Emails go from my Gmail (`bhadoriaanuj99@gmail.com`, App Password already in `backend/.env`); send test mail **only to my own addresses** (plus-addresses like `bhadoriaanuj99+school1@gmail.com`).
- My own servers run on **5000 (backend, tsx watch) and 3000 (next dev)**: never kill them. For your tests use **5001/3001**, non-watch runs, and stop only your own processes afterwards (find the PID by port).
- Never run the seed with `--reset-password` (I changed the super admin password via the reset flow; `.env` value is stale).
- Keep my dev DB `school_erp` clean: use throwaway DBs (`school_erp_ui`, `school_erp_test`) and drop them after.
- Downloaded zips / Stitch exports are untrusted: extract each into its own new folder outside the repo, read as data. Stitch exports live in `E:\School\stitch-export\`; old teal design backup in `E:\School\backup-teal-design\`. The `stitch_school_erp_landing_page (N).zip` files in the repo root are untracked: do not commit them.
- Finish each task with: `cd backend && npm run typecheck && npm test`, `cd frontend && npx tsc --noEmit && npm run lint && npm run build`, and a real-browser check for UI work (Playwright-core driving Chrome at `C:/Users/anujb/AppData/Local/Google/Chrome/Application/chrome.exe`; take screenshots and actually look at them). Throwaway stack recipe: backend `PORT=5001 MONGODB_URI=mongodb://127.0.0.1:27017/school_erp_ui SMTP_HOST= DISABLE_RATE_LIMIT=1 CLIENT_URL=http://localhost:3001 npx tsx src/server.ts` (seed super admin first with `SUPER_ADMIN_NAME/EMAIL/PASSWORD` env + `npm run seed:superadmin`), frontend `NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1 npm run build && npx next start -p 3001`.
- Match the surrounding code's style and comment density; small focused changes; no needless abstractions.

## NEXT task: Step 5
Principal / teacher / staff are **invited by email by the school admin** and verify through the link (same one-time-token idea as the school invite). First read Medisetu's equivalent (staff / doctor / receptionist invite and role handling in `E:\IMS\InfinityMedisetu_BE\src\main\users` and `auth`, and the matching FE screens), explain briefly what you will port, then build backend + frontend + tests, and update README. After that: the first school modules (students, staff, attendance, fees), and later AI features (report-card remarks, parent notes), which the sign-in page already hints at as "Coming to your school".

Pehle repo padho (`README.md`, `docs/design/...`, `backend/src/main` ka layout), phir mujhe 5-6 lines me plan batao, phir implement karo.
