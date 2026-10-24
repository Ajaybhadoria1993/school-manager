# CLAUDE.md: backend

Express + TypeScript + Mongoose, multi-tenant (one school = one tenant). Tests: `npm test` (needs the Docker MongoDB, which
runs on its own `school_erp_test` database), `npm run typecheck`.

- **A school's data never leaks to another school.** A model that holds a school's records applies the `tenantScope` plugin
  (`src/main/tenants/plugins/tenantScope.ts`); every query on it filters by `tenantId` (from `req.user.tenantId`, never the
  request) or it throws. `ALL_TENANTS` is the deliberate opt-out for work that spans schools. Full rules and the new-module
  checklist: README.md > "One school never sees another's data".
- **A new school-owned module is not done until it has** `schema.plugin(tenantScope)` on its models and an
  `<module>.isolation.test.ts` that calls `itKeepsSchoolsApart(...)` (`src/test/tenantIsolation.ts`). The model-registry test
  fails for a model that is neither scoped nor listed in `PLATFORM_MODELS`.
- **Everything that belongs to a school year links to an Academic Year** (the project owner's rule): students' enrolment, fees,
  attendance, exams, timetable, class-teacher assignment. Otherwise a new session overwrites last year's data. Classes and
  departments stay year-free on purpose (Class 5 exists every year); sections belong to a year. The `AcademicYear` model is
  built (`src/main/academics/models/AcademicYear.ts`, one active year per school, enforced by an index); every new
  session-bound model (Students, Fees, Attendance, Exams) gets an `academicYearId`. Design, API, migration and the planned
  year-end workflow: `docs/academic-years.md`. `modelRegistry.test.ts` enforces it: a school-owned model must carry `academicYearId`
  or be listed in `YEAR_FREE_MODELS` with the reason.
- Tests build schools with `createSchool` / `addColleague` from `src/test/schools.ts`.
- **Who may use a module is one named list** in its `constants.ts` (`STUDENT_WRITERS`, `STUDENT_READERS`), spread into `requireRole(...)`, so
  a new role (reception) is one line. **404 before 400**: a route with a record id and a body checks that the record is the caller's school's
  (a small middleware such as `studentExists`) before `validate(body)`. A lookup by a personal identifier (a mobile number) is a POST with
  a body, never a query string. Forms' messages are written once in the module's schemas; the frontend repeats the same words.
- **No transactions** (standalone MongoDB): a request that writes several records checks everything first, then only adds, undoes what it
  made if a later step fails, and lets unique indexes settle races. Example: `students/services/admission.service.ts`, `docs/students.md`.
