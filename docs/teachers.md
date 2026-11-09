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
| `PUT /subjects/allotments/teachers` | school admin, principal | (2026-11-06) what the class's one **Save** sends, all or nothing: `{ classId, sectionId \| null, classTeacherId?, subjects: [{ subjectId, teacherId \| null, backupTeacherIds: [] }] }`. `classTeacherId` left out = the class teacher stays, `null` takes it away; a subject not named keeps its teachers; `backupTeacherIds` is the order of priority 2, 3... (at most 4, never the main teacher, none without a main teacher). Everything is checked first and then written (no transactions): a refusal changes nothing (`TIMETABLE_CLASHES` for a busy main teacher; 400 with the path `subjects.N.teacherId` / `subjects.N.backupTeacherIds` / `classTeacherId`). Answer: the unit's list (with `backups` on each row) and `classTeacher: { id, name } \| null` |
| `GET /staff/teachers/settings` | school admin, principal | (2026-11-07) `{ customFields }`: the school's own fields for its teachers (none until it makes one) |
| `PUT /staff/teachers/settings` | school admin, principal | `{ customFields: [{ key, label, type, options, mode }] }`: the whole list as it should be (a field left out is deleted; its answers stay on the teachers' records, unseen). Each entry is judged on its own (2 to 40 characters, not a usual column's name, once; a list needs its choices; a yes / no cannot be needed; at most 20); a field keeps its kind (400 `customFields.N.type`) |
| `GET /staff/teachers/export?status&search&subjectId&designation&classId...` | school admin, principal | (2026-11-07) the teachers the list shows (the same query as `GET /staff/teachers`) as one Excel file `teachers-<school>-<date>.xlsx`: the sample file's columns first, with the same titles and no Password (so it can be uploaded back), then Status, Class teacher of, Classes given. Every box is text |
| `GET /staff/teachers/import/template` | school admin, principal | (2026-11-07) the sample Excel for a bulk upload, made for this school (its subjects listed): file name `teachers-template-<school>.xlsx` |
| `POST /staff/teachers/import/read` | school admin, principal | a multipart `file` (.xlsx or .csv, up to 5 MB, up to 300 rows) read into `{ fileName, sheetName, headerRow, headers, rows: [{ row, cells }] }`; nothing is saved or kept |
| `POST /staff/teachers/import` | school admin, principal | a part of a file: `{ rows: [{ row, teacher, subjectNames?, username?, password? }] }`, 1 to 10 rows. Each row is judged by the same schema as `POST /staff/teachers` and made with a login. Answer `{ results: [{ row, ok, code?, errors: [{ path, message }], teacher?: { id, name }, login?: { username, password } }], ok, failed }`; `login.password` is there only when it was made up (null when the file gave it) |
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
  section's). *(Since 2026-11-06 the box lives on the class's Timetable & teachers page and works with a Save button: see the next section.)*

## Teachers box: one Save, and backup teachers (2026-11-06)

`components/schoolClass/UnitTeachers.tsx`, on `/school-class/:id/timetable`.

* **Nothing is sent when a teacher is picked.** The choices stay on the screen (the changed rows are tinted); **Save** (always there, off until
  something changed) sends **one** request (`PUT /subjects/allotments/teachers`) with the class teacher and only the subjects that changed, then a
  window says *Teachers saved* (or *Teachers not saved* with the server's reason, the choices kept so Save can be tried again). **Cancel** (only
  while something is changed) puts everything back as saved. Leaving the page, or switching section, with changes not saved asks *Leave without
  saving?* (and closing the tab asks too). Picking again what was saved is no change.
* **Tiles, not a long list (2026-11-07).** The class teacher is the first tile, then one tile per subject, 2 to 4 to a line by the width of the box
  (container queries: `@xl` 2, `@3xl` 3, `@6xl` 4; one to a line on a phone), so 7 subjects fit in two lines.
* **Each subject has a list of teachers in order of priority.** **1 is the main teacher**: the one the timetable puts in the periods
  (`Allotment.teacherId`, nothing about the timetable changed). **2, 3... are other teachers** (`Allotment.backupTeacherIds`, at most 4, all optional): they manage the
  subject when the main teacher does not come. In a tile the main teacher is a normal dropdown (marked 1); under it is **Other teachers (optional)**,
  **one dropdown where several names can be ticked** (it says "2 other teachers" when closed). The order the names are ticked in is their priority:
  they are shown as chips numbered 2, 3... with a cross to take one off (the others move up); to change the order, take one off and tick it again.
  The dropdown waits (greyed) until there is a main teacher; once four are ticked the rest of the names are greyed. An other teacher has **no periods** of
  its own, so one who is busy at that hour is not a clash. A teacher is in a subject once (the main teacher is not in the list; picking one of the other
  teachers as the main teacher takes them out of the list; taking the main teacher away takes the others away, since a subject with others and nobody
  to back up makes no sense).
