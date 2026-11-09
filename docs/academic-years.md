# Academic years

How a school's academic year (session) works today, how it is stored, and how the later phases (a new session, year-end,
student promotion) are meant to build on it. Written for developers working on this codebase.

## What a school sees

1. **Onboarding, step 1 ("School details").** Under *Academic year* the school gives its session: a start date, an end date
   and a name. One-click shortcuts fill the usual sessions (April to March, June to May, January to December) for the session
   running now, but every date can be changed: nothing assumes 1 April or 31 March. The name follows the dates ("2026-2027")
   until the school types its own. The classes it offers are the existing *Classes from / Classes up to* boxes.
   The old *Academic session starts in* month box is gone: the month is read from the start date.
2. **Review and waiting.** The review step, the waiting screen and the super admin's review page show the year
   ("2026-2027: 1 Apr 2026 to 31 Mar 2027 (becomes active when you approve)").
3. **Approval.** The super admin approves as before; that switches the year on. A pending or rejected school never has an active
   year. A school that is sent back and resubmits edits the same year record.
4. **Dashboard.** The status line under the greeting shows *Current Academic Year: 2026-2027 · 1 Apr 2026 to 31 Mar 2027*, read from the server, with a
   placeholder while it loads and a *Retry* when it cannot be loaded.
5. **Classes & Sections.** Departments and classes are the school's lasting layout. Sections belong to the current session, so
   the *Sections* tile and a class's *Sections* heading name the year.

