# Timetable, subjects and teachers

Built 2026-10-31. Three backend modules (`backend/src/main/staff`, `subjects`, `timetable`) and the pages under **Manage school > Timetable**
(`FrontEnd-React/src/pages/school/Timetable*.tsx`). This file says what it does, the rules the server holds, the real-life cases it covers
and the ones it does not, and how to test it.

## The flow a school follows

Since 2026-11-01 everything is on **one page**, `/school/timetable`, in **two tabs** (the user found four steps on separate pages
confusing). The old addresses (`/timings`, `/class-subjects`, `/class/:classId/:sectionId`) lead to the right tab.

1. **School timings** tab: the **usual school day** as a few numbers (when school starts; each period and an assembly in **minutes**,
   where 60 reads "= 1 hr" and 90 "= 1 hr 30 min"; how many periods; a **lunch** and **one short break**, each from when to when, with
   how long it is), drawn period by period as they are typed (08:30, 40 minutes, lunch 10:30 to 11:00, 8 periods gives
   08:30-09:10, 09:10-09:50, 09:50-10:30, lunch, 11:00-11:40 ... 13:40-14:20). The lunch and the short break stand at their own times, the
   periods fit round them (a period that would run into one is cut to end where it starts, and the page says so); they cannot share time
   (`setupProblems`). Then **each day of the week** is *Usual*, *Different* (its own numbers: a short Saturday) or a *Holiday*. **One Save**
   sends the whole week (`PUT /timetable/school-day`). 2026-11-03: the section *Timings for a few classes* (and its dialog) is gone from
   this tab: it is the school's (or a department's) timing, not a class's; a class's own periods are set on its timetable (*Periods per
   day*). The short break used to be "after period N, minutes" and up to three; days saved that way are read back as the first break at
   its time (the page says rows changed by hand are made again from these numbers when saved).
   **Unsaved changes are asked about** (2026-11-03): with changes in the week being edited (the school's or a department's), picking
   another group under *Timing for*, another tab, another page or a reload asks "Save the changes to Pre-Primary's timing?": *Save and
   continue* sends the week and goes on only if it was saved (the server's reason is shown otherwise, and it waits while the numbers are
   wrong), *Don't save* goes on and the changes are lost, *Cancel* stays. A week nobody touched (a new school at the usual numbers) asks nothing.
   **Timing for** (2026-11-02): at the top of the tab, *Whole school* or a **department** (Pre-Primary keeps other hours than Primary). A
   department follows the school until **Give Pre-Primary its own timing**; that opens the same editor, starting from the school's week,
   and its save is the department's **whole week** (a holiday there is a holiday for its classes even when the school has school).
   **Use the school's timing again** takes it away (asks first). The timing follows the department: a class put in it later takes it.
   Since 2026-11-03 the department's **classes are shown as chips** ("Classes  Class 1  Class 2 ...", or "No classes in it yet") in the
   card of its usual day and in the "follows the school's timing" card, each *Timing for* card says "5 classes · Own timing", and the grey
   strip above the card is gone: *Use the school's timing again* (or *Cancel*, for a timing being started, which also says "Not saved yet")
   is at the right of the card's header.
