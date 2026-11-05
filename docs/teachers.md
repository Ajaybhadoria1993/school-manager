# Teachers and their logins

Built 2026-11-03. Backend: `backend/src/main/staff` (the Teacher record and its login), `backend/src/main/auth` (sign in by email **or username**) and
`backend/src/main/users` (`User.username`, `User.email` now optional). Frontend: **Teacher** on top of the menu (`/teachers`,
`pages/teachers/TeacherDirectory.tsx`) and **Manage school > Manage Teacher** (`/school/teachers`, `FrontEnd-React/src/pages/school/Teacher*.tsx`,
`components/teachers/`; it was called *Teachers* until the evening of 2026-11-03). Before this the teacher was only a name for the timetable and there was no
screen to add one (the handoff of the same day, open point 1).

## What the school does

0. **Teacher** (the menu's Overview group, under Classes and Students; `/teachers`, title *All Teachers*) is for finding and opening teachers, laid
   out like Infinity Medisetu's patient list (2026-11-03, round 4): **Add teacher** at the top right (`/teachers/new`, the same 4 steps,
   breadcrumb under Teacher); four tiles **Teachers / Class teachers / Without classes / Have left** (`GET /staff/teachers/summary`, read once,
   not again for each filter; *without classes* = no subject of a class and no class to look after); then **one line** (from 1280px; narrower,
   the search goes on its own line above) with a search (name, mobile, employee code, email, username) and four dropdowns **without labels**
   (each shows its name until something is picked, then the pick, tinted; the first row of its list, e.g. *All subjects*, takes it away),
   **each one a question to the server and kept in the address**: Status (Teaching / Have left / All teachers), Subject (can teach), Class
   (teaches a subject of it or is the class teacher of one of its sections), Designation. The user took the Employment, Gender, Login and
   Class teacher dropdowns off the same night ("bas yahi rakho"); the API still takes those filters. The table: avatar, name, post and code; contact (mobile, email); can teach (three, then +N); **classes** (class
   teacher of, and the subjects given this year); username; a **Teaching / Left** pill; a pencil (`/teachers/:id/edit`). A click anywhere on a
   row opens the teacher (`/teachers/:id`). Under the table the count, and *Clear filters* when a filter is on. Columns give way as the screen
   narrows (Can teach below 1536px, Contact below 1280px, Classes below 1024px, Login below 768px, Status and the pencil on a phone).
   The teacher's page and its change form are the same pages as under Manage Teacher, at `/teachers/:id` and `/teachers/:id/edit`, with the
   breadcrumb and links staying under Teacher (`hooks/useTeacherBase.ts`). A teacher leaving stays on Manage Teacher.
1. **Manage Teacher** in the sidebar (Manage school) lists the teachers: name, code and mobile, what they can teach, what they were given this year, the
   days they do not come, and their **login** (the username, or "No login"). Teaching / Left tabs and a search. The name opens the teacher's page;
   *Week*, *Change* and *Give classes* / *Has left* / *Bring back* are the actions the old Timetable > Teachers page had (that address
   `/school/timetable/teachers` now leads here).
2. **Add teacher** (`/school/teachers/new`) is four steps, like onboarding and Add student (Next checks its own step; Back loses nothing).
   The page is as wide as the app's content area (like Add student), three boxes to a row on a laptop:
   * **Personal info**: name*, gender*, date of birth, mobile*, email; address (house and street, city, state, PIN). The mobile box keeps
     **only 10 digits** (letters and spaces never get in; a pasted `+91 98765 43210` becomes `9876543210`); the PIN code keeps 6 digits;
     the address boxes have the browser's autofill off (it filled in the admin's own address).
   * **Job details**: employee code, designation (the usual posts, or type one), qualification, full / part time / contract, joining date,
     experience (years, digits only).
   * **Teaching**: subjects they can teach (chips) with **Other** at the end: type a subject the school does not have, Enter, and it is added
     to the school's subjects (`POST /subjects`, so the timetable has it too) and picked; a name the school already has (any capitals) is
     picked, not made again; a refused name says why under the chips. Most periods a day / a week (digits only), **Days off** (a day
     switched on is shown in red, struck through: away, not chosen).
   * **Login**: a **username**, put in the box as the name with a two-digit number (`meena.singh_41`; the same one when the step is opened
     again for the same name; kept if the person typed their own), and a **password** (10 characters, already made, easy to read out: no
     0/O/1/l/I; a button makes another). `*` = needed.
   * **The username is checked while it is typed** (`GET /staff/usernames/check`, 400 ms after the typing stops): *Available* in green, or
     *This username is taken. Try another* in red with three free usernames under it (one click puts one in the box). Taken means taken on
     the **whole platform**, by a teacher of any school. **Add teacher** sends nothing while the box says taken; a username taken by someone
     else a moment after the check is refused by the server (409) with suggestions in its message.
   * **Both dates** (date of birth, joining date) are HeroUI's date box: day / month / year typed in place (`dd / mm / yyyy`, `en-IN`), or
     picked in HeroUI's calendar (the button at the right; its heading opens a list of years), and a cross clears the date. The joining date
     also has one-click days under it: **Today, Tomorrow, Next Monday, 1st of next month** (a day never twice). The calendar only offers
     what the rules allow (date of birth: 18 to 76 years ago; joining date: up to a year ahead).
   The last step makes the teacher and the login in **one request** and shows the username and the password once, with **Copy login details**
   (a message: where to sign in, username, password) and *Add another teacher* / *View teacher*. The password is kept only as a hash: it cannot be read again.
