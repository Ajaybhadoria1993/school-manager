# Students

How students are admitted and kept, how parents (guardians) are linked to them, and how the module is meant to grow (parent login,
promotion, transfer). Written for developers working on this codebase. The screens are described in
[`FrontEnd-React/README.md`](../FrontEnd-React/README.md#manage-school-students).

## What a school sees

1. **Manage school > Students** (`/school/students`): this academic year's students as a table or as cards (List / Grid), searched by
   name or admission number, filtered by class (a dropdown with arrows to the class before and after) and section, and paged
   (numbered pages, rows per page) by the server, in class order (the screen offers no sort; the API below still accepts one). Tiles count the students, the classes that have students, the seats left and the
   full sections.
2. **Add student** (`/school/students/new`): filled in **steps**, like the school's onboarding (a row of numbered circles with a tick on
   each step done; on a phone "Step 2 of 4" and a bar): **1 Academic** (the class and section of the current year, each section chip
   saying how many seats are left, the roll number, the admission date when the school asks it, and the previous school), **2 Personal
   info** (the child, the address, the IDs: Aadhaar, Samagra, APAAR, PEN, SR number), **3 Parents** (starting with the mobile number) and,
   only when the school asks for any of it, **4 More details** (nationality, emergency number, disability, medical notes, RTE / BPL, fee
   concession, transport, and the school's own fields). The form is on the left of every step; a live preview, how much is filled in
   and tips are on the right; a bar pinned to the bottom has **Clear all**, **Back** and **Next step**, and **Admit student** on the last
   step. **Next step** checks only the boxes of its own step (the same words as the server) and stays with the messages when one is
   wrong; Enter in a box does the same, so nothing is admitted before the last step. The stepper opens a step already visited; what was
   typed is kept when moving. A refusal of the server about a box of an earlier step (or a box wrong after all) opens that step with the
   message under the box (`utils/admitSteps.ts`: which box belongs to which step). The Edit page of a student is still one page. Which of these the form asks for, and which are needed, is the
   school's choice (its fields, on **Manage fields** (`/school/students/fields`), reached from the form's header: the form step by step
   and the Excel's columns, two lists with one Mandatory; the Students header always has **Export**, which has the Excel's columns and a
   link to Manage fields, so a school with no student yet can set them there too (its file button is dimmed until there is a student);
   see [The school's own fields](#the-schools-own-fields)). *Student Name* is one Excel column and the two boxes *First name + Last name*
   on the form. The details every school keeps (name, gender, date of birth, age, category, class and section, both parents, the address
   and the previous school) are always on in both, and cannot be switched off; the address is always needed, and the previous school
   is needed for Class 1 to 12 and may be empty in the pre-school. A child has **one father and one mother**: a second Father or Mother is refused (the form greys
   the relation out and names the second one; the server answers `guardians.N.relation`); any number of Guardians and Others, up to
   four people. The admission number is made by the server.
3. **A student's page** (`/school/students/:id`): everything above, the other children of the same parents (brothers and sisters), the
   class in every year, and **Edit** (the same form laid out like the admission page, with the student as saved beside it and one **Save changes** in the pinned bar). **Admit a sibling** opens the admission form with the
   parents and the address already there.
4. **Bulk upload** (`/school/students/import`) and **Export** (`/school/students/export`, from the list's Export button with its
   filters): the students a school already has, from a spreadsheet, each into the class and section written in it; and the school's
   fields and Excel on one page (each field On / Off, Mandatory / Optional, its place and heading), with the file seen first in a
   preview. See [The school's own fields](#the-schools-own-fields) and [Bulk upload and export](#bulk-upload-and-export).

Who: the school admin and the principal admit and change students; the accountant may read them through the API. Teachers get read
access when teacher allocation exists (they will see only their own sections). The roles are one list each,
`STUDENT_WRITERS` and `STUDENT_READERS` in `backend/src/main/students/constants.ts`: a front-desk "reception" role is added there,
in one line, when Staff exists.

A school with **no current academic year** (approved before academic years existed and not set up yet) cannot admit: the API answers
`409 NO_ACTIVE_YEAR` and the screens send the person to the dashboard's *Set up your current academic year* card.

## Data model (MongoDB, Mongoose)

Three models, never one large document. All are school-owned (`tenantScope`), so every query names the school.

```
Student  (the person, year-free)  --guardians[] (guardianId, relation, isPrimary)-->  Guardian (a parent, year-free)
   |
   +-- Enrolment (one per academic year: academicYearId, classId, sectionId | null, rollNumber)
AdmissionCounter (one per school and academic year: the running number behind admission numbers)
```

### `Student` (`backend/src/main/students/models/Student.ts`), year-free

| Field | Meaning |
| :-- | :-- |
| `firstName`, `lastName`, `nameKey` | 2 to 50 characters each, trimmed, inner spaces collapsed, no `<` `>`; `nameKey` = "asha verma" (search, duplicate check) |
| `gender` | Male, Female, Other |
| `dateOfBirth`, `admissionDate` | calendar days stored as midnight UTC (like the academic year's days); neither in the future (today in India); age 2 to 25 **on the admission date** (not today): the message says how old the student was on which day, so the person knows which date to fix: "The student was 1 year old on the admission date (03-04-2022); a student must be 2 to 25 years old then. Fix the date of birth or the admission date" ("less than a year old" under 1; an empty admission date is today) |
| `admissionNumber` | made by the server, unique in the school, immutable: `ADM-<first year of the active academic year>-<4 digits>`, e.g. `ADM-2026-0001` |
| `address` | `line1`, `line2` (area or landmark), `city`, `state` (from `INDIAN_STATES`), `pincode` (6 digits); each part null when not given (whether it is needed is the school's choice) |
| `bloodGroup`, `category` | A+ ... O-; General, OBC, SC, ST, EWS, Prefer not to say |
| `previousSchool` | `{ name, lastClass, tcNumber, tcDate }`; once anything is filled the name is required |
| `aadhaarNumber` | 12 digits with Verhoeff's check digit (spaces and dashes typed between are dropped; the message says what is wrong: "The Aadhaar number has 12 digits", "An Aadhaar number does not start with 0 or 1", or "This Aadhaar number is not valid: its last digit (the check digit) does not match the other digits", the last for 12 digits that start right but whose last digit does not fit, like the random numbers of a dummy file), **stored as it is** (the school chose to see it whole); unique in the school (`AADHAAR_TAKEN` names whose it is) |
| `samagraId`, `apaarId`, `pen`, `srNumber` | 8 or 9 digits; 12 digits; 11 digits (UDISE+); text up to 30 |
| `religion`, `disability` | from `RELIGIONS` and `DISABILITIES` ("None" first) |
| `nationality`, `emergencyMobile`, `medicalNotes` | text up to 40; 10 digits starting 6 to 9; text up to 300 |
| `rteSeat`, `bpl` | booleans, false unless ticked |
| `feeConcession`, `transportRoute`, `transportStop` | the school's own words (no fee or transport module yet): up to 80, 60, 60 |
| `custom` | the answers to the school's own fields, by their `c_` key (Mixed): text, a number, a day ("2026-04-01"), yes / no, a choice. Checked against the school's fields before it is written; a field the school deletes leaves its answer here, unread |
| `guardians` | 1 to 4 links `{ guardianId, relation, isPrimary }`, exactly one primary, at most one *Father* and one *Mother* (any number of *Guardian* / *Other*). Relation and "primary" belong to the link: one person is *Father* of two children and may be the primary contact of one of them only |
| `status` | `active` (a "left" status comes with transfer certificates) |

Indexes: `one_admission_number_per_school` `{ tenantId, admissionNumber }` unique; `{ tenantId, nameKey, dateOfBirth }`;
`one_student_per_aadhaar_number` `{ tenantId, aadhaarNumber }` unique where it is a string; `{ tenantId, "guardians.guardianId" }`
(a parent's children).

Listed in `YEAR_FREE_MODELS` (`tenants/__tests__/modelRegistry.test.ts`): the person is the same every session.

### `StudentSettings` (`models/StudentSettings.ts`), year-free

One per school (`one_student_settings_per_school`): `fields` (`[{ key, mode }]`, a detail not listed is as the defaults say),
`customFields` (`[{ key, label, type, options, mode }]`, the school's own fields), `exportColumns` (`[{ key, heading }]` in order, a
key of the list or a `c_` key of the school's own, or null for the default layout), `updatedBy`. Made on the first save; a school
without one gets the defaults (`services/settings.service.ts`). Listed in `YEAR_FREE_MODELS`.

### `Guardian` (`models/Guardian.ts`), year-free

`name`, `mobile` (10 digits, no +91, null only for a second guardian whose number is not known), `mobileVerifiedAt` (always null for
now), `alternateMobile`, `email`, `occupation`. **One guardian per mobile number in a school**: the partial unique index
`one_guardian_per_mobile` `{ tenantId, mobile }` (where `mobile` is a string). The same number can be a parent at two schools
(two records, one per school). No User account is made for a guardian yet.

Listed in `YEAR_FREE_MODELS`: a parent is the same person every session.

### `Enrolment` (`models/Enrolment.ts`), per year

`studentId`, `academicYearId` (required, immutable), `classId`, `sectionId` (null for a class with no sections that year),
`rollNumber` (1 to 999, optional), `status` (`active`), `enrolledAt`. Its section is always a section of the same class **and the same
year** (checked when it is written). Indexes:

- `one_enrolment_per_student_and_year` `{ tenantId, studentId, academicYearId }` unique;
- `one_roll_number_per_section_and_year` `{ tenantId, academicYearId, classId, sectionId, rollNumber }` unique where `rollNumber` is a
  number (per section; per class for a class without sections);
- `{ tenantId, academicYearId, sectionId, status }` (the year's list, seats per section), `{ tenantId, classId, academicYearId }`
  (the class delete guard).

A record never moves between years: promotion (later) creates the next year's enrolment and leaves this one as it is.

### `AdmissionCounter` (`models/AdmissionCounter.ts`), per year

`{ tenantId, academicYearId, seq }`, unique per school and year. The next admission number is one `findOneAndUpdate` with `$inc`
(an upsert for the first admission of a year), so five admissions at the same moment get five different, consecutive numbers. A
number handed out to an admission that then failed is not reused: a gap is harmless, a reused number is not. If a number is somehow
taken already (a counter restored from an old backup), the admission takes the next one (up to five tries).

### Migration

None needed: the collections are new, and their indexes are built when the backend starts (Mongoose `autoIndex`, as for every
other model; the tests build them in `src/test/setup.ts`). The records added to `Student` later (Aadhaar and the rest) read as null /
false on older students, and a school without `StudentSettings` gets the defaults. In production, where `autoIndex` may be off, run
`Model.syncIndexes()` for `Student`, `Guardian`, `Enrolment`, `AdmissionCounter` and `StudentSettings` once.

## One admission, without transactions

The local MongoDB (`docker-compose.yml`) is a standalone server, which cannot run multi-document transactions. `POST /students` makes
the student, links or makes the guardians and makes the enrolment in one request, safely, like this
(`services/admission.service.ts`):

1. **Everything that can be refused is checked first**, before anything is written: the active year (`NO_ACTIVE_YEAR`), the class and
   section (`CLASS_NOT_FOUND`, `SECTION_NOT_FOUND`, `SECTION_REQUIRED`), a free seat (`SECTION_FULL`), the roll number
   (`ROLL_NUMBER_TAKEN`), the guardians picked by id (`GUARDIAN_NOT_FOUND`, `GUARDIAN_MOBILE_MISMATCH`), the possible duplicate
   (`DUPLICATE_STUDENT`) and a new guardian whose number the school already has (`GUARDIAN_EXISTS`). A refusal leaves nothing behind.
2. **The writes only add**, in this order: the admission number (the counter), new guardians (an upsert by mobile number with
   `$setOnInsert` only: if another request saved that number a moment ago, nothing is overwritten and the admission stops with
   `GUARDIAN_EXISTS`), the student, the enrolment.
3. **If a write fails, what this request made is taken away again**: the enrolment, the student, and each new guardian that no other
   student points to. So a student is never left without an enrolment and a family is never half made.
4. **The unique indexes are the last word** when two requests meet (admission number, one guardian per mobile, one enrolment per
   student and year, a roll number once per section); a duplicate-key error is turned into the person's message.
5. The details of a guardian the school already had are changed **only at the very end** and only when the person chose
   **Update details** for them (`updateDetails: true`); otherwise a linked guardian is kept exactly as saved.

**Seats, when two admissions meet.** Before writing, a section with a seat limit that is full is refused unless the person said
"admit anyway" (`allowOverCapacity: true`). After writing, the new enrolment's rank in its section (by id, the order they were made) is
checked: the one that came after the last seat undoes its admission and answers `SECTION_FULL`. A test admits three children into the
last seat at once: exactly one gets it and the others leave nothing behind. (The rank is read after each write, so an enrolment made
earlier but written later than another one was counted could, in a very narrow window, still go one over; a per-section seat counter
updated with a conditional `$inc` would close it, at the price of a counter to keep in step with every move. Not done.)
A move into a full section (`PATCH /students/:id/enrolment`) recounts after writing and puts the old place back if it went over.

If production runs on a replica set (MongoDB Atlas does), the same steps can later be wrapped in a transaction; the checks and indexes
stay useful either way.

## The same child twice (edge case S-2.7)

An admission with the same first and last name (any case and spacing), the same date of birth and the same primary guardian's mobile
number as a student the school has is answered `409 DUPLICATE_STUDENT`, with that student (`details[0].student`: id, name,
admission number, birthday, class and section). The screen shows them with a link and asks; `confirmNotDuplicate: true` admits anyway
(twins, two children of one family with one name). Merging two records that were both admitted is not built.

## Guardians, siblings, and the parent login

- **Lookup by mobile.** The admission form shows every box of a guardian from the start (Full name, Relation, Mobile number, Another
  number, Occupation, Email, in that order) and asks the server once, when exactly 10 valid digits are typed in the mobile box: `POST /students/guardians/lookup { mobile }`. A POST, so a mobile number never appears in an address (or in a
  log of addresses). It answers the school's guardian with that number and their children here, or `{ guardian: null }`. Only the
  caller's school is searched.
- **Linked, never copied.** A found guardian is sent as `{ guardianId, relation, isPrimary, updateDetails }`; the same parent is then
  linked to the new child. This is how the second child of a family is admitted, and how one parent will later see two or three
  children. A new guardian whose number the school already has is never created as a copy and never overwrites the saved one:
  the server answers `GUARDIAN_EXISTS` with the guardian, and the screen shows them with *Use as is* / *Update details*.
- **A guardian's own details** are changed with `PATCH /students/guardians/:id` (for every child of theirs). A new mobile number must be
  free in the school (`GUARDIAN_MOBILE_TAKEN`) and resets `mobileVerifiedAt` to null.
- **Parent login (built 2026-11-04, the user: "like the teacher's username and password").** The school gives a **guardian** a username
  and a password, as it does a teacher; the parent signs in at `/login` (the same box: email or username) on the website now and in the
  mobile app later. It is the guardian's (`Guardian.userId` -> a User with the role `parent`, no email, named and numbered like the
  guardian: a change of the guardian's name or mobile follows to it), so **one login shows all of that parent's children**, and a brother's
  or sister's admission that links the same guardian joins it by itself (the lookup answer carries `login`, and Add student says "Ravi
  Verma already signs in as ravi.verma_12"). The username is checked free on the whole platform (the teachers' check,
  `GET /staff/usernames/check`, and `USERNAME_TAKEN` with free ones); only a hash of the password is kept, so it is shown once, to hand
  over (Copy login details), and a lost one is replaced (the old one and its sessions stop at once).
  * Where the school does it: **Add student** has *Parent login* under the parents (off until ticked: a username from the primary
    parent's name and a password already made); the login is made right after the admission and the student's page shows it once (if the
    login is refused after the student is in, the page says why and it is made from the parent's card). On **a student's page** each
    parent's card has a *Login* line: the username with *Username* (change it) and *New password*, or *Make a login*.
  * API (school admin, principal): `POST /students/guardians/:id/login { username, password }` (409 `GUARDIAN_HAS_LOGIN`),
    `PATCH /students/guardians/:id/login { username }`, `POST /students/guardians/:id/reset-password { password }` (409
    `GUARDIAN_HAS_NO_LOGIN`); answers `{ guardianId, login: { username, isActive } }`. Each guardian on a student's page and in the lookup
    carries `login` (null when none). `ParentLoginService` (students module) on top of the teachers' `TeacherLogin`.
  * **What a parent sees** (`/api/v1/parent`, parents only, `main/parents/`): `GET /children` (their active children with the class and
    roll: `{ parent: { name, school }, items }`), `GET /children/:id` (the child's record: who they are, the class, roll and **class
    teacher**, the parents, the address, the previous school and the records; not the school's bookkeeping: moves, own fields, logins) and
    `GET /children/:id/timetable` (the class's week **once published**, else null: days and times, subjects, teachers' names and rooms;
    not the other classes' or the teachers' loads). Another family's child, or another school's, is 404. Screens: the parent's home (the
    Dashboard: *Your children*) and `/my-children/:id` (Class, About, Parents, Address, More details, Timetable). Their menu is Dashboard
    only; the school's pages stay closed to them (the API refuses them too).
  * **The login follows the children** (2026-11-04, the user): it is open while at least one child of the parent is an active student;
    making the last one inactive (Make inactive, Transfer, a promotion that lets them go: all go through
    `StudentStatusService.deactivate`) closes it at once, sessions too ("Your account has been disabled"); a child made active again
    opens it (`ParentLoginService.followChildren`). A login made for a parent whose children have all left is made closed. A teacher's
    login does the same with the teacher (Has left closes it, Bring back opens it; staff module).
  * **Only the school sets the password** (the user): there is no "change my password" for a teacher or a parent, and the forgot-password
    email makes no link for them (`SCHOOL_SET_PASSWORD` in `password.service.ts`; a reset link made earlier is refused too). The school
    gives a new one from the teacher's or the student's page. No OTP (the user: not wanted now).
  * **A username offered is never somebody's** (any school): the one the screen makes from the name (`name.surname_NN`) is checked, and
    when it is taken the first free one the server offers takes its place at once (`useFreeUsername`, in Add teacher, Add student's Parent
    login and every Make a login window); one the person types is left as typed and said to be taken, with free ones to click.
  * Not built: attendance, fees and marks for parents (no such modules yet).

## The school's own fields

Schools keep different registers, so each school decides about the details of its admission form (`STUDENT_FORM_FIELDS` in
`backend/src/main/students/constants.ts`, mirrored in `FrontEnd-React/src/constants/studentFields.ts`): **required** (an admission is
refused without it), **optional** (asked, may be empty) or **hidden** (not asked). A yes / no detail (RTE seat, BPL) is a tick: optional
or hidden, never required.

- **Always needed**, whatever the school says (the software depends on them): the first and last name, gender, date of birth, the class
  (and the section when the class has sections), and the primary parent's name and mobile number.
- **The details every school keeps** (the user's own fixed list, in the Excel and on Add student alike): Student Name, Gender, Date of
  Birth, Age, Category, Class, Section, the father's and mother's names and mobile numbers, the address (house and street, city, state,
  PIN code) and the previous school. In code: `locked: true` on those 16 `EXPORT_COLUMNS` (the switch is on and cannot be turned off,
  title *Always in the Excel*; `withFixedColumns` puts back a locked column a saved layout lacks), `FIXED_RULES` (the four address
  parts and the previous school's name are always `required`: `PUT /settings` answers *This detail is always needed*),
  `ALWAYS_ASKED_RULES` (category is never hidden: *This detail is always asked: choose needed or optional*) and `normaliseRules`, which
  applies both to older stored settings when they are read. The father's and mother's *numbers* are the school's choice of needed or
  optional, as before.
- **The previous school follows the class** (`classNumber(name)` in `backend/src/main/students/classNumber.ts`, mirrored in
  `FrontEnd-React/src/utils/classNumber.ts`: "Class 5", "5th", "Std V", "Grade 12" are 5 and 12; Nursery, LKG, UKG, "Class 13" are not
  numbered). A child of Class 1 to 12 must have a previous school; a child of a class that is not numbered (the pre-school: Nursery,
  LKG, UKG) may leave it empty, and the last class and the TC number are asked only with it (`PREVIOUS_SCHOOL_RULES` relaxed to
  optional by `needsForClass` on the server and `effectiveRules` on the screen; `useStudentForm` takes `classNameOf`). The server
  resolves the class of the request before it validates (`validateForSchool(schemaFor, "body" | "student")`, with
  `services/classNames.ts`), so the form and the API agree, on admission and on edit.
- **Two lists, one Mandatory** (Manage fields). What Add student asks (the settings `fields`, `customFields`, `placements`) and the
  Excel's columns (`exportColumns`) are arranged **on their own**: a detail can be asked without being a column, or a column without
  being asked. Mandatory (`required`) is the one setting both share: a mandatory detail is asked **and** its columns are in every
  export (`RULE_OF_COLUMN` / `mandatoryColumnKeys` in `backend/src/main/students/constants.ts`; `GET /settings` puts the columns
  back when the saved layout lacks them, `withMandatoryColumns`; `PUT` refuses an Excel without one: *Aadhaar No. is mandatory, so it
  is in every export: make it optional first*). Making a detail optional keeps its column. The screens do the same (`setRequired`,
  `switchRow` refuses to take out a mandatory column in `utils/exportLayout.ts`). Each export column is tied to its setting in `FrontEnd-React/src/utils/exportLayout.ts` (`needOf`: the address column to
  `addressLine1`, the previous school to `previousSchoolName`...; both occupations share `guardianOccupation`; Mandatory on Mother's
  Name is `secondParent`, both parents needed). Columns with no setting say what they always are: *Always* (name, gender, birthday,
  class, section, the father as the usual primary contact), *Auto* (admission number, age), *Optional* (roll number, a second number,
  a guardian, the email). Older settings that were saved as "asked but not exported" (or the reverse) are now simply what they say.
- **A new school's defaults** (`default` on each field) are the user's own list, the default export layout: category, both parents
  (father and mother; a name is enough for the one without a number), the parent's occupation, every part of the address, Aadhaar, and
  the previous school's name, last class and TC number are required; blood group and TC date optional; everything else is off
  (admission date, Samagra, APAAR, PEN, SR number, religion and the other more details) until the school turns it on. Keys have no
  dots: `express-mongo-sanitize` drops body keys that contain one.
- **Where it is enforced.** The form (`checkStudentForm` with the school's `rules`) and the server: `validateForSchool` (in
  `controllers/students.controller.ts`) reads the school's rules and validates `POST /`, `PATCH /:id` and `PATCH /guardians/:id` with
  the schema built for them (`admitSchemaFor`, `updateSchemaFor`, `updateGuardianSchemaFor`, memoised per set of rules). The usual
  messages and the school's come in one answer (`withSchoolNeeds`: a refinement would not run once a box is refused), one per box.
- **Editing** refuses only emptying a required detail that was saved; a detail never filled (a student admitted before the rule, or
  from an old register) is not forced on every later save.
- **The bulk upload is flexible: it accepts what an old register has** (the user's rule, 2026-10-24). Add student is the strict one;
  an upload needs only the five basics (first and last name, gender, date of birth, class and its section) and a parent's name and mobile
  number (a student is placed by class, and a parent is linked by mobile). The address, the previous school, the category, the IDs...
  are optional there: every row is held to `LENIENT_FIELD_RULES` on the screen (`prepareRow`) and the server asks only what the
  schema asks (`ImportService.one`); what the school's own form needs and the row lacks is said by the server as a warning (*Not in the
  file, but your school needs it: House and street, Previous school.*, class-aware: Nursery is not asked for a previous school) and
  left out of the screen. A detail that **is** given is still checked (a PIN code of 5 digits is a problem in its box).
- **The school's own fields** (a house, a bus pass number...: *Add your own field* on Manage fields or on the last step of Add student). Each has a name (2 to 40
  characters, not one of the list's names, once), a kind (`CUSTOM_FIELD_TYPES`: text up to 200, a number, a day 1900 to 2100, yes /
  no, a list of 1 to 30 choices) fixed once added (the answers kept would not fit another kind; the server refuses a change), and
  needed / optional / not asked like the others (a yes / no is never needed). Up to 20. Keys are `c_` and letters and digits, made by
  the screen. They are asked on Add student and Edit (the card *Your school's own details*), shown on the student's page, checked by
  the server with the form's words (`customIssues`: "Choose the House", "Choose the House from the list", "Enter a number for
  Height (cm)", "This is not one of your school's fields"), and are columns of the export and its preview (a day as DD-MM-YYYY, a tick
  as Yes / No). Deleting one takes it out of the form and the saved layout. The bulk upload does not take them yet: a needed one is
  said as lacking on every row.
- **Where each detail goes** (the steps of Add student). Add student asks in the steps Personal info, Academic and Parents, then
  **More details** and any **step the school adds itself** (*Add a step*: a name of 2 to 30 letters, not one of the four names and
  not twice, up to 4 of its own; `StudentSettings.steps` is the ordered list `[{ key, name }]` of the steps after Parents, the keys are
  `more` and `s_` and letters and digits; `null` means More details alone; the steps can be put in another order, renamed or deleted,
  and a deleted step's details go back to More details). Each school decides the step of every detail it may move: `MOVABLE_FIELDS`
  (blood group, religion, Aadhaar, Samagra, APAAR, PEN, SR number, nationality, emergency number, disability, medical notes, fee
  concession, transport route and stop, RTE seat, BPL) and its own fields. What no school can move stays in its own step (the name,
  gender, birthday, category, class, parents, address, previous school, the admission date). `StudentSettings.placements` is the
  ordered list `[{ key, step }]` (the order is the order inside a step; `step` is one of the four names' keys or one of the school's
  own); `null` means the usual places (`effectivePlacements` fills in what is missing: a detail not listed goes to the end of its usual
  step, an own field to the end of More details; a key that no longer exists is dropped; a detail in a step the school no longer has
  goes to More details). `PUT` keeps nothing when the places sent are the usual ones. A deleted own field leaves its place.
  **The usual places are chosen so the four steps of Manage fields are about as tall as each other for a new school** (measured in
  the browser, 2026-10-31, in pixels: 762 / 742 / 733 / 727): only two movable details are asked by default, so the blood group is in
  Personal info and the Aadhaar number (required) in Academic with the SR number and the PEN; the emergency number, the RTE seat and
  BPL are in Parents; the religion, the Samagra and APAAR IDs, nationality, disability, medical notes, fee concession and the bus are
  in More details (1 / 3 / 3 / 9 movable details). A step is shown on Add student, in the stepper and in the preview, **only while
  something the school asks is placed in it** (More details and a step of the school's own too; the three first always are).
  Manage fields' **Add student form** card has the steps as the form has them (a row for every box, the ones the software always
  asks with a lock, the others with Asked and Mandatory; drag a movable row with its grip, or use its **Move** list, the app's own
  dropdown that names only the other steps), the buttons **Preview**, **Add a step** and **Add your own field** at the top, and an own
  field is a row like the others with its own pencil. **Preview** opens a window with Add student as it is drawn, with what is on the
  page now (not saved yet too): the same components as the page (`AdmitStepBody`), the stepper, the school's classes, the side
  column; the boxes are for looking at only. Add student draws each step's placed details in one card (`PlacedFields`): the boxes in
  the order given, the ticks last; the card of a step the school added is named after it. Edit student keeps its own cards (every
  detail the school asks, in the same boxes: `FieldBox`). **Add your own field** on the last steps of Add student sends only the
  field, its Excel column and its place (`useFieldsEditor.addField`). Settings are per school (`tenantScope`, one document each):
  another school's fields, places and steps are never read or changed, and a school cannot place a field it does not have.
- **Off** only stops asking and exporting: what was saved stays saved. A previous school's name that is off hides the whole Previous
  school card (a TC without the school means nothing); an admission date that is off is today (the edit form still shows it).
- The order of the form's boxes is fixed; the order a school chooses is the export's (below).

## API (all under `/api/v1/students`; the school is always the signed-in user's)

| Method and path | What it does | Who |
| :-- | :-- | :-- |
| `GET /` | this year's students: `q` (part of a name or an admission number), `departmentId` (an id or `none`: the students of the classes in that department), `classId`, `sectionId` (an id or `none`), `sort` (`class`, `name`, `admissionNumber`, `admissionDate`), `dir`, `page`, `limit` (1 to 50, default 12). One aggregation over the year's enrolments. Answers `{ academicYear, items, page, limit, total, totalPages }`; a row has the student, `place` (class, section, roll number) and `primaryGuardian` | readers |
| `GET /capacity` | `{ academicYear, sections: [{ sectionId, classId, capacity, enrolled, seatsLeft, nextRollNumber }], classes: [{ classId, enrolled, nextRollNumber }], totals: { students, seats, seatsLeft, fullSections } }`. `nextRollNumber` is the one after the highest roll number given in the section (or, in `classes`, to the students of a class without sections), 1 when none is given yet, null past 999; the same aggregation, no extra query | readers |
| `GET /class-overview` | the classes at a glance (School Class): `departmentId` (an id or `none`), `classId`, `q` (part of a class name); the server filters. `{ academicYear, departments, summary: { classes, sections, students, seats, seatsLeft, fullSections }, classes: [{ id, name, departmentId, departmentName, students, seats, seatsLeft, percent, sections: [{ id, name, room, capacity, enrolled, seatsLeft, state, percent }] }] }`; `departments` is every department (for the dropdown), `summary` is of the classes returned; inactive students are not counted; a class's `seats` = its sections' seats added up, or its own seats when it has no sections (or none with a limit) | readers |
| `GET /:id` | the student with `guardians`, `place`, `enrolments` (every year, newest first) and `siblings` | readers |
| `POST /` | the admission (above). `admissionDate` defaults to today; `allowOverCapacity`, `confirmNotDuplicate` are the person's answers | writers |
| `PATCH /:id` | the student's own details, only what is sent (null clears an optional one); the age rule is checked on the result; the admission number never changes | writers |
| `PATCH /:id/enrolment` | `{ classId?, sectionId?, rollNumber?, allowOverCapacity?, reason? }`: another class or section of the **current** year, or only the roll number, with the same rules. A changed class or section drops the old roll number unless a new one is sent | writers |
| `POST /guardians/lookup` | `{ mobile }`: the school's guardian with that number and their children, or null | writers |
| `PATCH /guardians/:id` | a guardian's `name`, `mobile`, `alternateMobile`, `email`, `occupation` | writers |
| `GET /settings` | `{ fields: { key: mode }, customFields: [{ key, label, type, options, mode }], exportColumns: [{ key, heading }], exportIsDefault, placements: [{ key, step }], placementsAreDefault, steps: [{ key, name }], stepsAreDefault, updatedAt }`, the defaults filled in (`placements` lists every movable detail and every own field; `steps` are the steps after Parents) | readers |
| `PUT /settings` | `{ fields?: { key: mode }, customFields?: [...] (the whole list), exportColumns?: [{ key, heading }] \| null, placements?: [{ key, step }] \| null, steps?: [{ key, name }] \| null }`: only what is sent changes; `exportColumns: null` is the default layout again, `placements: null` the usual places, `steps: null` More details alone. Each entry is checked on its own ("This detail cannot be changed", "A yes / no detail is a tick: it cannot be needed", "There is already a field called Religion: switch it on in the list", "A field keeps its kind: add a new field for another kind", "This column is already in the export", "Two columns cannot have the same heading", "Student Name and Class are in every export", "This detail cannot be moved", "This detail is placed once", "Choose Personal info, Academic, Parents, More details or a step of your own", "A school can have up to 4 steps of its own", "There is already a step called Parents", "The name of a step is 2 to 30 characters", "This step is listed once", "Your school has no such field of its own", "Your school has no such step"...) | writers |
| `GET /export/preview` | the first 5 students of the export (`q`, `classId`, `sectionId`) with **every** column's value by key, and `total`: the Export screen draws any layout from one read | readers |
| `GET /export` | this year's students (`q`, `classId`, `sectionId` as in the list; every page) as an `.xlsx` file, in the school's saved layout | readers |
| `GET /import/template` | the sample file `.xlsx`, made with the school's own classes and sections | writers |
| `POST /import/read` | `multipart/form-data`, one `file` (`.xlsx` or `.csv`, up to 5 MB, up to 1000 rows): `{ fileName, sheetName, headerRow, headers, rows: [{ row, cells }] }`. Nothing is kept | writers |
| `POST /import/match` | `{ rows: [{ row, firstName, lastName, dateOfBirth, mobile?, admissionNumber?, aadhaarNumber? }] }`, 1 to 1000 rows: which rows of a file are students the school already has, in ONE request, before anything is uploaded. `{ matches: [{ row, kind, student: { id, name, admissionNumber, dateOfBirth, className, sectionName, inactive } }] }`, only the rows that meet somebody; nothing is written. `kind`: `same` (the same child), `maybe` (same name and birthday, another parent's mobile), `number` / `aadhaar` (the admission number, or the Aadhaar number, of ANOTHER child). 400 for a bad day or more than 1000 rows | writers |
| `POST /import` | `{ dryRun, allowOverCapacity, rows: [{ row, admissionNumber?, student }] }`, 1 to 100 rows: `{ dryRun, results: [{ row, ok, errors, warnings, student? }], ok, failed }` | writers |
| `POST /deactivate` | `{ ids, reason? }` (1 to 200; the reason up to 200 letters): makes active students inactive. `{ deactivated, skipped }` | writers |
| `GET /inactive` | the inactive students: `q`, `page`, `limit` (1 to 50, default 20); newest first. A row has the student, the class and section they were in, the roll number they had, the primary parent, `reason`, `inactiveAt` and `inactiveBy: { name, role }` | writers |
| `POST /reactivate` | `{ ids, placement?: { classId, sectionId? } }`: active again, in their class and section. A student with no place in the running year (they left in an earlier year) needs the `placement`; without it they are left as they are and counted in `needsPlacement`. `{ reactivated, skipped, rollNumbersLost, needsPlacement? }` | writers |
| `POST /:id/transfer-out` | `{ schoolName, tcNumber?, tcDate?, remarks? }`: the student leaves for another school: inactive (reason "Transferred to ...") with the certificate kept on them and in their moves. The only thing needed is the school's name; `tcDate` is a real day, not in the future | writers |
| `GET /promotions` | `?toAcademicYearId=`: the open promotion list for the year that waits, or null | writers |
| `POST /promotions` | `{ toAcademicYearId }`: makes the draft list with a suggestion for every student of the running year | writers |
| `PATCH /promotions/:id` | `{ entries: [{ studentId, outcome: promote|retain|leave, classId?, sectionId? }] }`: changes a draft | writers |
| `POST /promotions/:id/submit` | `/cancel` | send the draft for approval; drop the list (an approved one takes its places back while the next year is not on) | writers |
| `POST /promotions/:id/approve` | `/reject` | `{ allowOverCapacity? }` approves (makes the next-year enrolments); `{ note? }` sends it back to the draft | **approvers** (school admin) |

Readers: school admin, principal, accountant. Writers: school admin, principal. Approvers: school admin (`STUDENT_APPROVERS`).

Errors use the API's usual shape: `{ success: false, message, code, details: [{ path, message }] }`, `path` naming the box
(`firstName`, `address.pincode`, `guardians.0.mobile`, `sectionId`). The answers that need a decision carry what the screen shows:
`SECTION_FULL` (`details[0].capacity`, `enrolled`), `DUPLICATE_STUDENT` (`details[0].student`), `GUARDIAN_EXISTS`
(`details[0].guardian`). A record of another school is `404` (or `400 ..._NOT_FOUND` for an id inside a body), never "it is another
school's". **404 before 400**: for `PATCH /:id`, `/:id/enrolment` and `/guardians/:id` the record is looked up before the body is
validated, so a wrong body tells another school nothing.

Every message a person can see is written once in `schemas/students.schemas.ts`; the screens repeat the same words
(`FrontEnd-React/src/constants/students.ts`) to say what is wrong before anything is sent. The server checks everything anyway.

## Active and inactive students

**Students are never deleted.** A student who leaves the school (or was admitted by mistake, or came from a wrong upload) is made
**inactive**: `Student.status = "inactive"`, `Student.inactive = { at, by: { userId, name, role }, reason, rollNumber }`, and their enrolments
`inactive` too. Every existing read already asks for active enrolments or students, so they leave the list, the seat counts, the export,
the siblings and the guardian lookup; `PATCH /:id` and `PATCH /:id/enrolment` answer 404, but `GET /:id` still reads them (with
`status: "inactive"` and `inactive`), because a school needs the details of a child who left, and of one who comes back.

**Make active** (`POST /reactivate`) puts them back in their class and section with one click. The roll number is freed while they are
away (kept in `inactive.rollNumber`) so another child can take it; it comes back only when nobody took it meanwhile (`rollNumbersLost`).
The admission number and the Aadhaar number stay with the student, so a new student cannot reuse them: the message says the holder is
inactive. Admitting the same child again (same name, birthday and primary parent's mobile) is caught as `DUPLICATE_STUDENT` even when the
other record is inactive (`details[0].student.inactive`), and the screen sends the person to make them active instead.

On the screens: the Students page has two tabs, **Active students** and **Inactive students** (`/school/students/inactive`). In the active
list, tick rows (the List view) and press **Make inactive** (a dialog with an optional reason), or use the button on a student's page. The
inactive list shows who made each student inactive, when and why, and has **Make active** for one or the ticked ones. An inactive student's
page shows a banner and **Make active**; Edit, Admit a sibling and Make inactive are hidden.

`StudentStatusLog` (`models/StudentStatusLog.ts`, year-free, written once and never changed) keeps one line for every change of status:
`deactivated` or `reactivated`, the student's name, admission number, class and section, the reason, `by: { userId, name, role }` as they
were then (a role may change, or be added, later) and the time. No screen reads it yet. `npm run migrate:inactive-students` turns students
that were in the short-lived Recycle bin (`status: "deleted"`) into inactive ones.

## Transfers, moves and the history of a student

The class of a year is one `Enrolment`, changed in place when the student is moved, so every change is also written as an `EnrolmentChange`
(`models/EnrolmentChange.ts`, carries `academicYearId`, never changed): **moved** (another class, section or roll number: from, to, the
names as they were then, who, when, the optional reason) or **transferred_out** (to another school, with the certificate details). A request
that changes nothing writes nothing. `GET /:id` lists them as `moves`, newest first, under the class history. A transfer to another school
is `POST /:id/transfer-out`: the student becomes inactive (`Student.inactive.transfer` keeps the school's name, TC number and day, remarks),
nothing is deleted, and Make active brings them back. `StudentStatusLog` also says who and when.

## Promotion to the next academic year

The next year is made by the school (`POST /academics/academic-years`: its own name and days, starting after the running year ends; the
sections of the running year are copied into it unless said not), and waits as `pending` (one at a time). Students are then promoted with a
**promotion list** (`PromotionBatch`, carries the year that ends and names the year that follows):

1. **Draft** (`POST /promotions`): a suggestion for every active student of the running year: the next class in teaching order, the section
   of the same name (else the first), and **leave** from the last class. Whoever admits changes it (`PATCH`): each student promotes to a
   class, stays in the class, or leaves; every class and section is checked against the next year's.
2. **Submitted** (`/submit`): sent to the school admin; nothing can be changed.
3. **Approved** (`/approve`, school admin only): every student who goes on gets an `Enrolment` in the next year (no roll number yet;
   `promotionBatchId` says which list made it). A section that would have more students than seats stops it unless `allowOverCapacity`. The
   running year is not touched. `/reject` sends it back to the draft with a note; `/cancel` drops it and takes its places back.
4. **Applied**: `POST /academics/academic-years/:id/activate` (school admin) closes the running year and makes the waiting one the school's,
   but only if every student of the running year has a place next year or is leaving; otherwise `409 UNPLACED_STUDENTS` names how many.
   The students who leave become inactive ("Passed out after 2026-2027" from the last class), and the list is marked done. Every record of
   the closed year stays with that year.

A student who left in an earlier year has no place in the running year; **Make active** asks for a class and section (`placement`) and
enrols them there (a new enrolment: the old ones stay).

## Bulk upload and export

A school that starts using EduShiksha already has its students, usually in Excel. The bulk upload brings them in without typing them
one by one, and treats every row exactly like an admission from the form (same schema, same rules, same words).

**Who does what.** The **screen** reads nothing itself: the server reads the file (`services/sheetReader.ts`, exceljs for `.xlsx`, its own
parser for `.csv`) and sends back the column titles and the rows as text. The **screen** shows them as an editable table, matches the
columns (`FrontEnd-React/src/utils/studentImport.ts`), cleans the values the way a person reads them and builds one admission body per
row; it checks each row with the admission form's own `checkStudentForm`. The **server** checks every row again and admits it
(`services/import.service.ts`, `AdmissionService.admitOne`). Nothing a screen decides is trusted.

**The three steps** (`pages/school/StudentImport.tsx`):

1. *Upload.* The sample file, offered by the **Download sample template** button of this first step (the Students page's header is
   the same four buttons with or without students, so the sample is not repeated there; one hook, `useSampleDownload`; `GET
   /import/template`, `services/spreadsheet.service.ts`): a **Students** sheet whose row 2 holds the column
   titles (green = the five basics every student needs: First Name, Last Name, Gender, Date of Birth, Class; blue = at least one parent
   with a mobile; yellow = everything else, optional, whatever the school made mandatory on Add student; a note on each title), dropdowns for gender, class (this year's classes), state, blood group, category, relation, religion, disability and Yes / No,
   number-like columns stored as text (so a mobile or an Aadhaar keeps its digits); a **Classes** sheet (each class, its sections this year and the seats left) and a **How to fill** sheet. Or the school's own
   sheet: the row of titles is the first of the first 10 rows with at least 3 filled cells, so a school name or a title above it is fine.
   Only the first visible sheet is read. `.xls` (the old format) is refused with "save it as .xlsx".
2. *Preview & fix.* The file opens at once as **just the table** (its own titles and cells; no panels above it), checked as it is
   changed, and everything is fixed in the table itself:
   - each column heading shows, under the file's title, what the column was read as (the shared dropdown, small: green when uploaded,
     grey "Not uploaded"), matched by its title (`IMPORT_FIELDS` and their `synonyms`: "Adm No", "Student Name", "Father Name",
     "Mobile No", "DOB", "Village", "Pin", "Aadhar No", "Samagra ID", "SR No", "CWSN", "RTE"...), first by the headings of the school's
     own export layout, and the school's own fields by their name or export heading (`ownColumnsOf`; an own field's heading stays that
     field even when it is also a usual name, such as Route), so a file it exported comes back as it is. Change it only when a column was read wrong (a detail is in one column only). A whole-name column is split at its last word;
   - a column every student needs that the file lacks (the name, gender, date of birth, class, a parent's name and mobile, and the
     Section when a class of the file has sections) is **added empty at the right** when the file opens (`columnsToAdd`): its red boxes
     say what to type. No other column is added: the address and the previous school are never asked of a file (a column for one of them,
     or for any detail, is added from the **+**, with one value for every row if wanted). When a value that fixes a box is typed, the
     screen offers it for the other rows with the same problem (`SameValueOffer`: *1 more row has "Class 9" in Class. Change it to
     "Class 8" too?*);
   - every cell can be changed in place (list columns suggest their values; a date column says DD-MM-YYYY); the bin leaves a row out;
   - each value of the Class column is matched to a class of the school (`matchClass`: "V", "5th", "5 th", "Std 5", "5th Std",
     "Class-5", "LKG", "KG 1", and with a section, "5-A", "V B", "LKG A"). A value that is no class of the school says so in its box
     (*Your school has no "Class 9": type one of your classes*); a class with sections and no section says so in the **Section** box
     (*Class 6 has sections A, B: type one*), where the section is typed; a section written in the class cell that is not the class's
     ("5-C") says so in that cell (*Class 5 has sections A, B, not "C"*), not as an unknown class. After a box that needed a fix is changed, the other rows with the same value that need
     the same fix are offered the same change at once (*1 more row has "Class 9" in Class. Change it to "Class 8" too?*);
   - the **+ Add a column** at the end of the headings adds a column: a detail of the list or one of the school's own fields, with one
     value for every row if wanted, or a **new field of the school's own** made there (the same dialog as on Export; saved at once with
     `PUT /students/settings`, so Add student and the Excel have it too) whose values are typed in the table and sent with each row;
   - values are read as a person reads them: days first (14-05-2016, 14/5/16, 14 May 2016, an Excel date cell or day number; 5/14/2016
     only when the second number cannot be a month), genders (M / F / Boy / Girl), mobiles (+91, 91 and a leading 0 dropped), states
     (MP, U.P., Orissa, J&K), blood groups (B +ve), religions (Islam), disabilities (nil, NA = None), Yes / No (Y, haan, 1), IDs (spaces
     and a ".0" from Excel dropped). A value the form offers as a list (gender, state, blood group, category, religion, disability) that
     is still not on it is red in its box with what to write, so a row is never shown Ready and then refused by the server. Father, mother and guardian become guardians, each with their occupation column; the first with a
     10-digit mobile is the primary contact and gets the email;
   - only what every student needs stops a row (name, gender, birthday, class and its section, a parent's mobile, a value that is not
     right). What the school's form needs besides (the address, the previous school, Aadhaar, the TC number...) never stops a row and is
     not said here at all: the students are admitted all the same (the server's warning about it is left out of the screen);
   - a problem gives its **box** a red border and the message **under it**, and a short red label in the row's Status ("Father's
     mobile") that takes the person to that box when pressed (or adds its column back if it was set to Not uploaded); the same student,
     admission number, Aadhaar number or roll number twice in the file is found too (the same name and birthday twice with another
     parent's mobile is a note on the later row, "Maybe the same student as row 4"). Tabs show all rows, the ones to fix or the ready ones; **Need a
     fix** keeps the rows it opened with while they are fixed (a fixed row shows Ready there until the tab is opened again). The rows to
     fix can be downloaded as CSV. Seats are counted for the whole file on screen; sections that would go over ask the person
     (`allowOverCapacity`). Nothing is sent while the table is changed (only a new field of the school's own is saved).
   - **students the school already has** are found when the file opens: ONE request (`POST /import/match`, all the rows, only what tells
     one child from another: the name, the birthday, the primary parent's mobile, the admission number, the Aadhaar number). A row whose
     student is already there (`same`) says **Already in your school** with who they are and where (name, admission number, class and
     section; "inactive" with "make them active again" for a student who left), is not uploaded, needs no fix and is counted apart: a tab
     **Already in school** (only when there are some), "N already in your school" on the file bar. A file whose every student is already
     there says so and has nothing to upload. A `maybe` row stays Ready with a note (it may be another child: leave it out with the bin,
     or change it). A `number` / `aadhaar` row needs a fix in that box ("Admission number 2019/47 is already Meera Joshi's"). The answer
     belongs to the row **as asked**: a change to its name, birthday, mobile, number or Aadhaar number takes it back (nothing more is
     asked; the server decides at the upload), a change to anything else keeps it. If the check cannot be made the table works as
     before and says so;
3. *Done.* **Upload** admits the ready rows, 100 a request (`dryRun: false`); the list and the seats are refreshed once
   (`refreshAfterImport`). Admitted rows leave the table. A row the server refuses (a child already admitted, a taken admission
   number, a full section) stays in the table with the server's reason (each result carries the refusal's `code`; a `SECTION_FULL` row
   is ready again once the person says to go over the seats), and **Fix the N rows** goes back to it. The rows already admitted from the
   file are still compared with the rows left ("The same student as row 4"). A failed request stops the run; Upload sends the rest.
   The API's `dryRun: true` (check without saving) is kept for other screens; this one uploads directly.

**Decisions.**

- **The school's own admission numbers are kept** (the "Admission No." column, letters, digits and `/ - . _`, up to 30, upper-cased). A
  row without one gets the next `ADM-<year>-<n>`. A kept number of the form `ADM-2026-0450` moves the counter to at least 450, so a later
  admission never gets a number that is taken. A number already in the school refuses the row (`ADMISSION_NUMBER_TAKEN`).
- **A parent already in the school is linked as saved**, found by mobile number (another child, or a brother earlier in the same file),
  never copied or changed; the row gets a warning ("Prakash Rao (9876500001) is already in your school: linked as saved."). The form asks
  "use as is or update"; a file cannot, so it never changes a saved parent.
- **Nothing is admitted twice**: the duplicate guard (same name, date of birth and primary mobile), the kept admission numbers and the
  one-Aadhaar-one-child rule refuse a row already admitted, so the same file can be uploaded again, and a file that holds some of the
  school's students can be uploaded, after fixing some rows. The screen says so before the upload (`POST /import/match`); the server
  still decides at the upload, and a row it refuses as `DUPLICATE_STUDENT` moves to **Already in school** (not to Need a fix).
- **What "the same student" is** (one rule, on the server, used by the check and the upload): the name (any capitals, any spaces), the
  birthday and the primary parent's mobile are the same; or the school's own admission number, or the Aadhaar number, belongs to a
  student with the same name and birthday (the parent changed the mobile). **The same name alone is never the same student** (two
  students may share a name; twins share the birthday and the parent and differ in the name). The same name and birthday with another
  parent's mobile (or none) is a `maybe`: uploaded unless the person leaves it out. An admission number or an Aadhaar number of
  another child is a problem of that row. An inactive student is found too. A saved student is never changed by a file. A name spelled
  differently ("Asha" and "Aasha") is not found.
- **The admission date** is the file's, or today when empty (as on the form).
- **Limits**: 5 MB and 1000 rows per file, 100 rows per request (the screen splits them), so a file of 1000 students is 1 read and
  10 upload requests, far from the rate limit.
- The file is held in memory only while it is read (multer `memoryStorage`), never stored.

**Export** (`/school/students/export`, opened by the list's **Export** with its search, class and section): every school's register
has its own headings in its own order, so the export is the school's layout, saved on the server (`StudentSettings.exportColumns`),
on the same page as its fields (above):

- **Excel columns** (an accordion, closed when the page opens: one line with how many columns are in the file and how many are
  mandatory; open to change them): every column in one list of compact rows (two side by side on a wide screen), the ones in the file in
  its order (A, B, C...), each with its heading (press it to type your own), **In Excel**, **Mandatory** (the form's setting too) and
  its place (**↑ ↓**, which pass the next column in the file, or drag the row: it shows a hand). A column out of the file stays where
  it is, dimmed, without a letter; put back it is in its place. *Student Name* and *Class* are in every file, and so is the column of
  a mandatory detail. `EXPORT_COLUMNS` has 47 columns, plus the school's own fields (made and changed on Manage fields);
- the **Preview**, under the fields, shows the file before it is made: the sheet's letters, the headings of the fields that are on
  and the first 5 students. One read with the page (`GET /export/preview`, every column's value), so switching, typing and moving ask for
  nothing;
- **Save** (one `PUT /settings` with the changed settings and the columns; the default layout is saved as null) and **Export N**, which
  saves a change first and then downloads `GET /export` (class / section / name order, days as DD-MM-YYYY, Yes / No for the ticks,
  the age on today in India). A heading empty, too long or used twice is refused on the screen and by the server;
- **Each row** shows the column's heading in the Excel (the one the school can type over) and, under it, where it belongs (*Student*,
  *Parents*, *Address*, *IDs*...; *Your own field · Text* for an own field). It no longer says what Add student calls the column: the form
  is another list (Manage fields). The Mandatory column says *Always* for what every school keeps, *Class 1–12* for the previous
  school, a switch where the school decides and the form asks the detail, and a dash where the form does not ask it;
- **Back to the default** (on this page, the Excel alone: what Add student asks is not changed; the columns of mandatory details stay
  and the school's own fields go out of the file — `defaultColumnsDraft`) puts back a new school's columns (`DEFAULT_EXPORT_LAYOUT`: admission number, name,
  gender, date of birth, age, category, class, section, both parents' names, mobiles and occupations, the address, the previous
  school, last class, TC number and date, blood group, Aadhaar);
- the page says when a file of the layout could not come back through Bulk upload (no Date of Birth, Gender, Section or parent's mobile;
  an age is not a birthday).

**A school without Excel** has more ways in, all ending in the same preview table: the **sample template or its own CSV** (Google
Sheets and LibreOffice are free and save `.xlsx` / `.csv`), **Paste from a sheet** (copied cells with their heading row are sent to the
same `POST /import/read` as a file, which reads comma-, semicolon- and tab-separated text), and **Type the students here** (an empty
table with the usual columns, every detail the school's form needs and its own fields, 10 rows at a time; an empty row is not a problem and is not
uploaded; the table's + Add a column brings any other). The export itself is Excel only.

## Classes & Sections now count real students

`backend/src/main/academics/services/usage.ts` is implemented: `studentCountsBySection` counts the active enrolments of each section,
and `enrolmentCountsByClass` counts a class's enrolments this year and in every other year. So a section with students cannot be
deleted (`SECTION_HAS_STUDENTS`), a class whose sections or whose own whole-class enrolments have students cannot be deleted
(`CLASS_HAS_STUDENTS`), and a class with students in another academic year cannot be deleted either (`CLASS_HAS_HISTORY`), because
history keeps a class alive.

## The School Class page: Classes (`/school-class`) and Students (`/school-class/students`)

Laid out like the Teacher page since 2026-11-04 (`FrontEnd-React/src/pages/school/SchoolClass.tsx`): the plain header (title with the
academic year, breadcrumb and ONE button in the primary colour: **Manage classes** on Classes, **Add student** on Students, which carries
the chosen class and section; each page lacks the other's button), four tiles
**Departments / Classes / Sections / Students** (the class layout's totals and the students of `GET /students/capacity`: no new request
type; *seats left* is not a tile because those counts know only the seats of sections), then a one-line row of a search and dropdowns
without labels (`components/ui/FilterBar.tsx`, shared with `/teachers`; a dropdown shows its name until something is picked, its first row
takes it away). Since 2026-11-04 there are **no tabs**: Classes and Students are two entries of the menu (Overview group, **Classes** and
under it **Students**), one page on two addresses, and the heading and breadcrumb say which one it is. The old `/school-class?view=students&...`
goes to `/school-class/students?...`. The menu's old *Students* under Manage school is now **Manage Students** (`/school/students`: admit,
edit, import, export, inactive), like Manage Teacher, so no two entries are both Students:

* **Classes**: search a class name, Department, Class -> `GET /students/class-overview`, wing by wing, laid out after the user's reference
  design (2026-11-04). A wing is ONE panel (`components/schoolClass/DepartmentPanel.tsx`): a stripe of its colour on the left; its icon, its
  name, a pill with how many classes ("4 classes"), which ones ("Classes 1 to 4", "Pre-Nursery to UKG": `classRange` in `utils/academics.ts`;
  none for a single class); **Add class** (opens the department's own screen, where classes are added; not on "Other classes") and a **⋮**
  menu (*Manage <department>*, *View students* = `/school-class/students?department=<id|none>`). No students total. Its classes are cards
  two to a row (one on a phone, `components/schoolClass/ClassOverviewCard.tsx`): a round mark in the class's own colour (its number, its
  initials, or a picture as in the reference: rocking horse for Pre-Nursery, bear for Nursery, ABC blocks for LKG, star for UKG; the
  departments: ABC blocks for Pre-Primary, an open book for Primary; `components/schoolClass/kidIcons.tsx`), the name,
  "48 Students | 2 Sections | 120 Seats" (no Sections part for a class without sections, no Seats part with no limit), a bar of the seats
  filled with its per cent (the tooltip says "52% of 42 seats filled · 20 left") and a chevron. A click anywhere on the card opens the
  class. The section chips that opened one section from here are gone (the class's page has its sections).

  **A class's seats** (`seats` of `GET /class-overview`, 2026-11-04): its sections' seats added up (3 sections of 40 = 120); a class
  without sections, or whose sections have no limit, has its own seats (the number set when it was made); nothing set: 0, and no bar.
  `seatsLeft` and `percent` follow. The class's own page says the same ("39 of 40 seats left").
* **Students**: search name or admission number, Department, Class, Section (once a class with sections is picked), Gender, Order (the
  usual class-and-section order is the list's first row) -> `GET /students`, with the pager (its "Showing 1 to 12 of 40" is the count).

Every filter is a request to the server and stays in the address. *Clear filters* sits over the content when a filter is on. The search
waits 300 ms after the last key and then reads the newest address, so a dropdown picked meanwhile is kept.

**One class** (`/school-class/:classId`): the class teacher is named beside the title, "Class teacher: N/A" when there is none (for a class
with sections: the picked section's; with no section picked each section's card names its own). **Timetable & teachers** opens
`/school-class/:classId/timetable` (`?section=`, a class with sections opens on its first one and switches with the section links), only that
class: four tiles (class teacher or N/A, subjects, periods a week, school day), the **Teachers of ...** box (class teacher and each subject's
teacher, saved at once, Add subject; it was on the class page until 2026-11-04), the **Week** as placed (Published / Draft / Not made yet;
read-only, `components/schoolClass/ClassWeekView.tsx`; **Edit timetable** opens the timetable on this class) and **Timing**, kind of day by
kind of day (`timingGroups` in `utils/timetable.ts`: "Monday to Saturday · 08:30 to 13:00 · 6 periods · Lunch 10:30 to 11:00"). One new
read: `GET /timetable/grid` for the class.

## Tests

- `backend/src/main/students/__tests__/students.test.ts`: roles (teacher and parent refused, accountant reads), the happy path (student,
  guardian, enrolment, no User made), every field's message, five admissions at once (consecutive numbers), the lookup, the sibling
  flow (one guardian record), "use as is" and "update", a guardian from another school or with another number, a second guardian
  without a number, editing a guardian, the section of that class and year only, roll numbers, one enrolment per year, seats and the
  override, the last seat taken by one of three admissions at once, moves, the duplicate guard, no active year, the list's search /
  filters / sort / pages, editing, 404 before 400, and a child's one father and one mother (a second Father or Mother refused and named
  by `guardians.N.relation`, any number of Guardians and Others admitted; the same in a bulk-upload row).
- `students.isolation.test.ts`: `itKeepsSchoolsApart` for the list, the seats, reading / changing / moving a student and changing a
  guardian, plus another school's class, section and guardian sent in a body, and the lookup searching only the caller's school.
- `usage.test.ts`: the real counts and the class / section delete guards with real students, including a class with students in a past year.
- `importMatch.test.ts` (13): the same student by name, birthday and mobile (capitals and spaces do not matter, who and where come
  back), only the rows that meet somebody, the same name alone is nobody, twins and brothers are not matches, the same name and birthday
  with another or no mobile is a `maybe`, the school's own number and the Aadhaar number (the same child with a new mobile is the same
  student, another child's is `number` / `aadhaar`), the same student winning over a number that points elsewhere, an inactive student,
  another school's students never found, roles, a bad request (a day that is no day answers 400, not 500; 1001 rows), a file of 1000
  rows in one request.
- `import.test.ts`: the template (sheets, titles, dropdowns, roles), reading `.xlsx` (a title row above the titles, date cells, numbers,
  rich text) and `.csv` (quotes, a byte-order mark, `;`, no date guessing), the school's own template read back, every refusal of a file
  (`.xls`, `.txt`, a broken file, titles only, one column, 1001 rows, 6 MB, no file, a teacher), the check row by row (a linked parent,
  a gender, a missing section, a duplicate, a wrong or taken admission number, a kept one; nothing written), no year, roles, 101 rows,
  the import (kept numbers, brothers and sisters in one file sharing one guardian, the counter after `ADM-2026-0450`, a failing row not
  stopping the others, a second upload admitting nothing), seats with and without `allowOverCapacity` (a refused row carries `code:
  "SECTION_FULL"`), the export (columns, order,
  filters, roles) and isolation (only the caller's school; another school's `classId`). The school's own fields in a bulk upload: a
  field made from the table's "+" (one PUT with the field and its column after the layout's last; nothing else changes) and the rows'
  answers to it admitted or refused by its list; every kind of answer kept as its kind, exported, and the export read back with the same
  headings and values; another school's field refused; values outside the form's lists (gender, state, blood group, category) refused
  with the form's words.
- **Frontend** (`FrontEnd-React`, `npm test`, Vitest; see its README > Tests): unit tests of `utils/studentImport.ts` and
  `utils/exportLayout.ts`, component tests of the preview table and its panels, and a test of the whole Bulk upload page against a
  pretend API.
- **Browser journeys** (real Chrome, a throwaway backend on 5001 and app on 5174, by hand): onboarding, students, no year, classes,
  the bulk upload as a table (15 steps), the admit page layout (13 steps, in steps), Add student in steps (14 steps: what each step
  shows, Next checking only its own boxes, going back, Enter, a refusal about an earlier step, Clear all, a phone), fields + export (18
  steps), paste / typed table with an own field (7 steps), the empty Students page and the sample Excel (7 steps: the usual header and
  the plain card, the sample from Bulk upload downloaded, filled in like a person would and uploaded, then a file of an old register
  with no address and no previous school admitted as it is), the Manage fields page with one father and one mother (10 steps).
- `utils/admitSteps.ts` (which box belongs to which step, which steps a school has) and `components/ui/Steps.tsx` (the stepper) have
  unit tests; `StudentAdmit.test.tsx` walks the steps against a pretend API (Next with a wrong box, going back with the values kept,
  Enter, three steps for a school that asks nothing more, a refusal that opens an earlier step, the one POST).
- `classNumber.test.ts`: which class names are Class 1 to 12 and which are not (Nursery, LKG, UKG, "Class 13", words in front, Roman
  numerals). `fields.test.ts` also covers the details every school keeps (locked columns, fixed rules, the previous school by class on
  admission, edit and bulk upload).
- `fieldSync.test.ts`: the form and the Excel are independent but a mandatory detail is in both (a new school's Excel has the columns of its mandatory details, a detail made mandatory brings its column even when the saved layout lacks it and the saved layout is not changed by that, an Excel without a mandatory detail's column is refused naming it, optional keeps the column, asked-without-a-column and a-column-without-being-asked both stay as saved, an own field is held to the same rule, another school's settings never put a column here).
- `placements.test.ts`: where each detail goes (the usual places: 1 / 3 / 3 / 9 movable details over the four steps so the steps are as tall as each other, an own field at the end of More details, a move kept in order, a partial list completed, the usual places kept as none, each wrong entry named, a field added and placed in one save, a deleted field leaves its place, roles, and another school's settings never touched or used).
- `steps.test.ts`: the steps a school adds (More details alone for a new school, a step of its own with a name, kept in the order sent, a detail placed in it, up to 4, the names refused: too short or long, `<`/`>`, another step's or a built-in name, twice; a deleted step's details back in More details, a detail in a step the school does not have refused, `null` is the usual steps again, roles, and another school's steps never touched).
- `fields.test.ts`: the school's own fields (asked, checked by kind, kept, changed, cleared, exported, a kind change refused, deleted,
  another school's), the defaults, a school's needs on admission and on edit (emptying a saved one, a never-filled one), the change rules
  and their messages, roles, isolation, every record's format, Aadhaar once per school, the export layout (headings, order, preview,
  locked and duplicate headings, back to the default) and the import's warnings. The other test files make their schools with the
  "classic" needs (only the address), `createSchool(name, role, "classic")` in `src/test/schools.ts`.
- `tenants/__tests__/modelRegistry.test.ts`: `Student`, `Guardian` and `StudentSettings` are year-free; `Enrolment` and
  `AdmissionCounter` carry a required `academicYearId`.

## Not built (later)

Old `.xls` files (save as `.xlsx`), more than one sheet per file, updating students already admitted from a file, photos and documents (no file storage yet), the school's own fields in the sample template, the form's box order per school, Aadhaar masked or encrypted (kept whole on the school's choice; revisit with the DPDP rules), printing a transfer certificate document (the details are kept; the printed form is not
built), the year-end review and results/eligibility for a promotion, adding or removing a guardian link (or changing who is primary) after admission, merging duplicates, fees and
attendance (they will point at an enrolment), teacher access by section, the parent login.
