# Attendance (menu entry under Teacher), asked 2026-11-06

The user (Hinglish, summarised): a new menu entry **Attendance** under **Teacher**, with three tabs: **Student**, **Teacher** and **Staff** (Staff is
"coming"). **Student**: filters in every way: every class by name; click a class (or a section of it) and the list of its students comes, with who
was present and who was absent. When a child does not come, the teacher takes the attendance and may give a **reason**. The school admin can see
**any class's** attendance, today's or from earlier, with a **date filter** (May to November, say), **this month to start with**. **Teacher**: nobody takes
it: the teacher **marks themselves present in the app**, so the sheet says Present; a teacher who does not is **Absent when school time ends**; as soon as
they mark, the details come to the school's sheet: **when, at what time, a log**: not only Present or Absent, **the time matters**.

## The pages (`/attendance/students`, `/attendance/teachers`, `/attendance/staff`; `pages/attendance/`)

Menu: one **Attendance** row right under **Teacher** (school admin, principal; `nav-config.ts`, `submenu: "Attendance"`) that opens **Student**, **Teacher** and **Staff** nested
under it. They are three pages, no tabs (2026-11-10, user: "yaha attendance me bhi karo, click karne par 3 tab rahen", the same as Timetable; until then they were the three tabs
of one page). The top bar and each page's title say *Student / Teacher / Staff attendance*, because the menu's short words repeat the Teacher and Staff entries. `/attendance` and
the old `?tab=` addresses go to the right page with their filters (`AttendanceRedirect.tsx`), so old notifications and bookmarks still work.

