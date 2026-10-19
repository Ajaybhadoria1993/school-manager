# EduShiksha — India-Focused School Management & ERP SaaS

Multi-tenant School ERP, built step by step from the specs in [`docs/`](docs/) (BRD, FRD, user journeys, edge cases).

> **Status: restarted from scratch.** The earlier prototype was removed and the project is being rebuilt one step
> at a time. The previous code is still in git history (`git log`, commit `b969204` and earlier).

## What works today

**Step 1: Super Admin**

- **Super admin** account, created from `.env` by a seed script.
- **Sign in / sign out**, 15-minute access token + 30-day rotating refresh token (one session per device type),
  silent refresh in the browser, sign-out on all tabs.
- **Forgot / reset password** by email (one-time link, 15 minutes). Email is sent through your **Gmail** account
  (App Password); without it the link is printed in the backend terminal.
- Account / role checks happen on every request, so disabling a user takes effect immediately.

**Step 2: Invite a school**

- Super admin opens **Schools → Invite school** (school name + the admin's email). The admin gets an email with a
  one-time link (valid 72 hours, hashed in the database). **Resend invite** replaces the old link.
- The link opens `/accept-invite`: the admin sets name + password and is signed in. The school moves
  from *Invited* to *Setting up* (onboarding).
- A school that is not approved yet is blocked by the API (`TENANT_NOT_APPROVED`) except for `/auth/me` and the
  onboarding page; a suspended school (`isActive: false`) is locked out immediately, including sign-in and refresh.

**Step 3: Register from the login page, onboarding, waiting for approval**

- A school can also register itself: **Register your school** (login page or the `/` landing page) asks for a school
  name and an email, and emails a one-time link. Nothing is created until the link is opened (that proves the
  email is theirs); then the admin sets a name and password and is signed in. The same `/accept-invite` page also
  serves the super admin's invitations.
- **4-step onboarding**, saved on the server after every step (resume on any device): school details → address and
  contact → you and your classes → review and submit. The PIN code, UDISE+ code, mobile number, class range etc. are
  validated by the server.
- After submitting, the school sees **Waiting for approval** (it checks by itself every 20 seconds), and every active
  super admin gets an email.

**Step 4: Super admin approves or rejects**

- The dashboard shows live counts, the schools waiting longest, and a pending badge in the menu.
- **Schools → Review** shows everything the school submitted. **Approve** opens the school's dashboard and emails the
  admin. **Send back with a reason** keeps everything they entered; they see the reason, fix it, and resubmit
  (it shows as *Resubmitted*). A decision can only be taken once, on a school that is waiting.
- **Suspend / reactivate** an approved school from the same page (or `POST /tenants/:id/suspend` with a reason, and
  `POST /tenants/:id/reactivate`). Suspending locks everyone at the school out at once (sign-in, open sessions and
  refresh), deletes their saved sign-ins so they sign in afresh after reactivation, and emails the administrator the
  reason. Nothing is deleted. The Schools list has a *Suspended* tab, and a suspended school shows as *Suspended*, not
  *Approved*. Only the latest suspension is kept (who, when, why, and when it was lifted).

## Next steps (planned, in order)

5. Principal / teacher / staff are invited by email and verify through the link.
6. The first school modules (students, staff, attendance, fees).

## Tech stack

| Layer | Choice |
| :-- | :-- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | MongoDB (Mongoose), **local** via Docker |
| Auth | JWT access + rotating refresh tokens, bcrypt |
| Email | Nodemailer over Gmail SMTP |

## Design

Blue and navy, Plus Jakarta Sans, from a Google Stitch design system. The rules and the token table are in
[`docs/design/stitch-design-system.md`](docs/design/stitch-design-system.md); every colour, shadow and radius comes
from one block in `frontend/app/globals.css`.

**Signed-in shell:** navy sidebar (grouped, foldable, slide-in drawer on phones), top bar with date, notifications and account menu,
and a school dashboard with a welcome banner, KPI tiles and animated charts. Numbers that come from the school's own
registration are real; every module that is not built yet (attendance, fees, students and the rest of the menu) opens a
"planned" preview page, and the sample charts are labelled "Sample data". Module list: `frontend/lib/modules.ts`.

## Run it locally

Needs Node 20+ and Docker Desktop.

```bash
# 1. Database (from the repo root)
docker compose up -d                      # MongoDB on 127.0.0.1:27017

# 2. Backend
cd backend
npm install
cp .env.example .env                      # then fill it in (see backend/.env.example)
npm run seed:superadmin                   # creates the super admin from .env
npm run dev                               # http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                               # http://localhost:3000
```

Sign in at <http://localhost:3000/login> with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `backend/.env`.

Test an invitation on your own mailbox with a plus address, e.g. `you+school1@gmail.com` (Gmail delivers it to
`you@gmail.com`, the app treats it as a different email).

### Sending real email from Gmail

1. Turn on 2-Step Verification for the Google account.
2. Create an App Password at <https://myaccount.google.com/apppasswords>.
3. Put it in `backend/.env` as `SMTP_PASS` (plus `SMTP_USER`, `SMTP_FROM`).
4. Check it works: `npm run mail:test -- someone@example.com` (in `backend/`).

### Tests and checks

```bash
cd backend && npm test          # needs the Docker MongoDB running; uses its own school_erp_test database
cd backend && npm run typecheck
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

## Project structure

```
backend/src/
  main/<feature>/{controllers,services,models,routes/v1,schemas,__tests__}   one folder per feature
  middleware/  utils/  templates/  config/  seed/  scripts/  routes/index.ts (mounts each feature)
frontend/
  app/            pages (App Router); app/(app)/ = signed-in area
  components/     ui kit, layout, auth
  lib/            api client (token refresh), auth context
docs/             BRD / FRD / scenarios; docs/design/ = the design system
```
