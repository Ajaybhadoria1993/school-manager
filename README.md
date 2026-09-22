# Sunrise School ERP — India-Focused School Management & ERP SaaS

A multi-tenant School ERP platform built from the specs in [`docs/`](docs/) (BRD, FRD, user journeys,
edge-case scenarios). 9 of the FRD's 10 modules are fully working end-to-end (only the native mobile
app is out of scope — the web UI is responsive and covers the same parent/student flows).

## Tech Stack

| Layer | Choice |
| :-- | :-- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB (Mongoose) |
| Auth | JWT (role-based access control) |
| Payments | Razorpay (online, gracefully disabled until keys are configured) |
| Notifications | WhatsApp → SMS fallback adapter (currently logs to console; swap in a real provider) |
| Realtime | Socket.IO (JWT-authenticated, per-conversation rooms) for live parent-teacher chat |

## What's built (Deep MVP Core)

- **Auth & RBAC** — 7 roles (Super Admin, School Admin, Principal, Accountant, Teacher, Parent, Student), JWT sessions.
- **Multi-tenant School Setup** — Tenant (trust) → Branch → Academic Year → Class → Section → Subject, fully isolated per tenant/branch.
- **Student & Family Lifecycle** — admission with auto-generated Admission/Enrollment numbers, guardian linking (search-and-link an existing guardian for a sibling instead of creating a duplicate, BR-07), sibling switching for parents (FR-2.4, FR-9.1).
- **Staff Management** — staff directory + teacher-subject-class allocation matrix.
- **Users & Logins** — a School Admin can provision login accounts for Principal/Accountant/Teacher/Parent from one page (or inline: a parent login can be created in the same step as student admission, and a teacher login inline from the Staff directory), and deactivate/reactivate them. Login provisioning is deliberately separate from HR/family records (Staff and Guardian) — a person can exist in the system before they have (or after they lose) portal access.
- **Staff Leave & Substitution** — self-service leave application, approval workflow, auto-updated leave balances, and per-allocation substitute-teacher assignment when a teacher's leave is approved (FR-3.4, FR-3.5).
- **Attendance** — daily marking per section, absent → automatic guardian notification, monthly attendance % (recalculated live, so corrections always reflect immediately), correction/backfill audit trail (S-4.1, S-4.2).
- **Indian Fee Engine** — fee heads, class-wise installment-based fee structures, concessions/scholarships, offline collection (cash/cheque/DD) with sequential receipt numbers, cheque-bounce reversal (S-5.3), Razorpay-ready online payment (order + signature verification), fee dashboard & outstanding-dues report.
- **Academics, Examinations & Grading** — weekly timetable builder with automatic teacher double-booking prevention (FR-6.1); homework/classwork publishing with guardian notification (FR-6.2); exam creation with per-subject Internal+Written weightage, a bulk marks-entry sheet that locks on submission and can only be reopened by a Principal (FR-6.4); computed report cards (grades, attendance %, teacher remarks) gated behind Principal publish (FR-6.6) and an optional fee-hold-for-dues policy per branch (S-6.4).
- **Dashboards** — school-level operational dashboard (admin/principal/accountant/teacher) and a platform-level dashboard for the Super Admin.
- **Super Admin Control Panel** — tenant onboarding wizard, activate/deactivate, subscription tier, per-module toggles.
- **Integrated Communication Hub** — notice board with audience targeting (whole school / a class / a section), guardian notification on publish, and read-receipt tracking for the sender (FR-7.1); two-way, per-student parent-teacher messaging over Socket.IO — messages appear live on both sides without a refresh, same access rules enforced on the socket as on the REST API — backed by a persistent, non-deletable, timestamped audit log visible to School Admin/Principal for dispute resolution (FR-7.2).
- **Statutory Documents & Certificates** — Transfer, Bonafide and Fee-Paid certificates with a gap-free, never-reused serial number per branch (FR-8.1); an optional "hold for dues" policy blocks TC issuance while fees are outstanding (S-8.1); corrections go through a versioned re-issue that retires the old serial rather than editing it (S-8.2); QR-coded, print-ready ID cards for students and staff (FR-8.4). Certificates render as browser-printable documents (Print → Save as PDF) rather than server-generated PDF files — see the note below.
- **Cross-family data isolation** — every student-scoped endpoint (profile, fees, attendance, homework, report cards, messaging, certificates) verifies a parent/student can only ever reach their own child's / own records, on top of the tenant/branch isolation used everywhere else. Covered by regression tests (see Testing below) so it can't silently regress.
- **Academic Year Rollover & Promotion** (S-1.4) — bulk-promote a class into the next class of a new academic year (or mark a graduating class as Alumni), with a per-class headcount preview before committing. Each promotion snapshots the student's prior (year, class, section) rather than overwriting it, so fee dues left over from before a promotion stay visible in the Outstanding Dues report instead of silently disappearing.
- **Fee Refunds** (S-5.5) — request → Principal/Admin approval → Accountant processing, capped at what the student has actually paid (across every year, minus refunds already claimed) so a refund can never exceed real money collected.