* **Student** (`components/attendance/StudentAttendance.tsx`): chips with every class by name (the first is picked to start with); a class with sections
  shows **All sections, A, B...** under them. Then the **From / To** boxes and **Today, This month (default), Last month, Last 3 months**
  (`RangeFilter`; `utils/attendance.ts rangePresets`). Four numbers (Students, Attendance %, Absent, Late), then the table: roll, student, **a column for each
  day up to a month** (P present, A absent, L late, Lv leave; a dot on a mark that has a **reason**; a day nobody took is empty and its heading says
  "attendance not taken"; a holiday's heading says which), then the child's counts and %. **A longer range shows the counts only.** A child's name opens a window
  with their counts and each day they were not Present with the **reason**. Everything picked is kept in the address (`class`, `section`, `from`, `to`).
  **Redone 2026-11-16 (the user's reference pictures, a layout not a copy):** the Student page opens on **This week** (Monday to Saturday; a Sunday belongs to the
  week before) and the buttons are Today, This week, Last week, This month, Last month, Last 3 months (`RangeFilter weeks`, `rangePresets(today, true)`; the Teacher
  page keeps the month and has no week buttons). Class, Section and Date Range are **one "Filters" card** with a blue **Take attendance** button at the end of the last
  row. Tiles say Total Students / Attendance Rate / Absent / Late. A range of **7 days or less is the register** (`isWeekRange`): round P/A/L marks, an **Admission No.**
  column (always) and a **Remarks** column (the reasons given when attendance was taken, read only; typing a remark from this page is NOT built). **Today's column is
  tinted** (`aria-current="date"`). The children come **in pages of 12/24/48** (`StudentPager`, cut on the screen: one read for the class, paging asks the server nothing;
  the tiles and the day's two sides are of the whole class). **A day's heading (a day attendance was taken) is a button** that opens `DaySplitDialog`: that day in two sides,
  **Present** (late is tagged Late) and **Absent** (leave is tagged Leave, with the reason); `utils/attendance.ts daySplit`. No server change.
  **Second round, same day (the third reference picture):** the Filters card is compact (chips 36px, From/To 192px, `RangeFilter compact`) so Class, Section and
  "Date Range + presets + Take attendance" are one line each on a wide screen. The register shows **the whole week, Monday to Saturday**: the server stops at today, so
  `weekColumns` adds the days after it as `coming` columns (heading "Wed 18 Nov, coming", no button, nothing marked); a week that is over or a month gets none. Today's
  column is **outlined** (heading to last row). A child with **no roll number** shows the place in the list (continues over pages). The pages have **no Rows per page box**
  (`StudentPager` without `onLimit`; a fixed 12 a page).
  **Third round (the reference's top, one step at a time):** the page has **no big title of its own** (the top bar names it): it starts with the round arrow and
  "Dashboard > Student attendance" (`PageBackNav`; the h1 stays as `sr-only`). "Not taken today" is `NotTakenStrip.tsx`: one row of classes; when the row is too
  full (measured, `ResizeObserver`) a chevron at the end opens the rest. The Filters card is compact: `DateBox compact` (36px, no clear button), presets 32px, Take attendance a
  plain blue button without an icon. Seen in a real Chrome (headless, stub API) at 1817px wide: Class chips, Section chips and "Date Range + presets + Take attendance"
  are each ONE line. **Fourth round (his screenshot at ~125% zoom, a 1217px card):** chips 12.5px / 8px padding, label column 72px, From/To 192px, so all 16 Class chips
  and "Date Range + presets + Take attendance" are one line there; the one-line rule (`flex-nowrap` + `overflow-x-auto`) starts at **1420px wide** (`min-[1420px]:`), below
  it the rows wrap (a half-cut chip looked worse than a second line).
  **Fifth round (the reference's table):** the register and its pages are ONE card (`<section aria-label="Attendance register">`), the pages in a footer line
  ("Showing 1 to 12 of 47 students" left; `StudentPager compact`: **Page**, previous, numbers, next, **Last page** »). Header on white ("Student Name"), tallies centred in
  green / red / orange / blue, a faint line between the days, fuller round marks in a week (`MARK.strong`), **Remarks in a box** (the week's reasons, or a dash; still read
  only). **Sixth round (2026-11-17, "only what is needed: did the child come or not"): the Remarks column is GONE** (the reasons are in the hover of a mark and in a child's
  window), **so are the Late and Leave columns and the Late tile.** The page shows two answers, not four (`cameToSchool`: present + late = came, absent + leave = did not):
  a mark is a **P** or an **A** (the true word and the reason stay in its hover), the counts are **Present, Absent and %** (late counts as there, leave as not there), the tiles
  are Total Students / Present / Absent / Attendance Rate. **While attendance has not been taken on any of the days there are no zeros:** no counts columns, the tiles say "-",
  and one line says "Attendance has not been taken for these days yet"; a child with no mark among children who have shows a dash. The section letter beside a name shows only for a
  class with two sections or more.
  **Seventh round (2026-11-17): MARKING from the register.** In a week's register (7 days or less) a cell with no mark on a day up to today (not a holiday, not a Sunday, not a
  day that has not come) says **"Not taken"**; for the class teacher (see the eighth round: not the school) a click on it, or on a P / A, opens **Present / Absent**
  (`MarkMenu.tsx`, a HeroUI `Popover.Content` anchored to the cell) and the choice saves at once: `PUT /api/v1/classroom/attendance/student { studentId, date, status }`
  (`AttendanceService.markStudent`, the class teacher of the child's class only since the eighth round below, not the future, not a holiday). **Only that child's mark is written** (the
  user chose this over "the rest of the class becomes Present"): the day it makes is `partial` (`AttendanceDay.partial`), which counts as NOT taken for the principal's "Not taken
  today" list and makes the class teacher's sheet open unsaved (with the school's marks in it) until every child has a mark or the sheet is saved (`partial` is then false).
  Late counts as Present, so choosing Present on a late child sends nothing; Late and Leave are not choices here. The child's parent hears "was absent" once; staff are not told
  (`Notify.studentMarkedAbsent`). After a save the register, the warning and the class sheet (other slice, `classroomApi` "Attendance" tag) read again. Month ranges stay read only.
  **Eighth round (2026-11-17, the rule changed): ONLY THE CLASS TEACHER TAKES ATTENDANCE; the school (admin, principal, staff) ONLY LOOKS.** Backend
  (`AttendanceService`): `assertSees` (class teacher of the class, or the school: reads the day's sheet and the register) and `assertMarks` (the class teacher of THAT class or
  section only: `PUT /classroom/attendance` and `PUT /classroom/attendance/student` answer 403 `NOT_CLASS_TEACHER` to everyone else, whatever permission they have); the
  permission `attendance.mark` is now offered to teachers only (not to staff kinds on the Permissions page). The class teacher reads their class's register at
  `GET /classroom/attendance/register?classId&sectionId(id|none, never all)&from&to` (the same sheet as `GET /attendance/students`). Frontend: Attendance > Student
  (`<StudentAttendance />`) has **no click to mark and no Take attendance button** for anyone; "Not taken" is still read there. The class teacher's class page (`/class-work/:id`,
  Attendance tab) shows **the register for their one class (`<StudentAttendance unit canMark />`: no class or section to pick, only the days) above the old day sheet**
  (`AttendancePanel canMark`); the school's view of the tab is the sheet with the marks fixed. **The marking sheet (2026-11-22, the reference pictures):** a search for a child (name, roll or admission number; it only decides who is on screen), **Mark all present** (everyone Present except a child on an approved Leave; the notes go) and **Reset** (back to what the day was when opened) for the class teacher, four short buttons per child **P / A / L / Lv** (a solid colour when lit; the radio's name is still the full word), the note box for Absent / Late, and at the side **Today's summary**: a ring (`AttendanceDonut`: the percentage of the class that came, late counted as there), the four counts and the one orange **Save attendance**. Nothing about the server changed. The mark mutation and the register query live in `classroomApi` (tag "Attendance",
  so the register, the sheet and a save refresh each other). A teacher who is not the class teacher has no Attendance tab.
  This week stays the default; the Filters are how he looks at any other days. The table is `border-separate`, so today's column can have **round corners**: its outline needs `!` colours (`border-x-primary/60!`), because `index.css` sets
  `* { border-color }` unlayered and beats every Tailwind border colour. Seen in a headless Chrome at 1498px.

  **Ninth round (2026-11-23, the "Mark attendance" reference again: "Student attendance ko aisa banao, admin sirf dekh sakta hai, Save mat dikhana"):
  Attendance > Student (`/attendance/students`) is now ONE DAY OF ONE CLASS, not the register.** `pages/attendance/StudentAttendance.tsx` -> `components/attendance/StudentDayAttendance.tsx`:
  a **Date** box (with **Today** / **Yesterday** under it, except while a year that is over is open), a **Class** box and (only for a class with two or more sections) a **Section** box at the top right, kept in the address (`class`, `section`, `date`, so an
  old link with a class still opens it), the "Not taken today" strip above them (a click opens that class for today), and a **Register** link. Under them the school's own
  `AttendancePanel` (`date` given, `title` = the chip's name, "Class 5A"; `canMark` false): one card with "Class 5A · 32 students", **"Class teacher: Mrs. Sunita Rao"** (new
  `classTeacher` in `GET /classroom/attendance`, one extra read in the same request), a search, then every child as a line: roll number (`01`), photo, name and admission number,
  the four marks P / A / L / Lv (fixed), and a note; at the side **Today's summary** (ring + the four counts). **Nothing to save**: no Save, no Mark all present, no Reset, and no
  SMS / WhatsApp / draft controls (the server has none). **Leave:** a child on leave has Lv lit and the words **On leave** beside it (in the note column; a reason, when there
  is one, after it); in the ring and the counts it is its own line (the percentage still counts it as not there, `cameToSchool`). An absence with no reason says **Not informed**.
  **A day nobody took is never shown as everyone Present** (the server's Present is only where a day starts): when `saved` is false the school sees no mark lit, the ring says
  "Not taken", the counts are "–" and a child with an approved leave shows no "On leave" either (leave is a mark once the class teacher has taken the day); a **Sunday** nobody took
  says "Sunday: no school" and a holiday says "Holiday: ...". This is the school's view of a class's day anywhere (`/class-work/:id` too). While a year that is over is open the page
  opens on that year's last day and does not ask who has not taken today's attendance.
  **The old register (this week, a month, a range, the per-child percentage, a name opening its days, the day split) is unchanged and lives at `/attendance/students/register`**
  (`pages/attendance/StudentRegister.tsx`, same `attendance.view` permission; trail Dashboard > Student attendance > Register); the class teacher's own register above the sheet in
  `/class-work/:id` is the same component. The sidebar's Student row stays lit on both addresses.
* **Teacher** (`TeacherAttendance.tsx`): the same range filter and four numbers (Teachers, Present, Late, Absent). **Today** (one day) = each teacher's
  status, **the time they came** and **how late**, and when school starts; more days = a column for each day (P, L, A, H holiday, – off, ? no login) and the
  counts. A teacher's name opens a window: each working day with its status, **time**, how late, and the **log** ("Marked present at 8:42 AM by Meena Singh").
  The sheet **reads again by itself** when a teacher marks (socket event `attendance:teacher`, a quiet push to the school's admins: no bell line, no toast).
* **Staff**: "Staff attendance is coming soon".

## A teacher marks themselves present

The teacher's home has a card **My attendance** (`components/dashboard/MyAttendanceCard.tsx`): today, whether it is marked, the school's hours, and one button
**I am present** (a window then says the time, and how late). The server keeps the exact moment.

* `POST /api/v1/attendance/teachers/me/present` (teachers only): **201** when it makes the mark, **200** when the day was already marked (the first time stays;
  two taps at the same moment are one mark: a unique index and an upsert). Refused: a **holiday** or **a day the school does not run** or the **teacher's own
  off day** (409 `NOT_A_WORKING_DAY`), **school time is over** (409 `SCHOOL_TIME_OVER`: they are absent), no academic year (409 `NO_ACADEMIC_YEAR`).
  `lateByMinutes` = minutes after the school's start (0 = in time; null when no timing is set). It then pushes `attendance:teacher` to the school's admins.
* `GET /api/v1/attendance/teachers/me?date?`: the teacher's own day (status, time, late by, the log, the school's hours, `canCheckIn`, `why` not).

**Absent is worked out, not stored** (`teacher.service.ts dayStatus`; nothing has to run at the end of the day): a mark wins; a day before the teacher **counts** is `before` ("Not joined"). **A teacher counts from the LATER of their `joiningDate` and the day they were added to the app** (2026-11-22: a teacher who joined in 2016 but was added to the app on 21 Nov has no attendance before that: nobody could take it, so those days are Not joined, not Absent; KKR's 10 teachers showed Absent on 20 Nov before this), and **the day they were added counts only if school was still on** (`createdAt` before the day's end time; added at 4 PM, school ends 2:20 PM: that day is `before` too; with no timing the day counts). A joining date still to come holds the start back until then; a school or standard holiday is `holiday`; a day the school does not run (a weekday no timing has; with no
timing set at all, Sunday) or the teacher's own off day is `off`; a teacher the school gave **no login** cannot mark, so their working days are `no_login` (not
counted: a school that logs in only some teachers does not see the rest "absent"); a day that has passed is `absent`; **today is `absent` once school has ended**
(`pending` = "Not yet" until then; with no timing set, today stays pending). The school's hours of a day (`attendance/services/schoolDays.ts`) = the earliest
start and the latest end of the timings that run that weekday. A day marked is kept even if it later becomes a holiday.

* `GET /api/v1/attendance/teachers?from&to` (school admin, principal): every active teacher, every day of the range (`to` stops at today; at most a year), with
  `records` (`status`, `checkedInTime`, `lateByMinutes`, `log`) and a `tally` (`present`, `late`, `absent`, `days`, `percent`: late counts as there).
* `TeacherAttendance` model: one mark per teacher and day (unique), `checkedInAt`, `lateByMinutes`, a `log` of `{ at, action, by, note }`, `academicYearId`.

## The school marks or corrects a teacher's day (added the same day, "any scenario I am missing")

A teacher forgot, the phone was dead, the teacher has no login, or is on leave: the school sets the day. In a teacher's window (the Teacher page, a name) each day has a
pencil: **Present** (with the time they came; left out = now for today, the start of school for a day gone by), **Absent** or **Leave**, and a **note**.
`PUT /api/v1/attendance/teachers/:teacherId/day { date, status, time?, note? }` (school admin, principal; 404 before 400). Rules: not a day to come; **Absent and Leave need a
day the teacher was asked to come** (not a holiday, not a day the school does not run, not their own off day: 409 `NOT_A_WORKING_DAY`); a teacher who came on a holiday can be
marked Present; a teacher who has left cannot be marked (409 `TEACHER_INACTIVE`). The mark **replaces** the day's mark and the **log keeps both** ("Marked present at 8:10 AM by Dev
Patel", then "10:00 AM · Marked by Asha Admin (school): Phone was dead"). A teacher with no login is counted from the day the school marks them. **Leave** is not an absence and
not a present: it is left out of the days that count and the percentage (`tally.leave`). The teacher is **told** (bell, `teacher.attendance`: "Your attendance of 5 Nov is marked
Leave", the note and who did it; not told if they have no login; the one who did it hears nothing), and a teacher cannot tap Present over the school's word (the card says
"On leave: Fever" / "Marked absent by the school"). `TeacherAttendance` now has `mark` (present / absent / leave), `source` (self / school), `note`.

## A teacher reads their own month

The card's **My days** button opens the month (read only: each day that counts, what it was, the time, how late, the log). `GET /api/v1/attendance/teachers/me/month?month=2026-11`
(a teacher, their own; this month when left out; up to today); asked for only when the button is pressed, so the home still makes one read for the card.

## Which classes have not taken today's attendance

`GET /api/v1/attendance/students/today` (school admin, principal): the classes or sections **with children** that have no attendance for today, in the school's order. Only on a
day the school runs (not a holiday) and **once school has started**; nothing before. The Student page shows them as a warning above the classes ("Not taken today": Class 5 - A,
Class 1); a click opens that class for today. A failed read shows no warning.

## 75%

A student or a teacher under **75%** has the percentage in red (`title="Below 75%"`; `utils/attendance.ts LOW_ATTENDANCE_PERCENT`).

## Students: read by the school

`GET /api/v1/attendance/students?classId&sectionId=all|none|<id>&from&to` (school admin, principal): `all` = every section of the class (each child with their
section), or the class itself when it has none. Answer: `label`, `from`, `to` (today at most), `days` (`date`, `weekday`, `holiday`, `taken`), `students` (each with
`records` of the days attendance was taken, with the `reason`, and a `tally`) and a `summary`. **A day nobody took is "not taken", never Present.** A child's
history **follows the child** (what was taken in a class or section they have since left shows in their new class; one mark a day, the last saved).

**The reason** (`classroom` module): a mark of `PUT /classroom/attendance` may carry `reason` (optional, up to 200 letters, trimmed, empty = none; kept only for
absent, late or leave; a child marked present keeps none). It comes back on the day's sheet, on the parent's month, in the parent's bell line ("Asha Verma was
absent: ... Family function") and in this page. The teacher's page (`AttendancePanel`) shows a **Reason (optional)** box beside a child marked Absent or Late.

## Decisions of mine (the user did not choose: change if asked)

* **Late = after the school's start time**, no grace period (the exact minutes are shown: "Late by 12 min"). A grace setting is not built.
* **A teacher cannot mark after school has ended** (that day is Absent).
* A teacher with **no login** is "No login", not absent, until the school marks their days.
* The school's sheet needs no publish step: it reads the marks as they are.
* The Teacher page opens on **This month** like the Student page; **Today** is one click away and shows the times.
* Staff (non-teaching) attendance is not built.

## Leave of the teachers and the staff (2026-11-24)

User: "teacher kal ki chhutti aaj nahi bata sakta; teacher login karega to leave daal sake, aur admin side par reason ke saath application jaisi aa jaye, with status". A
teacher or a staff member applies from their own login; the school answers. Model `StaffLeave` (`attendance/models/StaffLeave.ts`: `kind` teacher|staff, `userId`,
`fromDate`/`toDate`, `reason` up to 300, `status` pending|approved|declined|cancelled, the school's `note`, `decidedBy`; year-bound, tenant-scoped), service
`StaffLeaveService`.

* **The person** (sidebar **My leave**, `/my-leave`; roles teacher, principal, accountant, receptionist, management, staff): `GET/POST /attendance/leaves/mine`,
  `POST /attendance/leaves/mine/:id/cancel`. From today or a day to come (never a day that is over), up to 60 days, a reason; 409 `LEAVE_OVERLAP` with their own
  waiting or approved leave (a declined or taken-back one does not stop a new one). They can take back a waiting leave any time and an approved one until
  it begins (409 `LEAVE_BEGUN` after: ask the school).
* **The school** (Leave & arrangements > Leave requests; school admin and principal): `GET /attendance/leaves?status=pending|all&who=all|teacher|staff` (waiting: the oldest day
  first; all: newest first; `waiting` = how many are waiting) and `POST /attendance/leaves/:id/decide` (`approved` | `declined` + a note). Approve is one click, Decline asks for a note
  (optional). 403 `OWN_LEAVE` (nobody answers their own leave: the principal's is for the school admin), 409 `LEAVE_ANSWERED`, 409 `LEAVE_OVER` (its days are over).
* **Attendance reads it**: a working day inside an approved leave is **Leave**, not Absent, with no mark needed (`dayStatus(... onLeave)`; sheets, "my day" with the reason
  "On approved leave", the month). A Sunday or a holiday inside it stays a day off. A waiting or declined leave changes nothing. A mark the school puts on the day wins.
* **Arrangements read it**: see `docs/timetable.md` (the days to come of an approved leave, the free lists, taking it back). A class teacher's leave also asks who takes her
  class's **student attendance** that day (given to a teacher with a period in that class; `docs/timetable.md`, "A class teacher who is away").
* **Bells**: `staff_leave.applied` (to the people who run the school, opens `/school/arrangements?view=leave`), `staff_leave.decided` (to the person, opens `/my-leave`),
  `staff_leave.cancelled` (to the school), and `timetable.substitute` for the substitute put in or taken off.
* Tests: backend `attendance/__tests__/staffLeaves.test.ts`, `attendance.isolation.test.ts` ("staff leave"); frontend `pages/leaves/__tests__/MyLeave.test.tsx`,
  `pages/school/__tests__/Arrangements.test.tsx` (Leave requests tab), `components/layout/__tests__/navConfig.test.ts`.
* Not built: a leave for a part of a day; leave types or balances (sick / casual), a leave of a teacher who has no login (nobody can apply), a limit on how many
  teachers may be off the same day, a reminder when a leave has waited long.

## Not built (ask when wanted)

* A grace time, half days, check-out time, location or school-WiFi checks (a teacher could mark from home), how early a teacher may mark, an alert to the principal when teachers
  have not marked by a time (needs a background job; none exists), substitutes.
* Leave **requests** for teachers and staff are built (see above); leave balances / types are not.
* A quick-pick list of reasons for an absence (it is free text).
* Staff attendance (its page says so); export of a range to Excel / printing.

Tests: `backend/src/main/attendance/__tests__/` (`teacherAttendance`, `teacherCorrections`, `studentAttendance`, `studentToday`, `teacherAttendance.realtime`, `attendance.isolation`),
`backend/src/main/classroom/__tests__/attendance.test.ts` (reasons), `backend/src/utils/__tests__/clock.test.ts`, `FrontEnd-React/src/utils/__tests__/attendance.test.ts`,
`pages/attendance/__tests__/AttendancePage.test.tsx`, `components/dashboard/__tests__/MyAttendanceCard.test.tsx`, `pages/classwork/__tests__/ClassWork.test.tsx`
(reason box), `pages/parent/__tests__/ChildAttendanceReason.test.tsx`, `components/layout/__tests__/NotificationsBell.test.tsx` (live sheet), `navConfig.test.ts`.
The clock is a seam (`backend/src/utils/clock.ts`: `vi.spyOn(clock, "now")`), so no test waits for a time of day.