3. **A teacher's page** (`/school/teachers/:id`, or `/teachers/:id` from Teacher): first a **Classes** card (*Class teacher of* chips and
   *Teaches* rows "Class 5 - A · Mathematics · 6 periods a week", each with a cross that takes it away in one click; **Assign class** opens a
   window: Class, Section (when the class has sections), Subject (the subjects the section studies first, then the school's others; a subject it
   does not study yet asks its **Periods a week** and is added to it) and a tick **Class teacher of Class 5 - A**). Then four cards (Personal, Job, Teaching, Login).
   The Login card has **Change username** (checked free on the whole platform as it is typed, like Add teacher, with free ones when taken; the
   password and the sessions stay) and **New password**: the school types the password it wants (or makes one), it is shown once to hand over
   and the old one stops working at once. The password itself is never shown (only a hash is kept; the user agreed on 2026-11-03). The Login card shows the username and Active / Closed,
   and **New password** (a new one is made, sent, then shown once to hand over; the teacher's other sessions end) or, for a teacher with no login
   (everyone added before today), **Make a login** (needs the mobile number on record). **Change** (`/school/teachers/:id/edit`) is the first three
   steps' boxes on one page with one Save (the login is not there). Only the name is needed there (and the mobile number, for a teacher who has a
   login): a gender is asked when a teacher is added, not when one is changed, so an older teacher who was given a login later can still be saved.
4. **The teacher signs in** on the ordinary login page (one box: *Email or username*) with the username (or the email, if they have one) and the
   password; the mobile app will use the same `POST /auth/login` (`device: "android" | "ios"`). They are a user with the role `teacher`. Their **home**
   is the dashboard: a greeting and **About you** (post, code, mobile, what they can teach, what they were given this year, days they do not come,
   their username), from `GET /staff/teachers/me` and the subject names; none of the school's setup, numbers or shortcuts (before this, a teacher saw the school
   admin's dashboard, with "Administrators: You, as the school admin"). Through the API they also see their colleagues (names and what they take) and
   published timetables. Their timetable and classes on that page are not built yet.
5. **A teacher who has left** (Has left, or Give classes with "make them inactive") has their login **closed** at once (cannot sign in; refresh
   tokens deleted; the next request with an old access token is refused as the account is disabled). **Bring back** opens it again.

## API (all under `/api/v1`)

