# Staff: people who work for the school without teaching

Built 2026-11-07; **changed 2026-11-08 (the user): the school makes the username and the password, there is no invitation email for staff.**
Backend: `backend/src/main/staff` (the `StaffMember` record, next to the Teacher) and `backend/src/main/users` (new roles). Frontend: **Staff** in the
menu (`/staff`, `pages/staff/`, `components/staff/`).

The user asked for it like Infinity Medisetu's *add a doctor / reception / lab / pharmacy*: the school fills the details, picks a **role** and makes
the person a **username and a password** (exactly as it does for a teacher or a parent); the person signs in with those. **The email link system stays
for the school admin only** (the platform's invitation and the confirmation of a school registered from the sign-in page: `school_invite`,
`school_signup`, `AcceptInviteService`, `/accept-invite`). Staff have no invitation, no accept page and no "forgot password" link. More roles will
come later, one line each (see "Adding a role").

## What the school does

1. **Staff** (menu, Overview group, after Attendance; school admin and principal only) lists everyone: name, **the username they sign in with**, role,
   designation, mobile and a status pill. Tabs **All / Active / No login / Inactive** with the count of each (counts do not change with the filter;
   the **No login** tab is there only while somebody has none), a Role dropdown and a search (name, **username**, mobile, email, employee code). Every
   tab, role and search is one request answered by the server.