2. **Class timetables** tab: every class or section on the left (search, and All / Not started / Draft / Published), the one picked on the
   right with its week as a table. **Click a period** and a box opens right under it (2026-11-03; before, a subject was picked above the
   week first and then the periods were clicked, and there was an Eraser): type the first letters of the subject and press Enter, or click it.
   The box lists the class's subjects first (each with its teacher and how many of its periods a week are in: `3/6`), then the school's
   other subjects, then the usual subjects of an Indian school the school does not have yet (picking one adds it to the school), and *Add
   "…" as a new subject* for anything typed that is in no list; what starts with the letters comes first. A subject whose usual teacher does
   not come that day, or is teaching another class then, says so in red (it can still be picked; the server has the last word at Save).
   A period that has a lesson opens the same box: pick another subject to change it, **Teacher & room** (the lesson window) or **Take it
   out**. The box is not modal on a desktop (the next period can be clicked at once; Escape or a click elsewhere closes it) and is a modal
   one on a phone (no cursor in the search box until it is touched). A subject the class did not study yet **joins its list when the
   timetable is saved** (with the periods it was given, no teacher).
   **Periods per day** (2026-11-03) opens a box with the seven days of the week, a − 5 + for each (0 = no school that day) and *Same on every
   school day*: it changes only this class (every section of it), so Monday can have 5 periods and the other days 8; a day left alone keeps
   following the school's (or the department's) timing. Fewer periods cut the day after that period, more add periods after the last one
   (as long as it); the box says each day's times, and *Back to the school's periods* gives the class's own days up. Lessons in a period the
   class will no longer have are asked about first and taken out only when the person agrees. A class with no timing at all has the same box
   on its page (*Set the periods of this class*). For the whole school or a department the **School timings** tab is still the place.
   The old **Periods & teachers** button is gone (2026-11-03): the subjects' periods a week (the program's fill needs them), single / double
   periods, the teacher and *choices* open from "Fill the empty periods" by itself when no subject has any yet (the line of help under the
   buttons, with its *change periods a week* link, was taken away the same day: no extra text). "Fill the empty periods" lets the program do
   it; Save; Publish. Print, copy to the other sections.
3. The school's **Subjects** (`/subjects`: the usual ones in one click, the school's own, archived not deleted) and **Teachers** are their own pages. Since 2026-11-03 the header has no **Subjects (n)**
   and **Teachers (n)** buttons (a subject is added where it is used, in the box of a period; extra clicks). **Teachers moved out of the
   Timetable on the same day**: they are **Manage school > Teachers** (`/school/teachers`; add in four steps, with a username and password
   for each; see `docs/teachers.md`), and the old address `/school/timetable/teachers` leads there. The Subjects page is still
   `/school/timetable/subjects`, reached from a class's subjects. The two tabs are in the header, at the right of the title; no line under the title.

A teacher's whole week across the school: `/teacher/:teacherId`.

**The week in one save.** The page holds the week as one usual day and what each day does; the server keeps it as timings for all classes.
`PUT /timetable/school-day` takes the rows of every day that has school (a day not sent is a holiday), makes one timing of the days whose
rows are the same (the one with the most days keeps the name of the school's usual timing, the others are named after their days:
"Saturday"), and replaces the school's timings for all classes **together**, after checking the whole new week: the rows, no class following
two timings on a day, and no lesson of a timetable left without its period (`SCHEDULE_IN_USE`, nothing changed). Timings made for some
classes are left alone. Rows changed by hand in the old dialog are made again from the numbers when the week is saved (the page says so).

**A department's timing** is stored as timings with `departmentId` (scope "only", no class named): `loadRules` (the one place every rule is
read) gives them the department's classes **at the time they are read**, so a class moved in or out follows at once. A department timing
with no rows is its **holiday**: `resolveSchedule` returns no timing when the winning one has no period, so the class has no school that day.
They are changed only as the department's week (a PATCH or DELETE of one of them on `/schedules/:id` is refused, `SCHEDULE_OF_DEPARTMENT`),
kept when a class is deleted, and deleted with their department. A school may have up to 60 timings. Known limit: moving a class to another
department changes its timing without a check, so a lesson in a period the new timing lacks shows red on its grid (and Publish refuses it).