| Method and path | Who | What it does |
| :--- | :--- | :--- |
| `POST /auth/login` | anyone | body `{ identifier, password, device? }`; `identifier` is an email (has `@`) or a username. `email` is still accepted as the old name of the same box. |
| `GET /staff/teachers?status&search` | school admin, principal, teacher | the list. A **teacher** gets a colleague view: name, mobile, email, code, subjects, limits, days off, load, designation, **not** birthday, address, gender, qualification, joining date or login. |
| `GET /staff/teachers/:id` | school admin, principal | one teacher with everything and `login: { username, isActive } \| null` |
| `GET /staff/teachers/me` | teacher | the signed-in teacher's own record (found by their login; 404 `TEACHER_NOT_FOUND` for a teacher login with no record) |
| `POST /staff/teachers` | school admin, principal | add. Only `name` is needed (the timetable flow still adds a teacher by name). With `login: { username, password }` the teacher **and** a login are made; the mobile number is then needed (`mobile` 400). |
| `PATCH /staff/teachers/:id` | school admin, principal | change some boxes (an `address` part given is set, the others kept; an empty box or `null` clears). The login's name, phone and email follow; `isActive` switches the login. |
| `GET /staff/usernames/check?username=` | school admin, principal | `{ available, suggestions }`: free or taken on the whole platform; a taken one comes with up to 4 free ones like it (the name, `_` and a number: two digits, then three, then four if the shorter ones are gone). Nothing else is said (not whose it is, not which school). 400 `username` for one that could never be a username. |
| `GET /staff/teachers/summary` | school admin, principal | `{ teaching, classTeachers, withoutClasses, left }`: the tiles of the Teacher page (class teachers and given classes count this year and the next; *withoutClasses* = teaching, no subject of a class and no class teacher post) |
| `GET /staff/teachers?status&search&subjectId&designation&employmentType&gender&login&classId&classTeacher` | (filters) | `login` = with / without / closed; `classId` = teaches a subject of the class or is a class teacher in it (this year and the next); `classTeacher` = yes / no. Each teacher has `classTeacherOf: ["Class 5 - A"]`. The search also looks at the email and the username (not for a teacher reading). |
| `GET /staff/teachers/:id/classes` | school admin, principal | `{ classTeacherOf: [{ classId, sectionId, label, academicYear }], subjects: [{ ...unit, subjectId, subjectName, periodsPerWeek }] }`, this year and the next |
| `PATCH /staff/teachers/:id/login` | school admin, principal | `{ username }`: another username (409 `USERNAME_TAKEN` with free ones, path `username`; 409 `TEACHER_HAS_NO_LOGIN`) |
| `PUT /staff/class-teachers` | school admin, principal | `{ classId, sectionId \| null, teacherId \| null }`: the class teacher of a section, or of a class without sections (null takes it away). 400 `teacherId` for a teacher who left or is not the school's; `UNIT_NEEDS_SECTION` for a split class without a section. Answer `{ classId, sectionId, label, teacher }` |
| `PUT /subjects/allotments/teacher` | school admin, principal | `{ classId, sectionId \| null, subjectId, teacherId \| null, periodsPerWeek? }`: the teacher of one subject of a unit, the rest of its list untouched (the same checks as saving the whole list: a teacher busy at a period the subject is placed is refused, `TIMETABLE_CLASHES`). A subject the unit does not study yet needs `periodsPerWeek`. Answer: the unit's list (`AllotmentView`) |
| `POST /staff/teachers/:id/login` | school admin, principal | a login for a teacher who has none `{ username, password }` (409 `TEACHER_HAS_LOGIN`; 400 `mobile` if no mobile on record) |
| `POST /staff/teachers/:id/reset-password` | school admin, principal | `{ password }`; 409 `TEACHER_HAS_NO_LOGIN` |

Fields added to the Teacher: `gender` (Male / Female / Other), `dateOfBirth`, `address { line1, city, state, pincode }`, `designation`,
`qualification`, `experienceYears` (0 to 60), `joiningDate`, `employmentType` (`full_time | part_time | contract`). All optional; a filled one must be right
(`dateOfBirth`: 18 to 75 years old today; `joiningDate`: not more than a year ahead; PIN 6 digits; state from the list).

## Rules and decisions

* **A username** is 3 to 30 of `a-z 0-9 . _`, starting with a letter (so it can never be an email or a number), lower-cased; **unique on the whole
  platform** (the login box has no school to choose). A taken one is a 409 `USERNAME_TAKEN`: "This username is taken. Try another, for
  example meena.singh_41 or meena.singh_73" (`staff/services/usernames.service.ts`, the same suggestions as the check; a number already at
  the end is not stacked: `meena.singh_30` gives `meena.singh_NN`).
* **`User.email` is optional.** A teacher with no email signs in by username; an email, when given, is unique platform-wide
  (409 `LOGIN_EMAIL_TAKEN`). The unique indexes are partial (`one_user_per_email`, `one_user_per_username`): `server.ts` runs `syncIndexes()` at start, which
  replaces the old plain `email_1` index. `PublicUser` / `AuthUser` have `email: string | null` and `username`. A teacher without an email cannot use
  *Forgot password* (there is nowhere to send it): the school gives a new password.
* **The password** follows the platform's rule (8 to 72, upper, lower, digit, symbol). The school chooses the first one; the browser makes it
  (`generatePassword`, `crypto.getRandomValues`) and it travels over HTTPS in the body like any password. Nothing stores it in clear.
