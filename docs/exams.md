# Test & Exam (Manage school > Test & Exam), asked 2026-11-06

The user (Hinglish, summarised): a new entry **Test & Exam** under Manage school. The school can **schedule exams** (Half-yearly, Annual)
and **decide that they have come, with the school's time following the exam**; **some classes can write on other days or at other times**
and the **whole school can have one timetable**; the page must **tell which classes have the same date and time**; months and dates are
all free ("real-world scenarios"); every test has a **duration**, and **normal test, class test, month test** can be kept; every paper
says **which subject** and **what topic** (the topic optional).

Round 2, the same day, after the first report listed what was not built ("ha kr do, and check every scenario of a school; unit tests,
integration tests, TDD"): **teachers and parents see the exams, bell notifications, the class timetable gives way on exam days, marks
and results.** Described after round 1.

## Round 1: the school's side

* **Exam** (`Exam`, one per name per academic year): a kind, a name, the days it runs (`startDate`..`endDate`), a note, and for a **full
  exam** the **school hours** while it is on (`schoolStart`..`schoolEnd`, both or neither). Kinds: Half-yearly, Annual, Quarterly,
  Pre-board (**full exams**: they take over the school day, so they can carry school hours) and Unit test, Monthly test, Class test,
  Other test (**tests**: they fit into a day that goes on as usual, so no school hours). Whether it has come is **worked out from the days**
  (`upcoming` before the first day, `running` from the first to the last day, `over` after it); nobody has to switch it on.
* **Paper** (`ExamPaper`): a subject, one day inside the exam, a start time, a number of **minutes** (5 to 600), optional marks and
  optional **topic**, for **one class or several at once** (`classIds`). The same date and time for a group of classes, or for the whole
  school, is one paper with those classes; a class on another day gets its own paper. Papers are added as **a timetable for some
  classes** (`POST /exams/:id/papers { classIds, papers: [...] }`, all or nothing) and then changed or taken away one by one.
* Rules the **backend** keeps (the page repeats the words): papers on a day of the exam; inside the school hours of a full exam; end by
  midnight; **not on a holiday** when the paper is put on a day (the school's own, or a standard one it has not taken off:
  `PAPER_ON_HOLIDAY`); **a class is never in two papers that overlap on one day**, in this exam or across the exams of the year
  (`PAPER_CLASH`: "Class 5 already has Mathematics from 9:00 AM to 12:00 PM on 15 Sep (Half-Yearly Exam)"); an exam cannot be shortened, or
  its school hours narrowed, past a paper already in it (`PAPERS_OUTSIDE`); the exam falls inside the academic year; no two exams of a
  year share a name (`EXAM_EXISTS`); a class is never deleted, so its papers and marks stay when it is made inactive (`ExamCleanup`, which took a deleted class off its papers, is gone).
  Subjects must be the school's active ones.
* **API** `/api/v1/exams` (school admin / principal: `EXAM_WRITERS` / `EXAM_READERS` in `exams/constants.ts`): `GET /` (this year's
  exams: the one that is on first, then the next, then the ones over; `paperCount`, `classCount`), `POST /`, `GET /:id` (with `papers`,
  in date and time order, each with its classes in the school's order), `PATCH /:id`, `DELETE /:id`, `POST /:id/papers`,
  `PATCH /:id/papers/:paperId`, `DELETE /:id/papers/:paperId`. 404 before 400 (`examExists`), tenantScope on the models, isolation test.
  All the models carry `academicYearId`: a new session starts with no exams.
* **Pages** (menu *Test & Exam*, `/school/exams`): the list (cards, status filter All / Running / Upcoming / Over from the one list read,
  *Schedule exam*) and one exam (`/school/exams/:id`): about the exam, then the timetable **By class** (classes that write the same
  papers on the same days at the same times are **one card**; `groupByTimetable` in `utils/exams.ts`) or **By date** (each day with the
  school's hours, the papers in time order, the classes of each). *Add timetable* = tick classes (or *All classes*), then one row per paper
  (subject, day, starts, minutes, marks, topic); a new row follows the one before (next day, not Sunday, same time and length).

## Round 2

### Marks and results

* **`ExamMark`** (one row per child per paper, unique on paper + child; carries `academicYearId`, `examId`, and the class and section the
  child was in when it was entered): `marks` (or null) and `absent`. Marks are entered **class by class (section by section)**, after the
  paper's day has come, by **the teacher of the paper's subject in that class, the class teacher, or the school** (`access.ts accessTo`,
  the same rule as the diary and the class tests). Other teachers of the class may read the sheet.
* `GET /exams/papers/:paperId/marks?classId&sectionId` returns the **marks sheet** (every active child of that class or section with their
  marks, `held`, `canWrite`, `marked`, `average`); `PUT /exams/papers/:paperId/marks { classId, sectionId, marks: [{ studentId, marks,
  absent }] }` saves it. A child left out keeps what they had; marks and no absence (`marks: null, absent: false`) **clears** a child's
  result; **absent** has no marks (marks sent with it are dropped); a child named twice counts once (the last line); an empty list is fine.
  Errors: `PAPER_NOT_FOUND` (not for that class), `NOT_YOUR_CLASS`, `NOT_THEIR_SUBJECT`, `NO_MAX_MARKS` (the paper has no out-of: the school
  sets it first), `PAPER_NOT_HELD`, `VALIDATION_ERROR` "Marks are out of 50" / "Marks are whole or half marks" (**whole or half marks only**:
  44.5 yes, 33.3 no) / "Marks cannot be below 0", `NOT_IN_CLASS`.
* **A paper with marks is held steady** (`PaperService.marksStillFit`, 409): its subject cannot change, a class that has marks cannot be taken
  off it (`PAPER_HAS_MARKS`), it cannot be moved to a day that has not come (`PAPER_HAS_MARKS`), its out-of cannot go below a mark already
  entered (`MARKS_ABOVE_MAX`) or be cleared. Its time may change. Taking a paper (or the exam) away takes its marks with it (the page asks:
  "The marks of 38 children go with it"); deleting a class takes its marks.
* **Totals**: a child's exam total is the marks of the papers they have a result in (not absent) out of what those papers are out of, and
  the percentage; an **absent paper is left out** of the total (the same rule as the class tests' average). No grades yet (a school's grade
  scheme is its own: not built).
* A child who **moves to another class keeps their results** (read by child, not by class).

### What teachers and the school see of a class

`GET /exams/class?classId&sectionId&date?` (school admin, principal, and the teachers of that class: `NOT_YOUR_CLASS` for others): every exam
of the year (running first) with **this class's papers only**, each with `held`, `canWrite` (the subject's teacher, the class teacher, the
school), `marked` / `children` counts, and `holiday`; an exam with no paper for the class still shows (its days and the school's hours, "Timetable
not made yet"). The page is the **Exams tab of a class's work** (`/class-work/:classId?section=&tab=exams`, `components/classwork/ExamsPanel.tsx`):
the papers in date order, *Enter marks* / *Change marks* / *View marks* (a window with every child, marks out of the paper's and an *Absent* tick,
one *Save marks*, then a window with the class average). The school reaches it from a class's School Class page like the rest of its work.

### What parents see

`GET /parent/children/:id/exams?date?` (the parent's own child only): the exams of the child's class this year, each paper with the child's own
result (`{ marks, absent, percent }` or null) and the exam's **summary** (`{ marks, outOf, percent, papers }`). On the child's page
(`components/parent/ChildExams.tsx`), between the tests and the attendance: the papers, "45 / 50 · 90%", "Absent", "Marks not in yet" for a paper
that was held, and a *Total 125 / 150 · 83%* chip.

### The class timetable gives way on exam days

Both reads above also return `week`: the **Monday-to-Sunday week** that holds `date` (today's by default) with, for each day the class has a paper,
`{ date, day, replacesLessons, schoolHours, exams, papers }` (`exams/services/days.ts`). A day of a **full exam** (Half-yearly...) has
`replacesLessons: true`: the week view (`ClassWeekView`, used on the **parent's child page** and the **school's Timetable & teachers page of a class**)
shows one tall cell with the exam, its papers, the school's hours and "No regular lessons" in place of that day's lessons, and the breaks go around it. A
**test** (Unit, Class test) keeps the lessons; the day's heading says "Test" and what it is. An exam day with no column in the timetable (a Saturday paper of a
Monday to Friday school) is listed under the week. A day with no paper of the class is a day as usual. The timetable itself (the template in the
Timetable page and the teacher's week) is not changed: only these two readings of it.

### Notifications (docs/notifications.md)

`exam.scheduled` / `exam.changed` (name, kind, days or school hours really changed) / `exam.removed` reach **everyone of the school**; `exam.timetable`
(a timetable added), `exam.paper_changed` and `exam.paper_removed` reach **the parents of the children and the teachers of the classes** of that paper
(a class taken off a paper is told it is taken off); `exam.marks` reaches the parent of a child whose result is **new or changed**, and the class teacher
and the school with the class average. Nobody hears what they did themselves; saving the same again tells nobody; a closed login is not told.

### Scenarios the round found (and fixed)

* **A holiday declared after the timetable was made** (heavy rain): allowed, the paper on that day carries `holiday: "Heavy rain"` (the exam page, both
  views, and the class's Exams tab show "Holiday: Heavy rain") so the school moves it. Changing only the topic or marks of such a paper is allowed (the
  holiday check runs when a paper is **moved** to a day, not on every save: that was a bug); moving it onto a holiday is refused.
* **A subject taken out while it has papers still to come** was allowed: now `SUBJECT_IN_USE` ("Drawing has 2 papers still to come in exams").
  Past papers keep their subject's name; renaming is not stopped.
* A calendar PATCH without `note` used to wipe the note (round 1 side fix).
* `hashPassword` costs 12 bcrypt rounds for real passwords and **4 in tests** (`NODE_ENV=test`): the backend suite got several times faster.

## Round 3 (2026-11-26): Exam at the top, whom it is for, the Exam Time Table tab

The user (Hinglish, summarised): Exam gets its **own row at the top** of the menu, with a tab **Exam Time Table** inside it, "where I decide which
class has which paper on which date at which time". An exam is for **the whole school, some departments or some classes**; dates and **times can
differ** per class or department, or be the same. "I set the exam 9 to 12, so that day **the school's time is 9 to 12** for those classes (the exam
has priority), and **parents see the exam time** too; when only some departments have the exam, only their time changes, the other classes keep
their usual time."

* **Menu**: *Exam* (`/school/exams`, `exams.manage`, schoolWide) right under Dashboard; *Test & Exam* under Manage school is gone. The page has two
  tabs (`PageTabs` card, in the address `?tab=timetable`): **Exams** (the list, as before) and **Exam Time Table** (`ExamTimetableTab`: a Select of
  the year's exams, the one that is on first, kept as `?exam=`; its timetable by date; only the chosen exam is read).
* **Whom it is for** (`Exam.scope` `school` | `departments` | `classes`, `departmentIds`, `classIds`; an older exam has none = the whole school).
  Schedule exam has **For: Whole school / Departments / Classes** with a MultiSelect (the school's layout is read only for those two). The server
  keeps only this school's active ones (400 `Choose departments of this school` / `Choose classes of this school`, `Choose the departments` /
  `Choose the classes` for none). The list and an exam's page carry `audience` (`label` "Whole school" / "Primary and Middle" / "Class 9 and Class 10",
  `departments`, `classes` in the school's order: every active class, the active classes of its departments, or the classes it names). Papers only for
  those classes (400 path `classIds` "Class 9 is not in this exam"); narrowing the scope past a class that has papers is 409 `PAPERS_OUTSIDE`
  "Class 9 has papers in this exam: take them off first". A department's classes are worked out when asked, so a class put in the department later is in.
* **The time is each paper's**: the dialog's "School hours while it is on" is gone (saving an older exam lets its hours go: `schoolStart/End: null`); a
  paper is **Starts – Ends** (the minutes are worked out). **The school's time on an exam day** (`days.ts`): a class's day of a full exam has the
  exam's own hours when an older exam kept them, else **the span of that class's papers that day** (9:00 to 12:00; two papers 9–11 and 12–1 make
  9 to 1). It reaches the class week on the **parent's child page**, the school's class Timetable page and the teacher's Exams tab (`ClassWeekView`).
  A class with no paper that day keeps its usual day.
* **Exam Time Table / the exam's page** share `components/exams/ExamTimetable.tsx`: "Whole school · 8 of 12 classes have a timetable", "Not yet: Class 9,
  Class 10", Add timetable (only the exam's classes; All classes = all of them; the school's layout is not read), By class / By date, pencil and bin.

**2026-11-27, after the user's screenshot** ("time table mein upar class rahegi, wahan se select karunga, niche table form mein time table, time date
sab rahe, fir click karke wahan subject dun; tab ka UI Students jaisa"): the page's tabs are the **line** tabs of Students (orange bar, Exams with its
count). The Exam Time Table tab is now: the exam (Select), a card **Class** with "n of m classes have a timetable" and the exam's classes as chips (a
green tick on the ones that have papers; `?class=`), **Same for several classes** (the old Add timetable window, for many classes at once), and
`components/exams/ClassExamTable.tsx`: **a row for every day of the exam** (`examDates`; a Sunday says so), each paper of the class with subject, time
(9:00 AM to 12:00 PM, the length), marks, topic. **Add subject** on an empty day (or **+** for another paper that day) and a paper's pencil open the row
for writing: Subject, Starts to Ends, Marks, Topic, **Save** / Cancel; a new paper takes the time of the class's paper before it (`classDayDefaults`).
The bin takes the paper **off this class** (PATCH `classIds` without it when it is shared, else DELETE). Errors (no subject, end before start, a
clash from the server) show in the row, which stays open. The subjects are read the first time a day is clicked. The exam's own page keeps the
By class / By date views (`ExamTimetable`).

### Round 4 (2026-11-27): Students and Rooms tabs, the exam's page only reads, the parent sees roll number and room

The user (after screenshots of the exam's page and the time table tab): "proper class name, accha visible UI; add timetable par modal nahi, mera Exam
Time Table ka tab khule; ek tab jismein sab bacche hon, filter, naam, father name, roll number (admission ke time nahi diya to yahan de sakein);
ek tab Room number: kitne se kitne bacche kis room mein; yeh sab parent ko bhi jaayega: exam yahan se yahan tak, time table, roll number, room."

* **Tabs** of the Exam page: Exams | Exam Time Table | **Students** | **Rooms** (`?tab=`); the last three share the exam Select (`ExamWorkspace`), and
  the exam and class stay when the tab changes. The filter boxes have no required star.
* **Students** (`ExamStudents`): Class (the exam's), Section (All or one), Search (name, father's name, admission no.); "40 children · 3 without a
  roll number · 5 without a room"; the table: Roll no. (a box), Student (and admission no.), Father's name, Section, Room. **Number the rest** fills
  the empty boxes with the next numbers of each section, A to Z; **Save roll numbers** sends only what changed. API `GET /exams/:id/students?classId
  &sectionId?` (400 "Class 9 is not in this exam"), `PUT /exams/:id/roll-numbers { rows: [{ studentId, rollNumber | null }] }`: the roll number is the
  **child's own** (`Enrolment.rollNumber`, the admission's, used once in a section in a year); a child not in a class of the exam is 400; a number twice
  in the list is 400 "Roll number 3 is given twice in Class 5 - A"; another child's is 409 `ROLL_NUMBER_TAKEN` "Roll number 1 of Class 5 - A is Kabir
  Rao's" (inactive children's numbers stay theirs); everything is checked first, then the numbers are freed and given, so two children can swap.
* **Rooms** (`ExamRoomsPanel`, model **`ExamRoom`** `{ examId, room, classId, sectionId, fromRoll, toRoll }`, tenantScope, academicYearId): a room
  holds a run of roll numbers of a class (or one section of a class that has sections); several classes can share a room. The table: Room, Class,
  Roll numbers, Children (counted from the roll numbers now); **Add room** / pencil write a row (Room, Class, Section, From, To: a new run starts after
  the class's last one, thirty long), Save / Cancel; the bin takes a run away. On top: "Not in a room yet: Class 5 - A · 12 children · 3 without a roll
  number". API `GET/POST /exams/:id/rooms`, `PATCH/DELETE /exams/:id/rooms/:roomId`: 400 "Enter the room", "Choose the section", "The last roll number
  cannot be before the first", "Class 9 is not in this exam"; 409 `ROOM_OVERLAP` "Class 5 - A roll 1 to 30 is in Room 101 already". Deleting the exam
  deletes its rooms. A child's room is found from their roll number, so a number given later finds its room by itself.
* **The exam's own page** reads only: the class cards are headed by the classes' names (with "2 papers" and **Edit timetable**, the tab on that class);
  rows are Day, Subject, Time, Marks, Topic; no pencil or bin on a paper; the classes card has a bar and "Not yet"; **Add timetable** goes to the Exam
  Time Table tab on the first class without one (no window).
* **The parent** (`GET /parent/children/:id/exams`) gets `seat: { rollNumber, room }` with each exam; the child's page shows "Roll no. 12" and "Room
  101" beside the exam's days. An exam for other classes (a department's, some classes') is no longer on a child's or a class's list.

Not done in round 3 (ask): the **school-level** day (teacher check-in late/absent times, the dashboard's "school now" line) does not follow an exam
day; only each class's day does. Section-level papers are still not built.

### Round 5 (2026-11-27): exam duty, and the Children of a run counted while it is written

The user (screenshots of Rooms and Students): "roll number daala to Children blank aa raha hai, yahan total children dikhao jaise save ke baad aata hai;
kis room mein kaun sa teacher rahega, duty rahegi, ek room mein 1 ya 2 teacher; jaise hi assign karun teacher ko pata chal jaaye ki mujhe is room mein
duty hai, aur exam se related time, date, room sab information."

* **Children while a run is written**: `GET /exams/:id/rooms` also sends `rolls: [{ classId, sectionId, numbers }]` (the roll numbers given in each class
  or section of the exam); the editor row's Children cell (`<output aria-label="Children in this run">`) counts the numbers between From and To of the
  chosen class/section, "–" until the run is valid.
* **Exam duty** (model **`ExamDuty`** `{ examId, room, roomKey, teacherIds (1-2) }`, tenantScope, academicYearId, unique per exam + `roomKey` = the room's
  name in small letters): one or two teachers watch a **room** (the name its runs share) for the **whole exam**; a teacher watches **one room of an exam**.
  The Rooms table has an **On duty** column: the first row of each room shows its teachers (pencil "Change duty in Room 101") or **Add teacher**; it
  opens a MultiSelect of the school's teachers (`GET /exams/:id/teachers`, read only then; a teacher on duty in another room is greyed out as "Kiran Rao ·
  Room 102"; two picked = no third) with Save / Cancel. `PUT /exams/:id/duties { room, teacherIds }` (exams.manage): [] takes them off; 400 "Up to 2
  teachers in a room", "Room 999 is not in this exam", "Choose teachers of this school"; 409 `DUTY_TAKEN` "Meena Singh is on duty in Room 101 already".
  `GET /exams/:id/rooms` sends `duties: [{ room, teachers: [{ id, name }] }]`.
* **The duty follows its room**: a run renamed while it is its room's last one moves the duty to the new name (its teachers hear "Exam duty moved to Hall
  A", body "was Room 102"; if the new room already has a duty the old one goes); the last run taken away takes the duty ("Exam duty taken off: Room
  101"); deleting the exam deletes its duties. A room with other runs left keeps its duty.
* **The teacher** hears it in the bell (`exam.duty`, link `/dashboard`): "Exam duty: Room 101", body "Half-Yearly Exam · 15 Feb to 26 Feb · with Dev
  Patel"; taken off: "Exam duty taken off: Room 101". Saving the same teachers again tells nobody; the school is not told (it did it). On their home
  (`MyExamDuties`, `GET /exams/my-duties`, any login; a non-teacher gets []) a card per room of an exam that is not over: the room, the exam and its
  days, "With Dev Patel", "29 children", the runs ("Class 5 - A · roll 1 to 30"), and a table of the days the room's classes have papers (Day, Time =
  first paper's start to last one's end, Papers: "Mathematics · Class 5 · 9:00 AM to 12:00 PM"); today is tinted, past days grey. No duty: no card.

Not done (ask): a different teacher **each day** (the duty is for the whole exam); a clash with the teacher's leave on an exam day, or with a duty in
another exam on the same day; printing a duty chart; staff who are not teachers on duty.

## Decisions of mine (the user did not choose: change if asked)

* A paper is for **whole classes** (all sections), not sections. Marks are entered section by section.
* "Decide that the exams have come" = **worked out from the days**, not a switch; the **school hours** are a field of a full exam.
* A school's own holiday blocks a paper being put on a day, a Sunday does not (weekly offs are not stored anywhere).
* **No publish switch**: adding a timetable is the announcement (the parents and teachers are told at once). A day with no paper of the class is shown
  as a day as usual even in the middle of a full exam.
* Marks are whole or half marks; an absent paper is out of the total; marks cannot be entered before the paper's day (not before its time).
* Teachers and parents get **read** access to exams only through their class or their child; the school-wide list and the exam page stay with the
  school admin and the principal.

## Not built (ask when wanted)

* Grades (A+, B...), rank, report cards and printing a result; a school's own grade scheme.
* Sections-level papers (a paper for 5-A only); a warning when a subject is set for a class that does not study it.
* Copying one exam's timetable to another, printing a timetable, exam days on the school calendar page.
* Hall tickets; a duty chart to print (invigilation per room is built: round 5).
* The teacher's own week (`TimetableTeacherWeek`) does not give way on exam days; only the class's week does.

Tests: `backend/src/main/exams/__tests__/` (`exams`, `examPapers`, `examMarks`, `examViews`, `examDays`, `examScenarios` with the whole journey,
`exams.isolation` with the rooms, roll numbers and duties, `examScope` for round 3, `examSeating` for round 4, `examDuty` for round 5),
`FrontEnd-React/src/pages/school/__tests__/ExamStudentsRooms.test.tsx`, `components/dashboard/__tests__/MyExamDuties.test.tsx`, `backend/src/main/notifications/__tests__/examNotifications.test.ts`, `FrontEnd-React/src/utils/__tests__/exams.test.ts`,
`pages/school/__tests__/Exams.test.tsx`, `ExamDetail.test.tsx`, `SchoolClassTimetable.test.tsx`, `pages/classwork/__tests__/ClassWorkExams.test.tsx`,
`pages/parent/__tests__/ChildExams.test.tsx`, `ChildPageExams.test.tsx`, `components/schoolClass/__tests__/ClassWeekView.test.tsx`,
`components/layout/__tests__/NotificationsBell.test.tsx`.
