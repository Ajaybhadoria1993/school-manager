# Permissions: what each kind of person may do (2026-11-10)

The school admin decides, with checkboxes, what each **kind of person** of the school may do: a Receptionist, an Accountant, a Teacher,
a Parent, a Librarian... When that person signs in, the menu shows what the school allowed, and the server refuses the rest.
(The user: "reception ko kaun si cheez dena hai, parent ko, teacher ko: checkbox se, aur jab login kare use wahi dikhe jo admin ne decide kiya".)

## What is decided, and for whom

- **The school admin and the principal** can do everything. No box for them (`FULL_ACCESS_ROLES`). The principal can *read* the page; only the
  school admin changes it.
- **Everyone else has a list**, one per kind (`PROFILES`): Teacher, Parent, and every kind of staff (the 19 roles of `STAFF_MEMBER_ROLES`
  except the principal; "Other roles" is one list for every role the school wrote itself). A staff login (`role: "staff"`) is looked up by the
  person's role (`StaffMember.role`); a staff member who also teaches signs in as a teacher and has the Teacher list.
- Until the school chooses, a kind has **the list it had before permissions existed** (`DEFAULT_PERMISSIONS`), so nothing changes by itself:
  Receptionist and the other staff: the calendar; Accountant: dashboard, students, export, calendar; Teacher: their classes' attendance,
  leave, diary/tests, exams, timetable, calendar; Parent: their child's parts and the calendar.

## The permissions (`PERMISSION_GROUPS`), and who can be given each