* **No transactions** (standalone MongoDB): `TeacherService.create` checks the username, the email, the mobile and the code first, makes the teacher, then the
  login, and **undoes the teacher** if the login fails (two people adding the same username at once: exactly one wins, the other leaves nothing).
* The login is a `User` with `role: "teacher"`, `tenantId` of the school, `phone` = the teacher's mobile. `Teacher.userId` links them. `TeacherLogin` (`staff/services/teacherLogin.service.ts`) is the one place that makes it, changes it and switches it.
* A teacher's *privacy*: the colleague view above; the teacher's own page is for the people who run the school.

## Class teachers and giving classes (2026-11-03, evening)

* **A class teacher** is a `ClassTeacher` row (`staff/models/ClassTeacher.ts`): one per unit (a section, or a class without sections) per
  academic year, unique index `one_class_teacher_per_unit`. A teacher may be the class teacher of more than one unit (small schools); the list
  shows all. Class pages read it in `GET /students/class-overview` (`classTeacher` on each section, and on a class without sections).
* **A teacher who leaves** (Has left) stops being anybody's class teacher (the rows go); **Give classes** hands the posts to the new teacher
  with the subjects and lessons.
* **The subjects a teacher teaches are the timetable's own list** (`Allotment.teacherId`): giving Maths of 5-A to a teacher on their page or
  on the class's page is the same as choosing them in the timetable, so the timetable shows them at once (the period box says "Mathematics ·
  Asha Rao"). Per lesson, the timetable's *Teacher & room* can still name another teacher.
* **School Class > a class**: a section's card shows its class teacher; with a section picked (or for a class without sections) a **Teachers of
  Class 5 - A** box shows the **Class teacher** dropdown and each subject with its periods a week and its teacher dropdown (a pick is saved at
  once, with a message; a refusal says why), and **Add subject** (subject, periods a week, teacher). *All sections* has no box (a class teacher is a
  section's).

## Not built (ask if wanted)

* The teacher's own screens beyond the home above: my timetable, my classes, my profile; **change password by the teacher** (today only the school can give a new one, and there is no "must change on first sign-in").
* Photo and documents (Aadhaar, PAN, certificates), salary and bank details (HRMS), leave, attendance of teachers.
* A teacher in two schools (the username and the email are unique on the platform, so the second school needs another username).
* Importing teachers from Excel.

## Tests

* Backend: `staff/__tests__/teacherProfile.test.ts`, `teacherLogin.test.ts`, `teachers.test.ts`, `staff.isolation.test.ts` (new probes for read, login, reset),
  `usernameCheck.test.ts` (free / taken across schools, suggestions free and inside 30 letters, who may ask, nothing else leaks);
  `auth/__tests__/usernameLogin.test.ts` (username sign-in, rate limit by username, partial unique indexes).
* Frontend: `utils/__tests__/teachers.test.ts`; `pages/school/__tests__/TeacherAdd.test.tsx`, `Teachers.test.tsx`, `TeacherDetail.test.tsx`, `TeacherEdit.test.tsx`;
  `pages/auth/__tests__/Login.test.tsx`; `pages/dashboard/__tests__/Dashboard.test.tsx` (a teacher's home, and the school's dashboard unchanged).
* A browser journey (real Chrome, throwaway API 5001 / app 5174 / database `school_erp_t1`, dropped afterwards): the school admin signs in, Teachers in the
  sidebar, the four steps (errors, Back, suggestions), the credentials, the teacher signs in by username (capitals ignored) and sees their own home, is kept out
  of `/school/teachers`, a new password ends the old one and the old refresh token, Has left closes the login and Bring back opens it, Change, Make a login for an older
  teacher, a taken username, the old address; 33 steps at desktop width and 32 at 390 px, no sideways scroll, no console or network errors.
  Round 2 (same day, two schools, the other one having `vivek.sharma_30`): page width, 10-digit mobile typed and pasted, date of birth typed
  and its calendar, Today / Tomorrow / a calendar day for joining, digits-only boxes, Other subject (new and already there), Days off, the
  numbered username Available, `vivek.sharma_30` taken with suggestions, Add blocked while taken, a suggestion taken in one click, what was
  saved, the teacher signing in with it, Change showing `04 / 04 / 1995` and the cross clearing a date: 28 steps at 1880 px, 26 at 390 px.
