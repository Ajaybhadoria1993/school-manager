# Documents: the ID card and the exam report card (2026-11-19)

The user asked that the app can make the **student ID card** and the **exam report card** as documents, and that the school (and parents) can **print** them from the app.
They are built from what the app already keeps; the only new record is the student's **photo**. Nothing is a stored file: the server gives the data, the screen lays it out
on a credit-card-sized card (85.6 x 54 mm) and an A4 page, and the browser prints it (its print window also saves a PDF).

## What the documents hold

* **ID card** (front and back): the school (name, logo, address, phone), the student's photo (or a box "Paste photo here"), name, class and section, roll number, admission number,
  date of birth, blood group, the session and the day it is valid till (the session's end); on the back the primary guardian's name and number, the student's address, the school's
  address and phone, "if found, return it".
* **Report card** (one exam, A4): the school's header (logo, address, phone, email, board and affiliation number), the student (class, roll, admission number, date of birth, father,
  mother, photo), each subject's **marks, out of, percentage and grade**, the **total, grade and result**, the session's **attendance** (late counts as there), the pass mark and the
  grade key, and lines to sign (class teacher with the name, parent, principal).
  * A subject's marks are the sum of its **papers in that exam that have a result**; a paper with no marks yet is left out ("-"); an absent paper shows **Absent** and is left out.
  * **Pass**: every subject with a mark is at or above the pass mark; otherwise "Not passed". While no mark is in: "Marks are not in yet", no total.
  * The pass mark and the grades are **the school's own** (Documents > Grading, below); until it saves them, the usual scale is used (`documents/constants.ts`: pass 33%, A1 91+, A2 81+, B1 71+,
    B2 61+, C1 51+, C2 41+, D 33+, E below).

## API (`/api/v1/documents`, backend/src/main/documents)

`GET /options` (the classes with their sections, the exams of the session) · `GET /students/:id/id-card` · `GET /students/:id/report-card?examId=` ·
`GET /classes/:id/id-cards[?sectionId=]` · `GET /classes/:id/report-cards?examId=[&sectionId=]` (a whole class or section at once, in roll order, at most 200: 400 `TOO_MANY_STUDENTS`) ·
`GET|PUT|DELETE /students/:id/photo` (PUT is a file in the `photo` field). Parent: `GET /parent/children/:id/id-card`, `GET /parent/children/:id/report-card?examId=` (the child must be the
parent's own: 404 otherwise).

* **The photo** (`StudentPhoto`, one per student, in MongoDB, year-free): PNG, JPG or WebP checked by its first bytes (not its name), at most **300 KB** (the app shrinks it to 480 px as a JPEG before
  sending). A child's face has **no address of its own**: it travels inside the answers (`data:image/...;base64`) of people who may see the student, never at a public URL (the school's logo is public;
  a child's photo is not).
* A student who left the school (inactive) has no card; a class asks for the running session.

## Who may (docs/permissions.md)

`documents.view` (staff: the cards and report cards of any student or class) · changing a photo is `students.edit` · parents: `child.documents` (on by default; the school unticks it). A teacher never
reaches the school pages. The school admin and the principal always.

## Screens (FrontEnd-React)

* **Documents** (menu, Manage school; `/documents?kind=id-cards|report-cards&classId=&sectionId=&examId=`): choose the class (and section, and the exam for report cards), see every card, **Print**.
  Report cards print one to a page; ID cards print in rows.
* **A student's page**: a card with their photo (Add / Change / Remove) and the **ID card** and **Report card** buttons, each opening the document in a window with Print.
* **The child's page (parent)**: a Documents section with the same two buttons.
* Printing (`components/documents/PrintPortal.tsx`, `documents.css`): when Print is pressed, a copy of the documents is placed straight under `<body>`, the stylesheet hides everything else, the
  browser's print window opens, and the copy is removed when it closes. So the screen never shows a document twice, and nothing else of the app is printed.

## Tests

Backend `documents/__tests__/documents.test.ts` (15: the grades, the card, the photo and what is refused, a class's cards, the report card's marks / percentage / grade / total / result / an absent
paper / nothing in yet / attendance, the parent's own child, who may, one school never reaching another's); frontend `pages/documents/__tests__/Documents.test.tsx` (15), `pages/parent/__tests__/ChildDocuments.test.tsx`
(5), `navConfig`. Checked in a real browser on the throwaway stack: the parent's report card and ID card (with a photo). **Not checked**: the printed paper itself (the print window was not opened),
the Documents page of the school in the browser (covered by its tests), and a real phone photo.

## Part two (2026-11-19, "the rest of the documents")

* **The school's own grading** (`DocumentSettings`, one per school, year-free): the **pass mark** (1 to 100), the **grades** (2 to 12, each "from this percentage up", the lowest from 0, no two from the same percentage or with the
  same name; saved best first), the **principal's name** (printed under the principal's line) and whether the **rank** is shown. `GET|PUT|DELETE /documents/settings` (`documents.manage` to change; DELETE goes back to the usual
  scale). Every report card reads it, so changing it changes the grade and the pass / fail of every report card at once. The card prints the pass mark and the grade key it was made with.