**A class's own days** (`PUT /timetable/class-day`, `ScheduleService.replaceClassDay`, 2026-11-03): `{ classId, days: [{ day, slots }], removeLessons? }`.
Each day sent is the class's own (more or fewer periods; a day with `slots: []` is its **holiday**, even where the school or its department has
school); the days with the same rows become one timing named after the class ("Class 2", "Class 2 - Saturday"), scope "only", that one class,
no department. They **replace** what the class had of its own (the timings that name this class alone), so no days at all sets it back to
following the school; every other timing is left as it is. The rows are checked as any day's; a timing made for several classes that
already covers the class on a day sent is a clash (`SCHEDULE_CLASH`, nothing changed). Lessons that would have no period under the new
timings: those of **other** classes stop the save as in any timing change (`SCHEDULE_IN_USE`); this class's are refused with
`LESSONS_IN_REMOVED_PERIODS` (409; the message names the sections and counts, `details: [{ path: "lessons", message, lessons }]`) unless
`removeLessons: true`, which takes them out of every section's timetable of the class (this year's and the next one's) **after** the timings
are saved (asking again after a failure finds them still there). Unknown class: 404 `CLASS_NOT_FOUND`. The FE builds the rows from numbers
(`utils/classWeek.ts`) and sends only the days that differ from what the class would follow anyway.

**A subject put in that the class does not study** (`PUT /timetable/grid`): any active subject of the school is accepted; after the whole grid
passed the checks it is added to the class's list with the periods it was given, single periods and no teacher. An archived subject, or one
that is not the school's, is refused (`SUBJECT_NOT_AVAILABLE`) and nothing is kept.

## Decisions (change them here, in one place)