The native mobile app is scoped in the FRD (see `docs/02_Functional_Requirements_Document_FRD.md`)
but not built in this pass — the web UI is fully responsive and covers the same parent/student flows
(sibling switcher, fee payment, attendance, homework, report cards) in a mobile browser.

## Project Structure

```
backend/     Express + TypeScript REST API, MongoDB models, seed script
frontend/    Next.js app (App Router), Tailwind UI, role-aware dashboard shell
docs/        Original BRD/FRD/scenarios/workshop planning documents
```

## Getting Started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # edit MONGODB_URI / JWT_SECRET / RAZORPAY_* as needed
npm run seed               # loads a demo tenant, users, classes, students, fee structure
npm run dev                 # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:5000/api
npm run dev                          # http://localhost:3000
```

### Demo accounts (after `npm run seed`, password `Password@123` unless noted)

| Role | Email |
| :-- | :-- |
| Super Admin | `superadmin@schoolerp.dev` (password `SuperAdmin@123`) |
| School Admin | `admin@sunriseschool.in` |
| Principal | `principal@sunriseschool.in` |
| Accountant | `accountant@sunriseschool.in` |
| Teacher | `teacher@sunriseschool.in` |
| Parent (2 linked children) | `parent@sunriseschool.in` |

## Testing

The backend has an automated test suite (Vitest + Supertest, 43 tests) covering the highest-risk
logic: fee math (concessions, partial payments, cheque-bounce reversal, receipt numbering),
attendance percentage recalculation, leave approval + balance updates, report-card publish gating
(including the fee-hold policy), certificate serial numbering + re-issue, academic year promotion,
refund approval, login provisioning (sibling linking, teacher/parent login creation, deactivation),
and — most importantly — the cross-family data isolation fix, so that class of bug can't silently
come back.

```bash
cd backend
npm test              # runs once against a dedicated school_erp_test database (never touches your dev data)
npm run test:watch    # watch mode
```

No frontend test suite yet — UI changes are verified manually against the running dev server.

## Production Hardening

- **Security headers** via `helmet`; **gzip** via `compression`.
- **Rate limiting**: a generous global API limit, plus a tighter IP+email-keyed limit on `/auth/login`
  to blunt password-guessing.
- **NoSQL injection protection** via `express-mongo-sanitize` — strips any request key containing `$`
  or `.` before it reaches a Mongoose query.
- **Structured error handling**: Zod validation errors and Mongoose CastErrors return clean `400`s
  instead of leaking a stack trace as a `500`; everything else funnels through `utils/logger.ts`,
  which is the one place to wire up Sentry/Datadog later.
- **Graceful shutdown** on `SIGTERM`/`SIGINT`, and process-level `uncaughtException` /
  `unhandledRejection` handlers that log and exit cleanly rather than leaving the process in a
  half-broken state.
- **Refuses to boot in production** with the placeholder `JWT_SECRET` — you must set a real one.

## Notes on production-readiness

- **Razorpay**: the order-creation and signature-verification endpoints are fully implemented; they
  return a clear `503` until `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set in `backend/.env`.
- **WhatsApp/SMS**: `backend/src/services/notification.service.ts` currently logs to the console.
  Swap its body for the WhatsApp Business API / a DLT-registered SMS provider — every call site
  (attendance alerts, cheque bounce, correction notices) already goes through this one function.
- **Document vault / file uploads** (Aadhaar, Birth Certificate, TC) is modelled on `Student.documents`
  but the upload endpoint isn't wired yet — add object storage (S3/Cloudinary) before enabling it.
- **Certificates as PDF**: `/certificates/view/[id]` and the ID card pages render a print-styled page
  and call `window.print()` (users choose "Save as PDF" in the print dialog) rather than generating a
  PDF file server-side. It's the same numbering, ledger-reconciliation and re-issue logic either way —
  swap in a server-side renderer (e.g. Puppeteer) later if a downloadable-without-printing file is needed.