2. **Add staff** (`/staff/new`) is one page of four cards, like Add teacher but without steps, **in this order**: **Staff member** (name, date of birth
   with the age it makes under it, gender, mobile, **email, optional**: only a contact and a second way to sign in), **Address**, **Role** (the role;
   for *Other* a **Role name** box; the *Also a teacher* switch with the subjects they teach; designation; employee code; joining date) and **Login**
   (**username** and **password**). The role's one-line description shows once chosen. The username follows the name (`asha.rao_41`) until it is
   typed, is checked free on the whole platform as it is typed (a taken one made from the name is swapped for a free one; a taken one that was
   typed says so with free ones to click and blocks the button); the password is already made (10 characters, typed or made again with the
   button in the box). Required: role, name, username, password (and the role's name for Other). **Add staff** adds the person *Active* with the
   login, and the page shows **the username and the password once** (`CredentialsCard`: copy as a message to send; "cannot be seen again after
   you leave this page"). **Add another** gives a clean form with a new password.
3. On the list, per person: **Change** (`/staff/:id/edit`, the same boxes without the Login card; the **email can be changed or emptied**),
   **Username** (change it; the password and the sessions stay), **New password** (the school makes it, shown once; the old one stops and every
   session ends), **Make inactive** (asks; the login closes at once) and **Make active** (one click). The windows are the ones the parents' logins use
   (`components/logins/LoginDialogs.tsx`).
4. **A person with no login yet** is one added before 2026-11-08 (they were *Invited*; the pill and the tab now say **No login**). They get **Make a
   login** (a username from the name and a password already made, same checks) or **Remove** (asks; only a person with no login can be removed: one
   with a login is made inactive instead).

What a staff member sees when signed in (they sign in with the **username and password** on the usual sign-in page; the email works too if the school
gave one):

| Role | Menu | Home |
| --- | --- | --- |
| Principal | the school admin's pages, Staff included (an existing role) | school dashboard |
| Accountant | what the school's modules list for it (existing role; no module of its own yet) | school dashboard |
| Receptionist, Management, **every other kind** (vice principal, librarian, driver... and Other) | **Dashboard** and **Calendar** | `StaffHome`: greeting + "About you" (name, **their own title**, **username**, email only if there is one, school) |
| **Also a teacher** (any role except Principal and Accountant) | a teacher's: Dashboard, Calendar, Leave requests | the teacher's home (My classes...) |

A module is opened to a role by adding the role to **that module's own list** (`requireRole(...)` on its routes and `roles` in
`nav-config.ts`). Nothing else changes.

## Roles, Other, and "Also a teacher"

- **19 roles** (`STAFF_MEMBER_ROLES`): Principal, Vice principal, Accountant, Receptionist, Management, Coordinator, Clerk / office staff, Librarian,
  Lab assistant, Counsellor, Nurse, IT / computer support, Transport in-charge, Driver, Security guard, Peon / attendant, Housekeeping, Hostel warden,
  **Other**. Each has `login`: the *User* role the person signs in with. Principal, Accountant, Receptionist and Management keep their own; **every other
  kind signs in as the plain `staff` role** (Dashboard + Calendar, same as receptionist/management: `SCHOOL_PEOPLE` and the menu list it).
  No kind has more than that until a module opens to it, so a **Vice principal has no admin powers**: pick Principal for that.
- **Other**: the school writes the role's name (`roleOther`, up to 40 letters, required for Other and dropped for every other role). It is the role's
  label everywhere (list, filter, the title under the person's name).
- **The title shown** is `User.roleLabel` (set when the login is made and when their role changes); `PublicUser.roleLabel` carries it, the top bar,
  the menu and `StaffHome` show it before the role's own name. A plain `staff` login would otherwise only read "Staff".
- **Also a teacher** (`alsoTeacher`, `subjectIds` on the `StaffMember`): checked **before anything is made** (room for one more teacher, the subjects
  are this school's, no other **teacher** has the mobile or the employee code: 409/400 with the box named, and nothing is left behind). With the
  login, a `Teacher` of the school is made from their details (`teacherId` on the staff record), with the subjects as what they can teach.
  `StaffTeacher` (`staff/services/staffTeacher.service.ts`).
  - The login's role is `loginRoleOf(role, alsoTeacher)`: **a teacher's** (My classes, class work, exams, self check-in), because those pages test
    `role === "teacher"` in about twenty places. The staff role stays on the record and as the title (`roleLabel`).
  - **Principal and Accountant keep their own login** (a teacher login would take their pages away): they are a Teacher of the school (classes and
    periods can be given to them) **without a teacher login** (the Teacher is not linked to the login). Changing a person between such a role and
    another moves the teacher login with it.
  - *Also a teacher* can be switched **on** later (they become a teacher at once, sessions end, they sign in as one) but **not off** (409
    `STILL_A_TEACHER`; the switch is locked): they stop as a teacher by being made inactive on the Teacher page. Details, mobile, code, subjects
    changed in Staff reach the Teacher record (**one way**: a change on the Teacher page does not come back).
  - **On and off go together**: Make inactive / active in Staff does the same to the Teacher (refused with `TEACHER_HAS_CLASSES` while classes are given
    to them: nothing changes); made inactive on the Teacher page, they show Inactive in Staff too.

## API (all under `/api/v1/staff`, school admin and principal)

| Method + path | What |
| --- | --- |
| `GET /members?status=all\|active\|invited\|inactive&role=&search=` | the list sorted by name, with `counts` of each status (`invited` = no login yet); each person has `login: {username, isActive} \| null` |
| `POST /members` | `{name, role, roleOther? (needed for other), login: {username, password}, email?, mobile?, gender?, dateOfBirth?, address?, designation?, employeeCode?, joiningDate?, alsoTeacher?, subjectIds?}` → 201 the person (*Active*, with `login`, `roleLabel`, `roleOther`, `alsoTeacher`, `isTeacher`, `subjectIds`) |
| `GET /members/:id` | one person |
| `PATCH /members/:id` | details, **email** (`null` empties it), role, `alsoTeacher` / `subjectIds`; `isActive` only for a person with a login (409 `STAFF_HAS_NO_LOGIN` otherwise) |
| `POST /members/:id/login` | `{username, password}` for a person with none → 201 (409 `STAFF_HAS_LOGIN` if they have one) |
| `POST /members/:id/reset-password` | `{password}`: the old one stops and their sessions end (409 `STAFF_HAS_NO_LOGIN`) |
| `PATCH /members/:id/login` | `{username}`: the password and the sessions stay |
| `DELETE /members/:id` | takes away a person **with no login** (409 `INVALID_STATE` for one with a login) |
| `GET /usernames/check?username=` | the check Add teacher already uses (free on the whole platform, with free suggestions) |

A refused username is `409 USERNAME_TAKEN` with `details[0].path = "login.username"` (under the Username box); a refused email is `409 EMAIL_IN_USE`
(another staff member) or `LOGIN_EMAIL_TAKEN` (a login somewhere) under the email box. Gone with this change: `POST /members/:id/resend-invite`, the
`staff_invite` AuthToken type, `staffId` on AuthToken, the staff branch of `AcceptInviteService`, the `staffInvite` email template.

## Rules and decisions

- **Roles today** (`STAFF_MEMBER_ROLES`, `backend/src/main/staff/constants.ts`; same list in `FrontEnd-React/src/constants/staffMembers.ts`):
  the 19 above. `receptionist`, `management` and `staff` are in `USER_ROLES`.
- **Adding a role later**: one entry in the backend list (with its `login`) and one in the frontend list; a kind that signs in as plain `staff` needs
  nothing else. Only a kind with pages of its own needs `USER_ROLES` / `UserRole`, a label in `ROLE_LABELS` (`nav-config.ts`) and a place in the lists of
  the modules it may open. The form, the list and the filters follow.
- **The school makes the login with the person** (`TeacherLogin.create(tenantId, person, login, { role, roleLabel })`, the same service as teachers and
  parents). The username is unique on the whole platform; the password follows the platform's rules and is stored only as a hash.
- **The email is optional.** One that is given must be an email, is lower-cased, is unique among this school's staff (partial unique index
  `one_staff_member_per_email`) and must not already be somebody's login anywhere. It is a contact and a second way to sign in.
- **No forgot-password email for any login the school makes**: `SCHOOL_SET_PASSWORD` in `password.service.ts` is teacher, parent, principal, accountant,
  receptionist, management and staff. Only the school changes their password (New password). The school admin keeps the email reset.
- **Role change** updates the User's role and title and ends their sessions (they sign in again with the new one). Name and mobile are kept in step with
  the User.
- **Inactive** closes the login at once (a request with an old token is refused 403) and keeps the record; active opens it again.
- **Employee code** is unique per school (409 `STAFF_CODE_EXISTS`). Up to 200 staff members per school (`LIMIT_REACHED`). Age 18 to 75 when a date of
  birth is given.
- **Added before 2026-11-08** (invited by email): the record stays, with `status: "invited"` and no login. Their old link no longer works (the staff
  invitation is gone). The school makes them a login (**Make a login**) or removes them. `acceptedAt` is no longer kept.
- Tenant-isolated: `StaffMember` is on `YEAR_FREE_MODELS` (the same person every year) and has its own isolation spec (all the routes above are probed).

## Not built (ask if wanted)

- The pages a receptionist or the management would use (admissions, visitors, reports): they see the dashboard and the calendar only.
- A permissions screen (who can open which module) and a staff detail page.
- Bulk upload / export of staff, own fields for staff (teachers have both).
- A second role for the same login: a Principal or Accountant who teaches has no "My classes" (they would need a login that is both: about twenty
  `role === "teacher"` checks to open up); switching *Also a teacher* off after they teach; a change on the Teacher page reaching the Staff record.
- Staff changing their own password (only the school does, as for teachers and parents).
- Attendance of staff other than teachers.

## Tests

- Backend: `staff/__tests__/staffMembers.test.ts` (19: adding with a login, the list, a person who works here, a person with no login yet),
  `staffRoles.test.ts` (18: the roles, Other, what each signs in as, no forgot-link, who also teaches), `staffMembers.isolation.test.ts`,
  `tenants/__tests__/modelRegistry.test.ts`; `auth/__tests__/auth.test.ts` (the forgot-password tests now use the school admin).
- Frontend: `utils/__tests__/staffMembers.test.ts`, `pages/staff/__tests__/{StaffDirectory,StaffAdd,StaffEdit}.test.tsx`,
  `pages/auth/__tests__/AcceptInvite.test.tsx` (now the school admin's invitation and confirmation only), `pages/dashboard/__tests__/Dashboard.test.tsx`
  (staff home), `components/layout/__tests__/navConfig.test.ts`.