* **Class rank**: on the report card, "Rank in class: 2 of 38": the child's place among the children **of their class** who have a total in that exam, by the sum of their marks over the sum of what those papers are out
  of; the same percentage shares a place and the next is skipped (1, 1, 3). A child with no mark yet has no rank and is not counted. Switched off with *Show the rank* in Grading.
* **The class teacher's remark** (`ReportRemark`, one per child and exam): `PUT /documents/remarks { studentId, examId, remark }` (`documents.manage`; up to 300 characters; empty takes it away). It is printed on the report
  card, the parent's too. It is written in the report card window of the student's page (*Class teacher's remark* + *Save remark*).
* **The admit card** (hall ticket): `GET /documents/students/:id/admit-card?examId=`, `GET /documents/classes/:id/admit-cards?examId=[&sectionId=]`, parent `GET /parent/children/:id/admit-card?examId=`. The school's header, the
  student with their photo, the **class's papers in the order they are written** (date, day, subject, start and end), what to bring and what is not allowed (four fixed lines), the principal's line. A class with no paper in the
  exam gets a card saying the timetable is not made yet.
* **Certificates** (`Certificate`, the school's register): a **bonafide** (what it is needed for), a **character certificate** (the conduct, "good" when not said) for a student who is here, and a **transfer certificate (TC)**
  for a student who has **left** (inactive; 409 `STUDENT_NOT_LEFT` / `STUDENT_LEFT` the other way round). `POST /documents/students/:id/certificates { type, purpose?, conduct? }` (`documents.manage`) issues the next number of its
  kind in the running session (`BON/2026-2027/0001`, `CHR/...`, `TC/...`; the highest + 1 with a unique index, so two at once never share a number) and keeps what it said about the student **as it was that day** (names, parents,
  date of birth, admission date, class: for a TC the last class they were in, the day and reason they left, where they go). `GET /documents/certificates[?type=&studentId=]` (the register, newest first, 100 at most),
  `GET /documents/certificates/:id` (whole, with the school's header, the session and the principal's name, to print again any time), `POST /documents/certificates/:id/cancel { reason }` (the number stays, marked
  cancelled, and a cancelled copy prints with CANCELLED across it). Never edited or deleted. `GET /documents/students/search?q=` finds the student to issue for.
* **QR code** on the back of the ID card (the school's name and the admission number, for a scanner at the gate or the library), drawn in the browser (`qrcode.react`).

### Screens (part two)

* **Documents** now has five tabs: **ID cards**, **Report cards**, **Admit cards** (each for a class or section, printed together), **Certificates** (the register: kind chips, open to print, *Issue a certificate*, cancel with a
  reason) and **Grading** (pass mark, grades, principal, rank; read only without `documents.manage`).
* **A student's page**: *ID card*, *Report card* (with the remark box), *Admit card*, and *Certificate* (a bonafide or a character certificate); on the page of a student who has left, only *Transfer certificate*.
* **The child's page (parent)**: *ID card*, *Report card* (with the remark and the rank), *Admit card*.

### Permissions

`documents.view` (see and print: ID cards, report cards, admit cards, the register, the grading) and **`documents.manage`** (write remarks, issue and cancel certificates, set the grading; brings `documents.view`). Parents:
`child.documents` as before. A teacher cannot write a remark yet (the class teacher is not a `documents.manage` kind of person: the school gives the permission to a staff kind, or writes the remark itself).

### Tests (part two)

Backend `documents/__tests__/documentsMore.test.ts` (18: the grading and how it changes every card, what is wrong with a scale, the rank and ties, the remark, the admit card, the three certificates with numbering, the
TC rules, many at once, the register, cancelling, the parent's admit card, who may, one school never reaching another's); frontend `pages/documents/__tests__/DocumentsMore.test.tsx` (17), `ChildDocuments.test.tsx`.
Checked in a real browser on the throwaway stack: the parent's report card (the school's own scale, pass mark 35%, rank 1 of 2, remark, principal's name) and admit card. **Not checked in a browser**: the school's Documents page
tabs, the Certificates register and the printed paper (covered by tests).

## Not built

A **combined report card** for several exams of the year (one exam at a time today); the **teacher writing the remark from their own login** (the remark is written by a person with `documents.manage`); **other certificates**
(migration, no-dues, date-of-birth, study certificate); a **school's own design** of the ID card (one fixed design); printing on a **PVC card printer** (the size is right, bleed marks are not); a photo **cropped to the face**;
the **date of birth in words** on a TC; **serial numbers carried across sessions** (each session's numbers start again, the session is in the number).
