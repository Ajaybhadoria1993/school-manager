# Permissions: what each kind of person may do (2026-11-10)

The school admin decides, with checkboxes, what each **kind of person** of the school may do: a Receptionist, an Accountant, a Teacher,
a Parent, a Librarian... When that person signs in, the menu shows what the school allowed, and the server refuses the rest.
(The user: "reception ko kaun si cheez dena hai, parent ko, teacher ko: checkbox se, aur jab login kare use wahi dikhe jo admin ne decide kiya".)

## What is decided, and for whom

- **The school admin and the principal** can do everything. No box for them (`FULL_ACCESS_ROLES`). The principal can *read* the page; only the
  school admin changes it.
- **Everyone else has a list**, one per kind (`PROFILES`): Teacher, **Class teacher** (2026-11-26), Parent, and every kind of staff (the 19 roles of `STAFF_MEMBER_ROLES`
  except the principal; "Other roles" is one list for every role the school wrote itself). A staff login (`role: "staff"`) is looked up by the
  person's role (`StaffMember.role`).
- **A staff member who also teaches** (Add staff > Also a teacher: a Coordinator who takes a class; 2026-11-26) signs in as a teacher and has
  **both**: the Teacher and Class teacher lists, in their own classes only, and their own role's list, on the whole school (`accessOf`: the
  session's `permissions` has all of it, `schoolPermissions` only the role's list). Only the principal keeps their own login when teaching (they
  have everything); an Accountant who teaches signs in as a teacher now too, with the accountant's list on top (`ROLES_KEEPING_THEIR_LOGIN`).
- **A role the school named itself** (Add staff > Other: "Sports coach", "Gardener"; 2026-11-26) is a kind of its own, key `other:<name>` (lower case,
  spaces made one: `namedRoleKey`). The page lists every such role someone of the school has (not inactive, on any medium) under **Roles you named**.
  Until the school saves a list for it, it follows **Other roles**; "Same as Other roles" (`DELETE`) makes it follow again. A staff login whose
  role is Other gets its named role's list (`profileOf`). A name nobody of the school has is 404.
- **The school makes a role on the Permissions page** (2026-11-26, "+ New role", school admin only): `POST /permissions/roles { name }` makes a
  `CustomRole` (tenantScope, on the school itself like RolePermission, year-free; one per name: 409 `ROLE_EXISTS`; a usual kind's name such as
  Librarian or Teacher is 409 `ROLE_NAME_TAKEN`). It opens at once with every staff permission to tick (following Other roles until saved). It is
  in Add staff's Role list before Other (`GET /permissions/roles`, for whoever has `staff.view/add/edit`): choosing it sends `role: "other"` with its
  name. `DELETE /permissions/roles/:key` deletes a role the school made, with its list, while nobody (not inactive) has it (409 `ROLE_IN_USE`); a
  name only typed in Add staff is not a role to delete (404). Each school's roles are its own: `permissions.isolation.test.ts`.
- **Class teacher** is not a login of its own: a teacher's login has the Teacher list **and** the Class teacher list together (`grantedTo`). The
  class teacher's list is what only a class teacher does (students' attendance, the leave parents send); the services keep it to the class the
  teacher is the class teacher of (or a class given to them for a day its class teacher is away), so a subject teacher gets nothing from it.
  (Until 2026-11-26 these keys were on the Teacher list, where ticking "Take attendance" looked like it was for every teacher.)
- Until the school chooses, a kind has **the list it had before permissions existed** (`DEFAULT_PERMISSIONS`), so nothing changes by itself:
  Receptionist and the other staff: the calendar; Accountant: dashboard, students, export, calendar; Teacher: their classes' attendance,
  leave, diary/tests, exams, timetable, calendar; Parent: their child's parts and the calendar.

## The permissions (`PERMISSION_GROUPS`), and who can be given each