| Group | Key | Given to |
|---|---|---|
| Dashboard | `dashboard.view` | staff |
| Transport | `transport.view`, `transport.manage` (vehicles, drivers and attendants, routes; docs/transport.md) | staff |
| Students | `students.view`, `.add` (Add student + Bulk upload + a parent's first login), `.edit` (also a parent's new password/username), `.status` (inactive/active, transfer out), `.export`, `.settings` (what Add student asks, the Excel layout: Manage fields + the Export page) | staff |
| Teachers | `teachers.view`, `.add` (Add teacher + Bulk upload; makes subjects), `.edit` (details, classes, class teacher, login, make inactive), `.export`, `.settings` (the extra fields) | staff |
| Staff | `staff.view`, `.add`, `.edit` (details, login, make inactive, remove) | staff |
| The school's set-up | `classes.view` (Classes pages), `classes.manage` (Classes & Sections: classes, sections, departments), `years.manage` (the next academic year), `promotion.manage` (prepare and send the promotion list) | staff |
| Attendance | `attendance.view`, `attendance.mark` | staff, teacher (a teacher: their own classes) |
| | `attendance.teachers` (see/correct teachers' attendance) | staff |
| Leave requests | `leaves.view`, `leaves.decide` | staff, teacher |
| Diary, homework, tests | `classwork.view`, `classwork.manage` | teacher |
| Test & Exam | `exams.view`, `exams.marks` | teacher |
| | `exams.manage` (the school's exams, papers and marks) | staff |
| Timetable | `timetable.view` | teacher |
| | `timetable.edit` (School timings, Class timetables, subjects and who teaches them) | staff |
| Calendar | `calendar.view` | staff, teacher, parent |
| | `calendar.manage` | staff |
| Their child | `child.attendance`, `.timetable`, `.exams`, `.diary`, `.leave` | parent |

Only what has a page for that person is offered; more are added with their pages. **A permission that needs another brings it** (`IMPLIES`):
adding students needs seeing them, taking attendance needs seeing it, deciding leave needs seeing it, `calendar.manage` needs `calendar.view`...
The page ticks/clears them together and the server adds them on save (`withImplied`), so a saved list is always whole.

**Everything the school admin does can be given to a kind of staff** (the user, 2026-11-10: "jo admin kar pa raha hai wo sab ki permission do") except four things that stay with the
school admin whatever is ticked: **the Permissions page itself** (so nobody can give themselves more), **switching an academic year on**, **approving or rejecting a
promotion list**, and **a teacher's other mediums**. (Staff attendance is not built yet.) Teachers and parents are never offered the school's pages: their keys are about
their own classes and children.

## The server (`backend/src/main/permissions`)

- `models/RolePermission` (tenantScope; one record per school and kind, `{ profile, permissions[] }`; year-free). A school with sides (mediums)
  keeps them on the school itself: every side follows it (`rootOf`).
- `services/permission.service.ts`: `profileOf(user)`, `keysFor(tenant, profile)` (saved or default), `grantedTo(user)` (only what is offered to the
  kind), `overview`, `save` (400 `PERMISSION_NOT_OFFERED` for a key the kind cannot be given; 404 `PROFILE_NOT_FOUND`), `reset`.
- `middleware/permission.ts`: `requirePermission(...keys)` (ANY of them; admin/principal always; read once per request) and
  `requireSchoolPermission(...keys)`, which also keeps a teacher, a parent and a student out of pages about the whole school (the school's
  dashboard, every class's attendance sheet): theirs is their own classes or children, on their own routes.
- Routes: `GET /permissions` (admin, principal), `PUT /permissions/:profile` `{ permissions }` and `DELETE /permissions/:profile` (back to the
  usual list) (school admin only).
- The session carries the list: `user.permissions` on sign-in and `/auth/me` (everything for admin/principal; `[]` for the platform team).
- Where the guards are: students (`students.routes.ts`: view / add / edit / status / export; settings, promotion, a parent's new password stay
  admin-only), `/academics` reads (anyone whose work is about students, attendance, leave, classwork, exams, timetable or the dashboard),
  `/classroom` (calendar, leave, attendance, diary, tests), `/attendance` (school-wide sheets), `/dashboard`, `/exams` (the school's: `exams.manage`; a class's and its marks: `exams.view` / `exams.marks`),
  `/timetable` (reads by `timetable.view` or `.edit`; changes by `.edit`), `/subjects` (reads by any timetable/classwork/exams/teachers key; changes by `timetable.edit`, `teachers.add/edit` or `classes.manage`),
  `/staff` (teachers by `teachers.*`, members by `staff.*`, the username check by any of the keys that make a login), `/academics` (reads for anyone whose work is about a class; changes by `classes.manage` / `years.manage`),
  `/parent/children/:id/*`. `requireRoleOrPermission(roles, ...keys)` keeps a role in by its old way (a teacher reads the teachers list) or by a key. Services treat any caller who is not a teacher as working on every class
  (`worksOnAllClasses` in `classroom/services/access.ts`); only a teacher is held to their own classes.

## The screens

- **Permissions** (`/permissions`, a menu entry of the school admin, after Staff): kinds on the left (teacher and parent, then "Staff" with each
  role, a count of what each may do, a dot while a change is not saved), the checkboxes of the picked kind on the right grouped like the table
  above, **Save** (explicit, per kind: switching kind keeps the unsaved boxes) and **Back to the usual list** (`DELETE`). The principal sees the
  boxes fixed.
- The menu: `NavItem.permission` shows a page to a person who is not in `roles` when their kind has ANY of the keys (`navVisible`);
  `schoolWide` pages are never given to a teacher, parent or student. A person the school allowed to see students has one **Students** entry
  (`/school/students`); Attendance opens Student / Teacher by `attendance.view` / `attendance.teachers`; Calendar and Leave requests by their keys.
- Pages: `PermissionRoute` (keys) guards the student list and a student's page (`students.view`), Add student and Bulk upload
  (`students.add`, inside `RunningYearRoute`), the inactive list (`students.status`), attendance pages. On the pages, each button follows its
  key: Students (Export: the school admin and the principal open the layout page, anyone else with `students.export` downloads the file at once; Bulk upload, Add student, the inactive tab, the ticks), a student's page (Add a sibling, Transfer, Make inactive, Edit,
  the parent's login), Attendance > Student gets **Take attendance** (to `/class-work/:classId?section=...&tab=attendance`) for
  `attendance.mark`, a class's work page (tabs by key; the marks are fixed without `attendance.mark`), Leave requests (Approve/Decline by
  `leaves.decide`), Calendar (`calendar.manage`), the dashboard (`dashboard.view`, else the person's own home), the parent's child page (each
  part by its `child.*` key, and a part not allowed is not asked for).
- `utils/permissions.ts`: `can(user, ...keys)`, `toggled` (the page's ticking rule), `IMPLIES` (mirrors the server). A session without its own
  list (a server older than this screen) has the usual list of the kind (`USUAL`), so nobody loses a page.
- `hooks/usePermissionRefresh.ts` (in `MainLayout`): the session is read again when the window gets focus (at most every 15 s), so a box the
  school ticked reaches the menu without signing in again; nothing is stored when nothing changed. The server checks every request anyway.

## Tests

Backend: `permissions/__tests__/permissions.test.ts` (catalogue, API, kinds) and `permissions.access.test.ts` (real routes: what each key
opens, what stays closed, teachers' own classes, parents' parts, kinds of staff). Frontend: `utils/permissions`, `navConfig`, the Permissions page,
`PermissionRoute`, Students / ClassWork / Leaves / ChildPage / Dashboard / StudentAttendance permission tests, `usePermissionRefresh`.
Real Chrome on the throwaway stack (`e2e-perm.cjs`, 10 steps): the admin ticks boxes for a Receptionist; the receptionist's menu follows (Students,
Attendance > Student, Calendar, Leave requests only), the Students page has Add student and Bulk upload but no Export, a student's page has no
Edit / Make inactive / Transfer, `/school/exams` sends them home and the API answers 403, they take a class's attendance; the admin takes the
permission away and the menu follows; a Librarian is untouched.

## Not built (later)

- A permission for pages that do not exist yet (fees, Staff attendance, library...): add a key to `PERMISSION_GROUPS` with the page.
- Read-only versions of the editors: the timetable, exams, classes and promotion pages are the full editors, so one key (`.edit` / `.manage`) opens them; there is no "see only" key for them.
- A list **per person** (only per kind); a person who is two kinds (a principal who teaches keeps the principal's everything).
- A notice to the person when their permissions change (they find out when the window is opened again).
- Add staff does not show the role's permissions yet (it will link here).