* **Lunch is part of a timing, set once.** The wizard makes it from one lunch time; a second timing (Saturday, the little ones) is made
  from its own numbers. A class follows **one timing a day**: a timing is for *all classes*, *only some*, or *all but some*, on some days.
  The more particular timing wins: one made for named classes (a class's own days, see below) beats a department's, a department's beats the
  one for all (2026-11-03: before, a department's and a class's were on one level and clashed). Two on the same level on one day clash.
  A class no timing covers has no school that day.
* **Who may change it**: `TIMETABLE_WRITERS`, `SUBJECT_WRITERS`, `STAFF_WRITERS` = school admin and principal (one line each, in the
  module's `constants.ts`; the FRD has the principal make it and the school admin approve; here both may do both). A teacher may read,
  and sees only **published** timetables. The accountant sees nothing.
* **The unit is a section**, or the class itself when it has no sections (`sectionId` null). Class lists and timetables are per unit and per
  academic year; timings, subjects and teachers last across years.
* **Who teaches a subject of a class** (the list's `teacherId`) can also be chosen outside the timetable since 2026-11-03: on the teacher's page (*Assign class*) and on a class's School Class page (*Teachers of Class 5 - A*), through `PUT /subjects/allotments/teacher` (one subject, the same checks as saving the list). The timetable reads the same list, so nothing has to be copied. `docs/teachers.md`.
* **Backup teachers** (2026-11-06): each subject of a class can also have up to 4 backup teachers in order (`Allotment.backupTeacherIds`, priority 2, 3...). The **main teacher** (priority 1, `teacherId`) is the only one the timetable uses and checks for clashes; a backup has no periods. The class's *Timetable & teachers* page saves the class teacher, the main teachers and the backups together with one Save (`PUT /subjects/allotments/teachers`). Saving a whole list (`PUT /subjects/allotments`) keeps a subject's backups unless the row sends `backupTeacherIds`. `docs/teachers.md`.
* **A teacher is a record with an optional login** (`Teacher.userId` -> a `User` with role `teacher`, made when the teacher is added or later; 2026-11-03, `docs/teachers.md`). The timetable does not need the login: a teacher added by name only still gets lessons.
* **A lesson names a teacher only when it is not the subject's usual one**, so changing the subject's teacher in a class moves all its lessons.
* **No transactions** (standalone MongoDB). A save checks the whole grid against every other class, then writes. Two people saving two
  classes in the same second can still both pass the check; the next read of either shows the clash (red), and Publish refuses it.

## API

All under `/api/v1`. Writers: school admin, principal. Readers add teachers (published only) where noted.

| Method and path | What it does |
| :--- | :--- |
| `GET /subjects?status=active\|archived\|all` | the subjects, each with in how many classes it is taught this year |
| `POST /subjects`, `POST /subjects/quick-add`, `PATCH /subjects/:id` | add one, add the usual ones by name (one request), change / archive / bring back |
| `GET /subjects/allotments?classId&sectionId=none\|id` | what one unit studies, the totals (to place / the week has), the other sections |
| `PUT /subjects/allotments` | replace what a unit studies (`alsoSections`, `withTeachers` give it to other sections too) |
| `GET /staff/teachers?status&search` | teachers, with what they were given this year |
| `POST /staff/teachers`, `PATCH /staff/teachers/:id` | add (with a login if `login` is sent), change, make inactive / bring back (the login follows). The other staff routes (one teacher, a login, a new password, `/me`) are in `docs/teachers.md` |
| `GET/POST /timetable/schedules`, `PATCH/DELETE /timetable/schedules/:id` | the school's timings (one by one: used for timings of some classes) |
| `PUT /timetable/school-day` | a week in one save: `{ departmentId?, days: [{ day, slots }] }`. Whole school: a day not sent is a holiday. A department: every day, a holiday with `slots: []`. Answers every timing |
| `PUT /timetable/class-day` | a class's own days: `{ classId, days: [{ day, slots }], removeLessons? }` (see above). Answers every timing |
| `DELETE /timetable/school-day/:departmentId` | the department follows the school's timing again (refused while a lesson would lose its period) |
| `GET /timetable/grid?classId&sectionId` | one unit's week: its days and rows, lessons, subjects, teachers, what other classes take, the checks |
| `PUT /timetable/grid` | save the whole grid (409 `TIMETABLE_CLASHES` with `dXpY` paths when it cannot be) |
| `POST /timetable/grid/publish`, `/unpublish` | publish / take back |
| `POST /timetable/grid/autofill` | the program's proposal for the empty periods (not saved) |
| `POST /timetable/grid/copy` | give a saved timetable to the class's other sections |
| `GET /timetable/teachers/:id` | one teacher's lessons across the school |
| `POST /timetable/teachers/:id/replace` | give all of a teacher's classes and lessons to another (a teacher who left) |
| `GET /timetable/overview?search&status` | the steps and every unit with where it stands (filtered by the server) |
| `GET /timetable/published` | the units whose timetable is published |

## The rules the server holds

**Timing.** At least one period, at most 12; a period 10 to 120 minutes, a break up to 180; rows in order and not overlapping; one lunch;
no two timings for the same class on the same day; a timing cannot lose a period, a day or a class that a timetable has lessons in
(`SCHEDULE_IN_USE`).

**What a class studies.** Each subject once; the subject and the teacher are the school's and still active; 1 to 20 periods a week; blocks of
1 to 3 and periods in whole blocks; a choice has two or more subjects with the same periods and block and never one teacher; the periods
(a choice counted once) must fit the class's week (`PERIODS_DO_NOT_FIT`); a subject with lessons cannot be taken off
(`SUBJECT_IN_TIMETABLE`); a new teacher must be free at every lesson of the subject.

**A timetable (errors stop the save).** A lesson in a period the class has on a day it has school; a subject the class studies; the teacher
active, coming that day, and **not teaching another class at an overlapping time (compared by the clock, not the period number)**; a room
used by one class at a time; only the subjects of one choice share a period.

**Warnings (saved and shown).** A subject with fewer or more periods than allotted; no teacher; a subject back to back or more than twice a
day; a double period broken; a teacher over their daily or weekly limit; a choice with a subject missing from a period.

**The program's fill** (`autofill.ts`) keeps what is there, places choices, double periods and the busiest teachers first, spreads a subject over
the days, never puts a teacher in two places or on a day off, and says what it could not place. The same seed gives the same arrangement.

## Real cases covered

Lunch and breaks that are the same for the school; a half-day Saturday; different timings for the little ones or a shift; periods of different
length per class group; double periods for labs; third-language style choices taught side by side; part-time teachers (days off); teacher load
limits; rooms (labs, ground) used by one class at a time; a section with its own subjects (a stream) or sections sharing a list; a class with
no sections; a teacher who leaves (give everything to another, checked first); changing a timing in use (refused with the place named);
archiving a subject or teacher in use (refused); deleting a section or class (its lists and timetables go); next year (the sections, what
they study and their timetables can be copied as drafts); print; draft and published.

## Not built (say if you want it)

Substitution for a day when a teacher is absent (needs leave); alternate-week patterns and "2nd/4th Saturday off" (needs the school calendar);
teachers signing in to see or propose changes; parents' and students' views (the portals are not built); exam timetables; building the
*next* year's timetable before it is switched on (it can be copied, then changed after it is on); one teacher's workload report across years.

## Tests

* Backend (`npm test`, needs the Docker MongoDB): `staff/__tests__`, `subjects/__tests__`, `timetable/__tests__` (rules, checker, autofill, grid,
  tools, in-use guards, year copy, isolation of every route; `modelRegistry.test.ts` lists the year-free models).
* Backend, a department's timing: `departmentDay.test.ts` (followed by its classes and by a class added later, holidays beat the school's
  day, replaced not added, given back, lessons protected, one school only, kept on a class delete, gone with the department, not changed one
  timing at a time); a new subject from the grid: `gridNewSubject.test.ts`.
* Backend, the week in one save: `timetable/__tests__/schoolDay.test.ts` (days grouped, replaced not added, the usual name kept, timings of
  some classes left alone, a lesson left without its period refused with nothing changed, boxes named by day, a clash, who may, one school only).
* Frontend (`npm test`): `utils/__tests__/timings.test.ts`, `schoolWeek.test.ts`, `timetable.test.ts`; `pages/school/__tests__/Timetable*.test.tsx`;
  `components/timetable/__tests__/ClassSubjectsEditor.test.tsx`.
* A browser journey (real Chrome, throwaway backend 5001 / app 5174 / database `school_erp_md`) walks the whole flow: timings, subjects,
  teachers, class subjects, the grid (fill, clash, save, publish, copy), a teacher's week, a teacher who leaves, a phone width.

## Problems found while checking the whole flow, and what was done

Found by walking the flow in a real browser (a fresh school, 16 steps) and by a whole-school test (11 sections filled one after the other, then
every teacher's week checked by the clock). None needed a change to an old module except one added choice on the next-year form.

| Problem | What happened | Fix |
| :--- | :--- | :--- |
| Two inputs with one name | the lunch box and the lunch row of the day were both "Lunch from": a screen reader (and a test) could not tell them apart | the rows are now "Lunch starts" / "Period 3 ends" |
| Page scrolled sideways on a phone | the hidden header of a table (`sr-only`) is positioned outside the scrolling box and widened the page; the grid's column also grew to the table's width | the scrolling cards are `relative`; the grid column is `min-w-0` |
| Grid too cramped | the side panel left each day 100 px, Thursday to Saturday were cut off | the subjects sit in a strip above, the grid has the whole width, fixed equal columns, name and teacher on two lines |
| "Copy to other sections" gave almost nothing | sections that share a teacher cannot be in two places at one time, so most lessons were left out | the dialog says so and points to "Fill the empty periods", which fills around the teachers |
| Saturday half day was a trap | the first timing starts on Monday to Saturday, a Saturday timing then clashed | the server's message names the class, the day and the other timing; the dialog says "Is Saturday a half day? Take it off here" |
| Saving a class's subjects asked the server again | the list was read again after the save | the save's answer is put into the read (one request) |
| Status regions looked alike | the toast area is also a status region, so a screen reader and a test found two | each status of these pages has its own name |
| A heading's list could not be opened a second time | after a pick the box keeps the focus, and a list that opens on focus does not open on a click in a focused box (found by the older bulk-upload journey) | a click on the box opens the list when it is closed; a test for it |
| Next year started empty | the sections were copied but not what they study or their timetables | the next-year form has "Copy what each class studies and its timetable" (drafts; the running year is not touched) |

Known limits (said, not hidden): two people saving two classes in the same second can still both pass the check (no transactions): the next read
shows the clash in red and Publish refuses it; the program's fill is a rule of thumb, not a search for the best timetable, so a very tight school
(teachers with almost no free period) may get "Maths: 2 missing" and has to move a lesson by hand.
