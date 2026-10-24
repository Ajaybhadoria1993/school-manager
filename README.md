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

**Manage school: Classes & Sections** (school admin and principal)

- **Manage school → Classes & Sections** (`/school/classes`) sets up the layout of the school before any student exists:
  departments (Primary, Middle...), classes (Nursery, Class 5...) and their sections (A, B, or a stream), each with optional
  seats and room. When a school is approved, its classes (from the lowest to the highest class it gave at sign-up) are created
  for it, without sections: the page opens as a ready list, and each class gets its sections (A, B, C...) with one click. A class
  may have no sections at all. A school with no classes can still create them in one click (a preview shows what will be made);
  classes can be added, renamed, moved to a department and deleted. The page has a first-time guide and tooltips.
- API: `/api/v1/academics/*` (structure, quick-setup, departments, classes, sections), scoped to the caller's own school.
- **Academic years**: the school names its session (its own start and end dates) in onboarding step 1; it stays pending until
  the super admin approves, then becomes the one active year shown on the dashboard. Sections belong to a year. A school approved
  before this existed sets its year up once from the dashboard. Details, API, migration (`npm run migrate:academic-years`) and the
  planned year-end / promotion workflow: [docs/academic-years.md](docs/academic-years.md).
  A class or section that has students cannot be deleted, and neither can a class with students in another academic year (its history).
- How the page and the API work, file by file: [`FrontEnd-React/README.md`](FrontEnd-React/README.md#manage-school-classes--sections).

**Manage school: Students** (school admin and principal admit; the accountant can read through the API)

- **Manage school → Students** (`/school/students`): a plain header (the title, **Guide**, **Export**, **Bulk upload**, **Add student**), tiles (students, classes
  with students, seats left, full sections) and this academic year's students as a **table** or as colourful **cards** (the List / Grid
  switch). One row of filters: a small search by name or admission number (sent to the server once you stop typing), the class (a dropdown
  with each class's student count and arrows to step to the class before or after) and the section of that class. Numbered
  pages with rows per page. Everything is done by the server (query parameters) and kept in the address.
- **Admit student** (`/school/students/new`): one page, laid out like a new-patient page: the form as cards on the left, a live preview, a
  form-completion checklist and tips on the right, and one **Admit** button (with **Clear all**) in a bar pinned to the bottom. The student; the class and a section of the
  **current academic year** (each section chip says how many seats are left; a full one asks before it is picked); the parents, starting
  with the **mobile number** (when 10 digits are typed the school's parents are searched once: a parent who already has a child here is
  shown with their children and **linked**, as is or with updated details, never typed twice); the address; the IDs (Aadhaar, checked
  by its check digit and once per school; Samagra, APAAR, PEN, SR number); the previous school and TC; and more details (religion,
  nationality, emergency / WhatsApp number, disability, medical notes, RTE / BPL, fee concession, transport). The **admission number**
  (`ADM-2026-0001`) is made by the server. Every message shows under
  its box before anything is sent, in the server's own words. The same child admitted twice (same name, birthday and parent's number) is
  caught and shown first.
- **A student's page** (`/school/students/:id`): details, this year's class, parents, brothers and sisters (each a link), the class in every
  year, the address, **Edit** (the same form laid out like the admission page, with the student as saved beside it and one **Save changes** in the pinned bar) and **Admit a sibling** (the parents and the address are filled in).