A school that was **approved before academic years existed** has no year. Nothing is guessed for it: its dashboard shows a card
*Set up your current academic year* (for the school admin and the principal; anyone else is told to ask them). Whatever it names
becomes its active year, once, and the sections it already made are given that year (they are the running session's sections).

## Data model (MongoDB, Mongoose)

`AcademicYear` (`backend/src/main/academics/models/AcademicYear.ts`), school-owned (`tenantScope`):

| Field | Meaning |
| :-- | :-- |
| `tenantId` | the school (immutable, required by `tenantScope`) |
| `name`, `nameKey` | "2026-2027"; `nameKey` is lower-cased and unique per school |
| `startDate`, `endDate` | the school's own first and last day, stored as midnight UTC of that calendar day |
| `status` | `pending` (named during sign-up, waiting for approval) -> `active` -> `closed` (not used yet) |
| `source` | `onboarding` (the sign-up year, one per school) or `school` (set up by the school itself) |
| `activatedAt`, `closedAt`, timestamps | |

Indexes (the database enforces the rules, so two requests at once cannot break them):

- `{ tenantId, nameKey }` unique: two years of one school cannot share a name.
- `one_active_year_per_school`: `{ tenantId, status }` unique where `status: "active"`.
- `one_onboarding_year_per_school`: `{ tenantId, source }` unique where `source: "onboarding"`. Saving step 1 again, or twice at
  the same moment, updates the one record (an upsert that retries once on a duplicate key).
- `{ tenantId, startDate: -1 }` for "the school's years, newest first".

`Section` gained `academicYearId` (default `null`) and its unique index became
`one_section_name_per_class_and_year` `{ classId, academicYearId, nameKey }` (next year's Class 5 may have its own "A"). Every
section query and every new section uses the school's active year. `null` is only for sections of a school that has no year yet.

`Tenant.profile.sessionStartMonth` stays (older screens read it) and is now written from the academic year's start month.
`Department` and `SchoolClass` stay year-free on purpose.

### Why no transactions

The local MongoDB (`docker-compose.yml`) is a standalone server, which cannot run multi-document transactions (they need a
replica set). Instead every step is a single-document atomic write with a condition, made safe by the unique indexes above:

- step 1 writes the school, then the year; if the year fails, step 1 is taken off the completed list again (so the progress never
  claims a step whose year is missing), and `submit` re-checks every step from what is stored.
- approval is the existing `pending -> approved` conditional update (exactly once); the year is then switched on with
  `pending -> active`. If that second write fails, the approval stands and the first read of the current year finishes the job
  (`AcademicYearService.current`, which first checks that the school is approved).

If production runs on a replica set (MongoDB Atlas does), these could later be wrapped in a transaction; the conditions and indexes
stay useful either way.

## API (all under `/api/v1`, the school is always the signed-in user's)

| Method and path | What it does | Who |
| :-- | :-- | :-- |
| `PUT /onboarding/steps/1` | now also requires `academicYear: { name, startDate, endDate }` (dates `YYYY-MM-DD`, end after start, at most two years); `sessionStartMonth` is optional and ignored | the school admin, while the form is editable |
| `GET /onboarding`, `GET /tenants/:id/review` | `steps[1].academicYear` = `{ name, startDate, endDate, status }` (empty strings and `status: null` until saved) | as before |
| `POST /tenants/:id/approve` | unchanged contract; also switches the sign-up year on | super admin |
| `GET /academics/academic-years/current` | `{ year: { id, name, startDate, endDate, status, activatedAt } \| null, needsSetUp }` | anyone at an approved school |
| `POST /academics/academic-years/initial` | `{ name, startDate, endDate }`: only for a school with no year at all; 409 otherwise | school admin, principal |
| `GET /academics/structure` | gained `academicYear: { id, name } \| null`; sections and totals are the current year's | as before |

Validation messages are per field (`academicYear.endDate: "The end date must be after the start date"`), the same on the
form (checked before sending) and on the server.

## Migration for an existing database

```bash
cd backend
npm run migrate:academic-years    # uses MONGODB_URI from backend/.env; take a backup first in production
```

It drops the old sections index `classId_1_nameKey_1`, builds the new indexes for sections and academic years, and reports (without
changing anything) the approved schools that have no academic year and how many sections have none. It never deletes or rewrites
records and is safe to run again. Until it runs, the app still works: the old index only blocks a second session's sections with
the same name, which cannot be created yet.

## Tests

- `backend/src/main/onboarding/__tests__/journey.test.ts`, *the academic year*: required fields and messages, invalid ranges,
  persistence after signing in again, one record however often (and however concurrently) it is saved, a form saved without a year
  cannot be submitted, pending while waiting and after a rejection, two approvals at once (one wins, one active year), the repair on
  first read, never for a pending school, sections made after approval belong to the year.
- `backend/src/main/academics/__tests__/academicYear.test.ts`: the one-time set-up for an older school (roles, validation, once
  only, three at once), its sections adopted, the same section name refused within a year but allowed in another, screens and totals
  showing only the current year, the database refusing a second active year.
- `backend/src/main/academics/__tests__/academicYear.isolation.test.ts`: another school sees none of a school's year and cannot
  change it.

## History is protected (so students, attendance and fees can be built on it)

Sections are year-specific records, so the API refuses to damage another year's:

- Only the **current year's** sections can be changed or deleted: a section of a past (or future) year answers `409 SECTION_OTHER_YEAR`.
- A class that holds sections of **another year** cannot be deleted (`409 CLASS_HAS_HISTORY`); deleting a class deletes its sections, and
  those belong to a year that has its own students and attendance. The guard also counts enrolments by class across every year (a class
  with students in another year, even without sections, answers `CLASS_HAS_HISTORY`), see `services/usage.ts`.
- `modelRegistry.test.ts` fails for any school-owned model that is neither listed in `YEAR_FREE_MODELS` (with a reason) nor carries an
  `academicYearId`. A new Students, Attendance, Fees, Exams or Staff-assignment model therefore cannot be added without deciding, in
  review, whether it belongs to a session.

### Building Students and Staff on it

**Students is built on this** (Student and Guardian year-free, Enrolment per year, admission numbers per year): see
[students.md](students.md). Staff is next.

| Module | Year-free (identity, stays when a session ends) | Per year (carries `academicYearId`, required) |
| :-- | :-- | :-- |
| Students | the student profile: name, guardians, admission number | **Enrolment**: `{ studentId, academicYearId, classId, sectionId \| null, rollNumber, status }`; its section must belong to the same year |
| Staff | the teacher / staff profile, login, qualifications | **Assignment**: `{ staffId, academicYearId, classId, sectionId \| null, subject, isClassTeacher }` |
| Attendance, marks, fees | nothing | each row points to an **enrolment** (so it has the year, class and section of that time) and carries `academicYearId` |

Rules to follow, all already supported by what is built:

1. The current year is `AcademicYearService.activeYearId(tenantId)` (or `GET /academics/academic-years/current` from a screen). New
   session records use it; a read of "this year" filters by it.
2. A unique index of a per-year record includes `academicYearId` (one enrolment per student per year, like the section index here).
3. `tenantScope` still applies: the year is not a substitute for the school; every query names both.
4. A record never moves between years. Promotion creates a new enrolment in the next year and leaves the old one as it was.
5. Counts that guard a delete (`studentCountsBySection`, a class count) cover all years, as above.
6. A screen that can show a past year reads its year with `AcademicYearService.shownYearId` / `shownYear` (the year being looked at, else
   the running year); a change, and the year-end work (promotion, switching a year on), keep using `activeYearId`. See the next section.

## Looking at a past year (2026-11-09)

A school admin or principal opens a year that is over (`closed`) and the screens show what the school was then, **read only**. Nothing
about the data changes: it is the same endpoints with the year named in a header.

- **How the year travels.** `X-Academic-Year: <id of a closed year of the school>`, checked by `middleware/yearView.ts` (placed right after
  `requireAuth` on the academics, students, attendance and exams routes) and kept for that one request in an `AsyncLocalStorage`
  (`academics/services/viewedYear.ts`). No header, or the id of the running year: nothing changes.
- **What is refused.** A year id that is not an id: `400 INVALID_YEAR`. Not this school's, or none: `404 YEAR_NOT_FOUND` (the same answer, so
  another school's year is never confirmed). A year that has not started: `409 YEAR_NOT_STARTED`. **Anything that would change something
  while a past year is open: `409 YEAR_READ_ONLY`**, whichever route, so no write can land in a closed year.
- **What answers for the year.** Students (list, one student's "this year", seat counts, class overview, the export), classes (layout, class
  list, one class: the old year's sections), attendance (a section of a closed year, the whole class), exams (the list). Everyone who sat in
  the year is counted: a student who left later has every enrolment made inactive, so a past year does not filter on `status: "active"`
  (`seatedIn(yearId)` in viewedYear.ts is that rule). Also the timetable (overview, a class's week, a teacher's week), what a class studies
  and who teaches it (`/subjects/allotments`), and a teacher's classes and class-teacher posts (`openYearIds` answers with the year being
  looked at). The routers that take the header are academics, students, attendance, exams, timetable, subjects, staff and classroom;
  notifications, parents and auth never do. The people (teachers, staff), the subjects' list, the school's timings and the calendar are the same
  for every year, so they answer as usual (but are read only too: a change to them is refused while a past year is open).
- **What never follows the header.** The list of years, the current-year banner, the promotion list and switching a year on are always about
  the real years (the frontend does not send the header to them).
- **Frontend.** `yearView` slice (kept in `sessionStorage`, forgotten at sign-out), the header added in `redux/api/baseQueryWithReauth.ts`
  to the year-aware reads only, `yearViewMiddleware` asks the screens that show a year again when it changes, a year the server refuses sends
  the screen back to the running year. The picker is in the top bar (`YearSwitcher`, only when the school has a year that is over, only for
  the school admin and the principal) and `YearViewBanner` says "Viewing 2025-2026 · Read only" with the way back. Attendance pages open on
  the last month of the year being looked at.
- **Nothing to press.** `useReadOnlyYear()` / `<WriteOnly>` hide the buttons that would change something: Add student, Bulk upload, ticking
  students, Edit / Transfer / Make inactive / Add a sibling and a parent's login on a student, Add / change teacher, Give classes, Has left,
  teacher logins and Assign class, Add staff and the staff row buttons, Schedule exam and an exam's change / delete / papers, a section's
  teachers box (a read-only list instead: `UnitTeachersView`) and Edit timetable, the Subjects page's add / change / archive, Make active on
  the inactive list, deciding a leave, changing a teacher's day, calendar add / change, and the School timings tab. The pages that are only forms
  or year work (the admission form, bulk uploads, the school's fields, Classes & Sections, a department, the school's years, the promotion, add /
  change of a teacher or a staff member) are wrapped in `routes/RunningYearRoute.tsx`: while a past year is open they say "2025-2026 is over"
  with the way back. A button this list misses is still refused by the server with the `YEAR_READ_ONLY` message.
- **Tests.** `backend/src/main/academics/__tests__/yearView.test.ts`, `FrontEnd-React/src/redux/__tests__/yearView.test.ts`,
  `components/layout/__tests__/YearSwitcher.test.tsx`, `WriteOnly.test.tsx`, `routes/__tests__/RunningYearRoute.test.tsx`, `components/schoolClass/__tests__/UnitTeachersView.test.tsx`, the year cases of `AttendancePage`, `Students`, `StudentDetail`, `Exams`, `ExamDetail` and `Teachers` tests.

## Later phases

Steps 1, 4, 5, 6 and 9 below are **built** (the next session with its sections copied, the promotion list, the school admin's approval, the new
enrolments and the switch that closes the running year): see "Promotion to the next academic year" in [students.md](students.md), the
screens Academic years and Promotion, and the endpoints `GET/POST /academics/academic-years`, `POST /academics/academic-years/:id/activate`.
Step 2 (a year-end review shown from the school's own end date), 3 (results and eligibility) and 8 (teacher assignments) are not built;
nothing runs automatically.

1. **Next session.** The school creates its next year (`source: "school"`, `pending`) with its own dates. Activating it closes the
   current one in the same guarded step (the partial unique index keeps it to one active year). Sections for the new year are created
   fresh (optionally copied from the previous year as a starting point the school reviews), never moved.
2. **Year-end review**, from each school's own end date, not a fixed 31 March: when a year reaches its end date the school is shown a
   review. Nothing is deleted or overwritten.
3. **Results and eligibility** are reviewed (from the exams module).
4. **A promotion list** is generated: each student with a suggested outcome (promote to the next class, retain, or handle separately:
   pending result, transfer, other).
5. **The school admin approves** the list, student by student or in bulk.
6. **Approved students get a new enrolment** for the next year, class and section (for example 2026-2027 Class 5 A -> 2027-2028
   Class 6 B). The old enrolment stays exactly as it was.
7. **History stays**: enrolment, attendance, results and fee records of the old year keep their `academicYearId` and remain readable.
8. **Teacher assignments** for the new session are confirmed separately, never copied blindly.
9. **The next year becomes active** by its own dates and the same safe activation.

The model this prepares for:

```
School (Tenant) -> AcademicYear (many, one active)
School -> Department -> SchoolClass                 (lasting layout, year-free)
AcademicYear + SchoolClass -> Section               (year-specific, built)
Student -> Enrolment (academicYearId, classId, sectionId)        (built, see students.md)
Teacher -> Assignment (academicYearId, classId/sectionId, subject) (to build with Staff)
Enrolment / AcademicYear -> Attendance, Exams, Fees  (each carries academicYearId)
```

Every new session-bound model must carry `academicYearId` (the project's rule, see `backend/CLAUDE.md`).
