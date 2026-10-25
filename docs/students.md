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
   school's choice (its fields: the one list of the Export page, which also has a page of its own, **Manage fields**
   (`/school/students/fields`), reached from the form's header; the Students header always has **Export**, so a school with no student
   yet can set them there too (its file button is dimmed until there is a student); see [The school's own fields](#the-schools-own-fields)). Every row of the list says two names: its
   heading in the Excel and what Add student calls it (*Student Name* is one Excel column and the two boxes *First name + Last name* on
   the form). The details every school keeps (name, gender, date of birth, age, category, class and section, both parents, the address
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
| `dateOfBirth`, `admissionDate` | calendar days stored as midnight UTC (like the academic year's days); neither in the future (today in India); age 2 to 25 on the admission date |
| `admissionNumber` | made by the server, unique in the school, immutable: `ADM-<first year of the active academic year>-<4 digits>`, e.g. `ADM-2026-0001` |
| `address` | `line1`, `line2` (area or landmark), `city`, `state` (from `INDIAN_STATES`), `pincode` (6 digits); each part null when not given (whether it is needed is the school's choice) |
| `bloodGroup`, `category` | A+ ... O-; General, OBC, SC, ST, EWS, Prefer not to say |
| `previousSchool` | `{ name, lastClass, tcNumber, tcDate }`; once anything is filled the name is required |
| `aadhaarNumber` | 12 digits with Verhoeff's check digit (spaces and dashes typed between are dropped), **stored as it is** (the school chose to see it whole); unique in the school (`AADHAAR_TAKEN` names whose it is) |
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

## Guardians, siblings, and the parent login (planned)

- **Mobile first.** The admission form starts a guardian with the mobile number and asks the server once, when exactly 10 valid
  digits are typed: `POST /students/guardians/lookup { mobile }`. A POST, so a mobile number never appears in an address (or in a
  log of addresses). It answers the school's guardian with that number and their children here, or `{ guardian: null }`. Only the
  caller's school is searched.
- **Linked, never copied.** A found guardian is sent as `{ guardianId, relation, isPrimary, updateDetails }`; the same parent is then
  linked to the new child. This is how the second child of a family is admitted, and how one parent will later see two or three
  children. A new guardian whose number the school already has is never created as a copy and never overwrites the saved one:
  the server answers `GUARDIAN_EXISTS` with the guardian, and the screen shows them with *Use as is* / *Update details*.
- **A guardian's own details** are changed with `PATCH /students/guardians/:id` (for every child of theirs). A new mobile number must be
  free in the school (`GUARDIAN_MOBILE_TAKEN`) and resets `mobileVerifiedAt` to null.
- **Parent login (not built).** The recommended identity is the guardian's mobile number with an OTP (a "family code" fallback may
  come later; not decided). What is ready for it: the number is stored as 10 digits and unique per school, `mobileVerifiedAt` exists,
  every child of a parent is reachable through one guardian record (`Student.guardians.guardianId`), and nothing creates User accounts
  yet, so the login can be designed freely. Open point: `User.email` is unique across the whole platform (see the tenant isolation
  notes); a parent login by mobile number will need its own identity, per school, not the email.

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
- **One list for the form and the Excel** (the Export page; there is no separate fields page). A field that is **On** is asked on Add
  student (when it is a box there) and is a column of the file; **Off** is neither (its setting `hidden`); **Mandatory** is `required`.
  Each export column is tied to its setting in `FrontEnd-React/src/utils/exportLayout.ts` (`needOf`: the address column to
  `addressLine1`, the previous school to `previousSchoolName`...; both occupations share `guardianOccupation`; Mandatory on Mother's
  Name is `secondParent`, both parents needed). Columns with no setting say what they always are: *Always* (name, gender, birthday,
  class, section, the father as the usual primary contact), *Auto* (admission number, age), *Optional* (roll number, a second number,
  a guardian, the email). `rulesForLayout` shows older settings the list's way (asked but not exported, or the reverse) and the next
  Save stores them so.
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
- **The school's own fields** (a house, a bus pass number...: *Add your own field* on the Export page). Each has a name (2 to 40
  characters, not one of the list's names, once), a kind (`CUSTOM_FIELD_TYPES`: text up to 200, a number, a day 1900 to 2100, yes /
  no, a list of 1 to 30 choices) fixed once added (the answers kept would not fit another kind; the server refuses a change), and
  needed / optional / not asked like the others (a yes / no is never needed). Up to 20. Keys are `c_` and letters and digits, made by
  the screen. They are asked on Add student and Edit (the card *Your school's own details*), shown on the student's page, checked by
  the server with the form's words (`customIssues`: "Choose the House", "Choose the House from the list", "Enter a number for
  Height (cm)", "This is not one of your school's fields"), and are columns of the export and its preview (a day as DD-MM-YYYY, a tick
  as Yes / No). Deleting one takes it out of the form and the saved layout. The bulk upload does not take them yet: a needed one is
  said as lacking on every row.
- **Off** only stops asking and exporting: what was saved stays saved. A previous school's name that is off hides the whole Previous
  school card (a TC without the school means nothing); an admission date that is off is today (the edit form still shows it).
- The order of the form's boxes is fixed; the order a school chooses is the export's (below).

## API (all under `/api/v1/students`; the school is always the signed-in user's)

| Method and path | What it does | Who |
| :-- | :-- | :-- |
| `GET /` | this year's students: `q` (part of a name or an admission number), `classId`, `sectionId` (an id or `none`), `sort` (`class`, `name`, `admissionNumber`, `admissionDate`), `dir`, `page`, `limit` (1 to 50, default 12). One aggregation over the year's enrolments. Answers `{ academicYear, items, page, limit, total, totalPages }`; a row has the student, `place` (class, section, roll number) and `primaryGuardian` | readers |
| `GET /capacity` | `{ academicYear, sections: [{ sectionId, classId, capacity, enrolled, seatsLeft, nextRollNumber }], classes: [{ classId, enrolled, nextRollNumber }], totals: { students, seats, seatsLeft, fullSections } }`. `nextRollNumber` is the one after the highest roll number given in the section (or, in `classes`, to the students of a class without sections), 1 when none is given yet, null past 999; the same aggregation, no extra query | readers |
| `GET /:id` | the student with `guardians`, `place`, `enrolments` (every year, newest first) and `siblings` | readers |
| `POST /` | the admission (above). `admissionDate` defaults to today; `allowOverCapacity`, `confirmNotDuplicate` are the person's answers | writers |
| `PATCH /:id` | the student's own details, only what is sent (null clears an optional one); the age rule is checked on the result; the admission number never changes | writers |
| `PATCH /:id/enrolment` | `{ classId?, sectionId?, rollNumber?, allowOverCapacity? }`: another class or section of the **current** year, or only the roll number, with the same rules. A changed class or section drops the old roll number unless a new one is sent | writers |
| `POST /guardians/lookup` | `{ mobile }`: the school's guardian with that number and their children, or null | writers |
| `PATCH /guardians/:id` | a guardian's `name`, `mobile`, `alternateMobile`, `email`, `occupation` | writers |
| `GET /settings` | `{ fields: { key: mode }, customFields: [{ key, label, type, options, mode }], exportColumns: [{ key, heading }], exportIsDefault, updatedAt }`, the defaults filled in | readers |
| `PUT /settings` | `{ fields?: { key: mode }, customFields?: [...] (the whole list), exportColumns?: [{ key, heading }] \| null }`: only what is sent changes; `exportColumns: null` is the default layout again. Each entry is checked on its own ("This detail cannot be changed", "A yes / no detail is a tick: it cannot be needed", "There is already a field called Religion: switch it on in the list", "A field keeps its kind: add a new field for another kind", "This column is already in the export", "Two columns cannot have the same heading", "Student Name and Class are in every export"...) | writers |
| `GET /export/preview` | the first 5 students of the export (`q`, `classId`, `sectionId`) with **every** column's value by key, and `total`: the Export screen draws any layout from one read | readers |
| `GET /export` | this year's students (`q`, `classId`, `sectionId` as in the list; every page) as an `.xlsx` file, in the school's saved layout | readers |
| `GET /import/template` | the sample file `.xlsx`, made with the school's own classes and sections | writers |
| `POST /import/read` | `multipart/form-data`, one `file` (`.xlsx` or `.csv`, up to 5 MB, up to 1000 rows): `{ fileName, sheetName, headerRow, headers, rows: [{ row, cells }] }`. Nothing is kept | writers |
| `POST /import` | `{ dryRun, allowOverCapacity, rows: [{ row, admissionNumber?, student }] }`, 1 to 100 rows: `{ dryRun, results: [{ row, ok, errors, warnings, student? }], ok, failed }` | writers |

Readers: school admin, principal, accountant. Writers: school admin, principal.

Errors use the API's usual shape: `{ success: false, message, code, details: [{ path, message }] }`, `path` naming the box
(`firstName`, `address.pincode`, `guardians.0.mobile`, `sectionId`). The answers that need a decision carry what the screen shows:
`SECTION_FULL` (`details[0].capacity`, `enrolled`), `DUPLICATE_STUDENT` (`details[0].student`), `GUARDIAN_EXISTS`
(`details[0].guardian`). A record of another school is `404` (or `400 ..._NOT_FOUND` for an id inside a body), never "it is another
school's". **404 before 400**: for `PATCH /:id`, `/:id/enrolment` and `/guardians/:id` the record is looked up before the body is
validated, so a wrong body tells another school nothing.

Every message a person can see is written once in `schemas/students.schemas.ts`; the screens repeat the same words
(`FrontEnd-React/src/constants/students.ts`) to say what is wrong before anything is sent. The server checks everything anyway.

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
     admission number or roll number twice in the file is found too. Tabs show all rows, the ones to fix or the ready ones; **Need a
     fix** keeps the rows it opened with while they are fixed (a fixed row shows Ready there until the tab is opened again). The rows to
     fix can be downloaded as CSV. Seats are counted for the whole file on screen; sections that would go over ask the person
     (`allowOverCapacity`). Nothing is sent while the table is changed (only a new field of the school's own is saved).
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
- **Nothing is admitted twice**: the duplicate guard (same name, date of birth and primary mobile) and the kept admission numbers refuse
  a row already admitted, so the same file can be uploaded again after fixing some rows.
- **The admission date** is the file's, or today when empty (as on the form).
- **Limits**: 5 MB and 1000 rows per file, 100 rows per request (the screen splits them), so a file of 1000 students is 1 read and
  10 upload requests, far from the rate limit.
- The file is held in memory only while it is read (multer `memoryStorage`), never stored.

**Export** (`/school/students/export`, opened by the list's **Export** with its search, class and section): every school's register
has its own headings in its own order, so the export is the school's layout, saved on the server (`StudentSettings.exportColumns`),
on the same page as its fields (above):

- **Fields** (an accordion, closed when the page opens: one line with how many are on and mandatory; open to change them): every
  field in one list of compact rows (two side by side on a wide screen), the ones in use in the file's order (A, B,
  C...), each with its heading (press it to type your own), **On**, **Mandatory** and its place (**↑ ↓**, which pass the next field
  in use, or drag the row: it shows a hand). A field switched off stays where it is, dimmed, without a letter; switched on again it is
  back in its place. *Student Name* and *Class* are in every file. `EXPORT_COLUMNS` has 47 fields, plus the school's own (*Add your
  own field*, the gear changes or deletes one);
- the **Preview**, under the fields, shows the file before it is made: the sheet's letters, the headings of the fields that are on
  and the first 5 students. One read with the page (`GET /export/preview`, every column's value), so switching, typing and moving ask for
  nothing;
- **Save** (one `PUT /settings` with the changed settings and the columns; the default layout is saved as null) and **Export N**, which
  saves a change first and then downloads `GET /export` (class / section / name order, days as DD-MM-YYYY, Yes / No for the ticks,
  the age on today in India). A heading empty, too long or used twice is refused on the screen and by the server;
- **Each row says two names**: its heading in the Excel (the one the school can type over) and, under it, what Add student calls it
  (*Add student: Date of birth*, *Add student: Father · Full name*, *Add student: First name + Last name* for the one *Student Name*
  column, *Add student: not asked* for a field that is off; `FORM_LABELS` and `addStudentLabel` in `utils/exportLayout.ts`, shown by
  `ExportFieldsCard`). The Mandatory column says *Always* for what every school keeps and *Class 1–12* for the previous school;
- **Back to the default** puts back a new school's list (`DEFAULT_EXPORT_LAYOUT` and the default settings: admission number, name,
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
- `fields.test.ts`: the school's own fields (asked, checked by kind, kept, changed, cleared, exported, a kind change refused, deleted,
  another school's), the defaults, a school's needs on admission and on edit (emptying a saved one, a never-filled one), the change rules
  and their messages, roles, isolation, every record's format, Aadhaar once per school, the export layout (headings, order, preview,
  locked and duplicate headings, back to the default) and the import's warnings. The other test files make their schools with the
  "classic" needs (only the address), `createSchool(name, role, "classic")` in `src/test/schools.ts`.
- `tenants/__tests__/modelRegistry.test.ts`: `Student`, `Guardian` and `StudentSettings` are year-free; `Enrolment` and
  `AdmissionCounter` carry a required `academicYearId`.

## Not built (later)

Old `.xls` files (save as `.xlsx`), more than one sheet per file, updating students already admitted from a file, photos and documents (no file storage yet), the school's own fields in the sample template, the form's box order per school, Aadhaar masked or encrypted (kept whole on the school's choice; revisit with the DPDP rules), promotion to the next year, transfer certificate
and a "left" status, adding or removing a guardian link (or changing who is primary) after admission, merging duplicates, fees and
attendance (they will point at an enrolment), teacher access by section, the parent login.