- **Bulk upload** (`/school/students/import`): the students a school already has, from Excel or CSV. Upload the **sample template**
  (made with the school's own classes) or the school's own sheet as it is; it opens at once as an **editable table**: each column's
  detail is recognised by its title and can be changed in its heading, every cell can be corrected, a missing column (State...) is added
  for every row, a class name that is not the school's is changed in every row at once, a row can be left out, and red cells show what
  to fix with the admission form's own rules. **Upload** then admits the ready rows, each into the class and section of their row
  ("V", "5th", "5-A" are understood); rows the server refuses stay in the table with the reason. The school's own admission numbers
  are kept, a parent already in the school is linked, and nothing is admitted twice.
  What the school's form needs besides the basics never stops a row: the row says what it lacks. A file the school exported comes
  back as it is (its own headings are recognised). No Excel file to upload? Paste a copied table, or type the students in an empty table.
- **Export** (`/school/students/export`): the school's fields and its Excel on one page. Every field has an **On** switch (on: asked on
  Add student and a column of the Excel; off: neither, and the row stays where it is), a **Mandatory** switch (Add student is not
  saved without it; the name, gender, birthday, class and the primary parent are always needed) and its place in the Excel (**↑ ↓**
  or drag the row), with its heading typed over. **Add your own field** makes a field the list does not have (a house, a bus pass
  number: text, a number, a date, yes / no or a list of choices), asked on Add student and exported like the others. The fields are a
  closed accordion when the page opens, with the **preview** of the file under them; open it to change them. Saved for the school, so the form and every export follow it. The year's students, or the
  ones the list's filters show.
- Three records, never one: the student (year-free), the guardian (year-free, one per mobile number in a school, linked to every child of
  theirs) and the enrolment (one per student per academic year). One admission is one request, made safe without database transactions.
  A school with no current academic year is sent to the dashboard to set it up first. Parent login (by mobile number and OTP) is planned on
  top of the guardian records; nothing makes logins yet.
- Design, API, rules and tests: [docs/students.md](docs/students.md); the screens: [`FrontEnd-React/README.md`](FrontEnd-React/README.md#manage-school-students).

## Next steps (planned, in order)

5. Staff: principal / teacher / staff invited by email, with a front-desk **reception** role that can admit students (one line in
   `backend/src/main/students/constants.ts`).
6. Teacher allocation (class teacher and subject teachers per section, per academic year); teachers then read their own sections' students.
7. Attendance (per enrolment), then fees.
8. Parent login by mobile number + OTP, on top of the guardian records (one parent, every child).

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
cd FrontEnd-React
npm install
npm run dev                               # http://localhost:5173
```

Sign in at <http://localhost:5173/login> with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `backend/.env`. The links in emails
(sign-up, invitation, password reset) open `CLIENT_URL` from `backend/.env`, `http://localhost:5173` in development.

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

### One school never sees another's data

Every school is a tenant, and every record that belongs to a school carries its `tenantId`. This is enforced in code, not left to memory:

- **`tenantScope` plugin** (`backend/src/main/tenants/plugins/tenantScope.ts`). A school-owned model applies it with
  `schema.plugin(tenantScope)`. That adds a required, immutable `tenantId`, and any find / update / delete / count / aggregate /
  bulkWrite that does not filter by `tenantId` throws `TenantScopeError` (a 500 in the API, a failing test in development).
  `tenantId` always comes from the signed-in user (`req.user.tenantId`), never from the request.
- **Work that really spans schools** (a platform report, a nightly job, a migration) opts out on purpose with `ALL_TENANTS`
  (`.setOptions(ALL_TENANTS)`). Search for `ALL_TENANTS` to review every such place.
- **Delete / update through the model**, with the school named: `Model.deleteOne({ _id, tenantId })`. `doc.deleteOne()` and
  `doc.updateOne()` filter by `_id` alone, so they are refused. `doc.save()` is fine. Populating a school-owned model from another:
  pass `match: { tenantId }`.
- **Not school-owned** (User, Tenant, the auth tokens): no plugin. They are listed in `PLATFORM_MODELS`
  (`tenants/__tests__/modelRegistry.test.ts`); that test fails for any model that is neither scoped nor listed.

**Adding a module that keeps a school's records**
1. The model applies `tenantScope`; every service function takes `tenantId` first and puts it in every filter.
2. Add a `__tests__/<module>.isolation.test.ts` that calls `itKeepsSchoolsApart(...)` from `backend/src/test/tenantIsolation.ts`
   (see `academics/__tests__/academics.isolation.test.ts`): one `probe` for every route that takes a record's id, and one `list`
   for every page that lists records. School B must get 404 and school A's data must not change.
3. A new school-owned id that comes in a request body (a `classId` on a student) is looked up with `tenantId` too, so a record
   can never point at another school's record. (`students/__tests__/students.isolation.test.ts` checks a class, a section and a
   guardian of another school sent in a body.)

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