| Group | Key | Given to |
|---|---|---|
| Dashboard | `dashboard.view` | staff |
| Transport | `transport.view`, `transport.manage` (vehicles, drivers and attendants, routes; docs/transport.md) | staff |
| Documents | `documents.view` (ID cards, report cards, admit cards and the certificate register, to print), `documents.manage` (a report card's remark, issuing and cancelling certificates, the grading; docs/documents.md) | staff |
| Fees | `fees.view`, `fees.manage` (the set-up; also giving a student a concession and cancelling a receipt), `fees.collect` (a student's fee account, taking a payment, receipts, dues; docs/fees.md) | staff |
| Students | `students.view`, `.add` (Add student + Bulk upload + a parent's first login), `.edit` (also a parent's new password/username), `.status` (inactive/active, transfer out), `.export`, `.settings` (what Add student asks, the Excel layout: Manage fields + the Export page) | staff |
| Teachers | `teachers.view`, `.add` (Add teacher + Bulk upload; makes subjects), `.edit` (details, classes, class teacher, login, make inactive), `.export`, `.settings` (the extra fields) | staff |
| Staff | `staff.view`, `.add`, `.edit` (details, login, make inactive, remove) | staff |
| The school's set-up | `classes.view` (Classes pages), `classes.manage` (Classes & Sections: classes, sections, departments), `years.manage` (the next academic year), `promotion.manage` (prepare and send the promotion list) | staff |
| Attendance | `attendance.view` (staff: every class; class teacher: their class), `attendance.mark` (class teacher only: 2026-11-17, only a class teacher takes attendance; the school and its staff only look) | see the column |
| | `attendance.teachers` (see/correct teachers' attendance), `attendance.staff` (Attendance > Staff, the sheet only; 2026-11-26) | staff |
| Students' leave (sent by parents) | `leaves.view`, `leaves.decide` | staff, class teacher |
| Teachers' and staff leave (2026-11-26) | `staffleaves.view` (Leave & arrangements > Leave requests), `staffleaves.decide` (Approve / Decline; never one's own leave: `OWN_LEAVE`) | staff |
| Diary, homework, tests | `classwork.view`, `classwork.manage` | teacher |
| Test & Exam | `exams.view`, `exams.marks` | teacher |
| | `exams.manage` (the school's exams, papers and marks) | staff |
| Timetable | `timetable.view` | teacher |
| | `timetable.edit` (School timings, Class timetables, subjects and who teaches them, Leave & arrangements > Arrangements: a substitute for a teacher who is away) | staff |
| Calendar | `calendar.view` | staff, teacher, parent |
| | `calendar.manage` | staff |
| Their child | `child.attendance`, `.timetable`, `.exams`, `.diary`, `.leave`, `.transport` (the child's bus and where it is while live), `.fees` (the child's fee chart) | parent |

Only what has a page for that person is offered; more are added with their pages. **A permission that needs another brings it** (`IMPLIES`):
adding students needs seeing them, taking attendance needs seeing it, deciding leave needs seeing it, `calendar.manage` needs `calendar.view`...
The page ticks/clears them together and the server adds them on save (`withImplied`), so a saved list is always whole.

**Everything the school admin does can be given to a kind of staff** (the user, 2026-11-10: "jo admin kar pa raha hai wo sab ki permission do") except four things that stay with the
school admin whatever is ticked: **the Permissions page itself** (so nobody can give themselves more), **switching an academic year on**, **approving or rejecting a
promotion list**, and **a teacher's other mediums**. Also kept by the school admin and the principal: approving a student's concession that needs approval, the school's
own profile and logo. Teachers and parents are never offered the school's pages: their keys are about their own classes and children.

**Always on, not a box** (every teacher and staff login): marking themselves present (their home), asking for their own leave (My leave), the notification bell,
their own Settings. A teacher also always sees their own classes on their home and the list of their colleagues.

## The server (`backend/src/main/permissions`)

- `models/RolePermission` (tenantScope; one record per school and kind, `{ profile, permissions[] }`; year-free). A school with sides (mediums)
  keeps them on the school itself: every side follows it (`rootOf`).
- `services/permission.service.ts`: `profileOf(user)`, `keysFor(tenant, profile)` (saved or default), `grantedTo(user)` (only what is offered to the
  kind), `overview`, `save` (400 `PERMISSION_NOT_OFFERED` for a key the kind cannot be given; 404 `PROFILE_NOT_FOUND`), `reset`.
- `services/permission.service.ts` `accessOf(user)` gives `{ permissions, schoolPermissions }`: a staff login's list is all on the whole school;
  a parent's never; a teacher's only what their staff role gives (their StaffMember, found by the login on the side the login belongs to:
  `homeTenantId` when the request moved to another medium).
- `middleware/permission.ts`: `requirePermission(...keys)` (ANY of them in `permissions`; admin/principal always; read once per request with
  `loadAccess`) and `requireSchoolPermission(...keys)`, for pages about the whole school (the school's dashboard, every class's attendance
  sheet): ANY of them in `schoolPermissions`, so a teacher, a parent and a student stay out by their own list (theirs is their own classes or
  children, on their own routes) and a teacher who is also on the staff comes in by their role's list.
- Routes: `GET /permissions` (admin, principal), `PUT /permissions/:profile` `{ permissions }` and `DELETE /permissions/:profile` (back to the
  usual list) (school admin only).
- The session carries the list: `user.permissions` on sign-in and `/auth/me` (everything for admin/principal; `[]` for the platform team).
- Where the guards are: students (`students.routes.ts`: view / add / edit / status / export; settings, promotion, a parent's new password stay
  admin-only), `/academics` reads (anyone whose work is about students, attendance, leave, classwork, exams, timetable or the dashboard),
  `/classroom` (calendar, leave, attendance, diary, tests), `/attendance` (school-wide sheets), `/dashboard`, `/exams` (the school's: `exams.manage`; a class's and its marks: `exams.view` / `exams.marks`),
  `/timetable` (reads by `timetable.view` or `.edit`; changes by `.edit`), `/subjects` (reads by any timetable/classwork/exams/teachers key; changes by `timetable.edit`, `teachers.add/edit` or `classes.manage`),
  `/staff` (teachers by `teachers.*`, members by `staff.*`, the username check by any of the keys that make a login), `/academics` (reads for anyone whose work is about a class; changes by `classes.manage` / `years.manage`),
  `/parent/children/:id/*`. `requireRoleOrPermission(roles, ...keys)` keeps a role in by its old way (a teacher reads the teachers list) or by a key. Services treat any caller who is not a teacher as working on every class
  (`worksOnAllClasses(caller, ...keys)` in `classroom/services/access.ts`); a teacher is held to their own classes unless their staff role's list
  has the key (students' attendance `attendance.view`, parents' leave `leaves.view` / `leaves.decide`, exams `exams.manage`, timetable drafts
  `timetable.edit`). Taking attendance stays the class teacher's alone.

## The screens

- **Permissions** (`/permissions`, a menu entry of the school admin, after Staff): kinds on the left (teacher, class teacher and parent, then "Staff" with each
  role, "ticked / can be given" for each, a dot while a change is not saved), on the right one line saying who the kind is, then one box per part of the app
  (2026-11-26: its icon, "n/m" and an **All** tick that ticks or clears the whole box, with what each needs), in the menu's order, **Save** (explicit, per kind:
  switching kind keeps the unsaved boxes) and **Back to the usual list** (`DELETE`). The principal sees the boxes fixed.
- **Leave & arrangements** follows its two keys: the Arrangements tab is `timetable.edit`, the Leave requests tab `staffleaves.view` (Approve / Decline
  `staffleaves.decide`, Arrange periods `timetable.edit`); either key shows the page, a person with one sees that tab only and the other is never asked for.
- The menu: `NavItem.permission` shows a page to a person who is not in `roles` when their kind has ANY of the keys (`navVisible`);
  `schoolWide` pages follow `canOnSchool` (`schoolPermissions`): never a teacher's, parent's or student's own list, but a teacher who is also on the
  staff gets them by their role's list (and the school's dashboard as their home, with their own attendance and classes on it). A person the school allowed to see students has one **Students** entry
  (`/school/students`); Attendance opens Student / Teacher by `attendance.view` / `attendance.teachers`; Calendar and Leave requests by their keys.
- Pages: `PermissionRoute` (keys) guards the student list and a student's page (`students.view`), Add student and Bulk upload
  (`students.add`, inside `RunningYearRoute`), the inactive list (`students.status`), attendance pages. On the pages, each button follows its
  key: Students (Export: the school admin and the principal open the layout page, anyone else with `students.export` downloads the file at once; Bulk upload, Add student, the inactive tab, the ticks), a student's page (Add a sibling, Transfer, Make inactive, Edit,
  the parent's login), Attendance > Student gets **Take attendance** (to `/class-work/:classId?section=...&tab=attendance`) for
  `attendance.mark` (teachers only), a class's work page (tabs by key; the marks are fixed for everyone but the class teacher, whatever is ticked), Leave requests (Approve/Decline by
  `leaves.decide`), Calendar (`calendar.manage`), the dashboard (`dashboard.view`, else the person's own home), the parent's child page (each
  part by its `child.*` key, and a part not allowed is not asked for).
- `utils/permissions.ts`: `can(user, ...keys)`, `toggled` (the page's ticking rule), `IMPLIES` (mirrors the server). A session without its own
  list (a server older than this screen) has the usual list of the kind (`USUAL`), so nobody loses a page.
- `hooks/usePermissionRefresh.ts` (in `MainLayout`): the session is read again when the window gets focus (at most every 15 s), so a box the
  school ticked reaches the menu without signing in again; nothing is stored when nothing changed. The server checks every request anyway.

## Tests

Backend: `permissions/__tests__/permissions.test.ts` (catalogue, API, kinds) and `permissions.access.test.ts` (real routes: what each key
opens, what stays closed, teachers' own classes, parents' parts, kinds of staff), `teachingStaff.test.ts` (a Coordinator and an Accountant who
also teach: both lists, their own classes, the whole school by their role's list). Frontend: `utils/permissions`, `navConfig`, the Permissions page,
`PermissionRoute`, Students / ClassWork / Leaves / ChildPage / Dashboard / StudentAttendance permission tests, `usePermissionRefresh`.
Real Chrome on the throwaway stack (`e2e-perm.cjs`, 10 steps): the admin ticks boxes for a Receptionist; the receptionist's menu follows (Students,
Attendance > Student, Calendar, Leave requests only), the Students page has Add student and Bulk upload but no Export, a student's page has no
Edit / Make inactive / Transfer, `/school/exams` sends them home and the API answers 403, they take a class's attendance; the admin takes the
permission away and the menu follows; a Librarian is untouched.

## Not built (later)

- A permission for pages that do not exist yet (fees, Staff attendance, library...): add a key to `PERMISSION_GROUPS` with the page.
- Read-only versions of the editors: the timetable, exams, classes and promotion pages are the full editors, so one key (`.edit` / `.manage`) opens them; there is no "see only" key for them.
- A list **per person** (only per kind). A principal who teaches keeps the principal's everything but has no teacher login, so the class-teacher-only
  work (taking attendance) is not theirs.
- A teacher who is also on the staff moves only to the mediums they teach in (the medium switch); their role's pages work on their own medium.
- A notice to the person when their permissions change (they find out when the window is opened again).
- Add staff does not show the role's permissions yet (it will link here).
- The bell for a teacher's or staff member's new leave goes to the school admin and the principal only, not to a kind of staff given `staffleaves.view`.
- A class teacher writing the remark on their class's report cards (it is `documents.manage`, a staff key).
- Turning the always-on parts (own check-in, My leave) off for a kind.