* **Edit timetable** is not in the page header any more: it is on the right of the **Week** heading, where the week it opens is shown.
* **Add subject** is its own action and is saved at once (it also ends in a window). A change not yet saved is kept while it is added.
* **The week below the box** is read again after a Save (it names the teachers); the list itself comes back in the answer of the save, so it is not
  asked for twice.
* **A new backup is told** (bell, kind `subject.assigned`: "You are the backup teacher of English in Class 5 - A"); a new main teacher gets the
  usual "You teach..." notice. Nobody is told twice for one save.
* **Not built:** using the backup *by itself* when the main teacher is absent (for example through the teachers' attendance), and letting a backup
  write the diary or marks of the subject: for now the backups are the school's own list of who to ask.

## Bulk upload of teachers (2026-11-07)

For a school that already has its teachers: **Bulk upload** beside **Add teacher** on Teacher (`/teachers/import`) and on Manage Teacher (`/school/teachers/import`, also on its empty page). Three steps like the students' bulk upload (`pages/school/TeacherImport.tsx`).

* **1 Upload file.** The school's own sheet (.xlsx / .csv) or the sample template (`TeacherSheetService`: Teachers sheet with coloured titles and notes, dropdowns for gender, state, designation and employment type, text cells for mobile / PIN / code / days; a Subjects sheet with the school's subjects; How to fill). The file is read by the server (`readSheet`, the same reader as the students', with teachers' words in its refusals) and nothing is kept.
* **2 Preview & fix.** The file as a table (`TeacherPreviewGrid`): each column is recognised by its title (the sample's own and the usual ones: Teacher Name, Phone, Sex, DOB, Emp Code, Post, DOJ, Job Type...; `autoMapTeachers`), a heading dropdown changes a column read wrong, every cell is editable (Enter keeps and goes down, Escape puts back; a box is kept as the school writes it: 10-digit mobile, DD-MM-YYYY day, state / gender / job type by the list's name). A red box says under it what is wrong (the words of Add teacher); Status takes the person to it. A column for the name and the mobile number is added empty when the file has none. The same mobile number, employee code, username or email twice in the file marks the later row. Only Ready rows are uploaded.
* **3 Done.** The ready rows go in parts of **10 rows** (each makes a login and so a bcrypt hash), with a progress bar; the server judges every row again. Rows made leave the table; rows refused stay with the reason; a row whose **mobile number a teacher of the school already has** (`TEACHER_MOBILE_EXISTS`) moves to **Already in school** and needs nothing, so the same file can be uploaded again safely. The page lists the logins made and offers **Download login details** (a CSV with a UTF-8 mark: name, mobile, username, password, sign-in address).

Rules and decisions:

* **Every teacher gets a login** (like Add teacher), so the **mobile number is needed**; gender and everything else is optional (an old register seldom has it). Only name and mobile are green in the sample.
* **Username and password** columns are optional. Left empty, the server makes a username from the name (`usernameBase`: `meena.singh`, then `_` and a number that nobody on the platform has: `freeUsernameFor`) and a password of 10 characters (`generatePassword` in `utils/authUtils.ts`, from `crypto.randomInt`, the platform's password rule, no 0 O o 1 l I). A name with no letters a-z gets no username: the school types one (`username` box of that row). A username the file gives that is taken is refused with free ones like it, the same sentence as Add teacher.
* **The made-up passwords are told once**, in the answer of the upload, and never kept (only the hash is). The page keeps them to list them and to download; leaving the page before they were downloaded asks first. A password the file gave is not sent back (the page lists it as it was written). The school can always set a new password on a teacher's page.
* **Subjects are named in words** (a column Subjects: `Mathematics, Science`; commas, semicolons, slashes). A name the school has (any capitals) is that subject; a name it has not is **added** (`SubjectService.idsByNames`, an academic subject), once however many teachers name it, and only after the row passed every check. The table says so under the row ("New subject, added to your school: Sanskrit"), as a note, never as a problem.
* **Everything about a row is checked before anything of it is made** (the schema, the mobile number and code, the login's username and email, then the subjects, then the teacher with its login, which is undone if the login fails). A refused row leaves nothing behind.
* The upload makes up to the school's own limit (300 teachers); a longer file is refused when it is read.
* Tests: `staff/__tests__/teacherImport.test.ts` (21), `utils/__tests__/teacherImport.test.ts`, `pages/school/__tests__/TeacherImport.test.tsx`, and the Bulk upload buttons in `Teachers.test.tsx` / `TeacherDirectory.test.tsx`.

**Export** (same day, user: "jaise students me Export hai, waisa yaha bhi"): an **Export** button in the header of Teacher and Manage Teacher, before Bulk upload and Add teacher (like the students' header). One click downloads the teachers the list shows now (its tab, search and filters; `useTeacherExport`, `ExportTeachersButton`); off while the list shows nobody. It is NOT the students' configurable export (no field on/off, order or headings): the columns are fixed, and the file can be uploaded back through Bulk upload (its teachers are then "already in your school"). Tests: `staff/__tests__/teacherExport.test.ts` (8), and the Export tests of `Teachers.test.tsx` / `TeacherDirectory.test.tsx`.

## The school's own fields for teachers (2026-11-07)

User: "ab jaise mujhe is bulk upload ki fields ko manage karna ho... jo Excel me aaye aisa hi upload ho jaye, ye flexibility rehni chahiye". The students have had **own fields** for a long time (a house, a bus pass...); the teachers have them now, with the same definition (`CustomFieldDef`: key `c_` + letters/digits, name, kind text / number / date / yes-no / list, choices, **Needed / Optional / Not asked**).

* **Kept:** `TeacherSettings` (one per school, `customFields`), a teacher's answers in `Teacher.custom` by key (an answer to a field the school no longer has stays on the record, unseen). `GET` / `PUT /staff/teachers/settings` (writers only; `customFieldListSchema` in `students.schemas.ts` is shared with the students' own fields; a name may not be a usual column's: `TEACHER_FIELD_NAMES`).
* **Manage them:** Teacher > **Fields** (`/teachers/fields`, `/school/teachers/fields`; a **Fields** button first in the header of Teacher and Manage Teacher, and "Manage fields" in step 1 of Bulk upload). A draft list (add, change, delete with the dialog, reorder with the arrows, Needed / Optional / Not asked) with **Save** (one request) and Cancel; a window says Fields saved / not saved; leaving with changes not saved asks first. A field keeps its kind.
* **Where they show:** Add teacher (in the **Job** step, a card "Your own fields"; a Needed field must be answered, Next waits), Change teacher (same card, filled; Save sends every box, an emptied one as null), the teacher's page (a card), the Export (a column each, after the usual ones an upload reads) and the sample file (a yellow column each, a dropdown for a list and a yes / no). A field set to **Not asked** is shown nowhere.
* **Rules:** Add teacher refuses a Needed field left empty (`custom.<key>`), Change cannot clear one; a bulk upload row is only checked for what it gives (a Needed field it lacks never stops it, like the students' upload). Answers are checked by kind in the form's words ("Choose the Blood Group from the list", "Enter a number for Children"...). A teacher reading the list (a colleague view) never gets the answers.
* **In Bulk upload (the flexibility):** a column that is the name of one of the school's fields is read as it (a file made from the sample or the export); every heading's list ends in the school's fields ("PAN Number (your own)") and **Add a new field…** (a dialog with the file's title, in the teachers' words); and a notice above the table, "2 columns of your file are not uploaded: Hobby, Remarks", has **Add them as your own fields**: one save makes a text field for each (named as the file names it, optional, up to the school's 20), and the file comes in as it is. A column left as Not uploaded stays out; a column named like an existing field is not offered again.
* Tests: `staff/__tests__/teacherFields.test.ts` (13), `utils/__tests__/teacherImportOwn.test.ts`, `pages/school/__tests__/TeacherImportFields.test.tsx`, `TeacherFields.test.tsx`, `TeacherOwnFields.test.tsx`.

Not built: the **usual details** cannot be switched off or made Needed (only the school's own fields can: the students' Manage fields does both for every detail), the kind of an own field cannot change (add another), the own fields have no step placement or order on the forms beyond their list order, an own field is not a filter of the teacher list, and the timetable and the teacher's colleagues do not use them.

Not built: changing a teacher who is already in the school from a file (a row of a known mobile number is skipped, never updated), columns for days off / period limits / class teacher / classes given, a pasted or typed table (the students' bulk upload has both), the login list as an Excel file (it is a CSV), emailing or texting the logins.

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
