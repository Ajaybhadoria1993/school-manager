# Attendance (menu entry under Teacher), asked 2026-11-06

The user (Hinglish, summarised): a new menu entry **Attendance** under **Teacher**, with three tabs: **Student**, **Teacher** and **Staff** (Staff is
"coming"). **Student**: filters in every way: every class by name; click a class (or a section of it) and the list of its students comes, with who
was present and who was absent. When a child does not come, the teacher takes the attendance and may give a **reason**. The school admin can see
**any class's** attendance, today's or from earlier, with a **date filter** (May to November, say), **this month to start with**. **Teacher**: nobody takes
it: the teacher **marks themselves present in the app**, so the sheet says Present; a teacher who does not is **Absent when school time ends**; as soon as
they mark, the details come to the school's sheet: **when, at what time, a log**: not only Present or Absent, **the time matters**.

## The page (`/attendance`, `pages/attendance/AttendancePage.tsx`)

Menu: **Attendance** right under **Teacher** (school admin, principal; `nav-config.ts`). Tabs in the address (`?tab=student|teacher|staff`).

* **Student** (`components/attendance/StudentAttendanceTab.tsx`): chips with every class by name (the first is picked to start with); a class with sections
  shows **All sections, A, B...** under them. Then the **From / To** boxes and **Today, This month (default), Last month, Last 3 months**
  (`RangeFilter`; `utils/attendance.ts rangePresets`). Four numbers (Students, Attendance %, Absent, Late), then the table: roll, student, **a column for each
  day up to a month** (P present, A absent, L late, Lv leave; a dot on a mark that has a **reason**; a day nobody took is empty and its heading says
  "attendance not taken"; a holiday's heading says which), then the child's counts and %. **A longer range shows the counts only.** A child's name opens a window
  with their counts and each day they were not Present with the **reason**. Everything picked is kept in the address (`class`, `section`, `from`, `to`).
* **Teacher** (`TeacherAttendanceTab.tsx`): the same range filter and four numbers (Teachers, Present, Late, Absent). **Today** (one day) = each teacher's
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

**Absent is worked out, not stored** (`teacher.service.ts dayStatus`; nothing has to run at the end of the day): a mark wins; a day before the teacher joined
(`joiningDate`, or when they were added) is `before`; a school or standard holiday is `holiday`; a day the school does not run (a weekday no timing has; with no
timing set at all, Sunday) or the teacher's own off day is `off`; a teacher the school gave **no login** cannot mark, so their working days are `no_login` (not
counted: a school that logs in only some teachers does not see the rest "absent"); a day that has passed is `absent`; **today is `absent` once school has ended**
(`pending` = "Not yet" until then; with no timing set, today stays pending). The school's hours of a day (`attendance/services/schoolDays.ts`) = the earliest
start and the latest end of the timings that run that weekday. A day marked is kept even if it later becomes a holiday.

* `GET /api/v1/attendance/teachers?from&to` (school admin, principal): every active teacher, every day of the range (`to` stops at today; at most a year), with
  `records` (`status`, `checkedInTime`, `lateByMinutes`, `log`) and a `tally` (`present`, `late`, `absent`, `days`, `percent`: late counts as there).
* `TeacherAttendance` model: one mark per teacher and day (unique), `checkedInAt`, `lateByMinutes`, a `log` of `{ at, action, by, note }`, `academicYearId`.

## The school marks or corrects a teacher's day (added the same day, "any scenario I am missing")

A teacher forgot, the phone was dead, the teacher has no login, or is on leave: the school sets the day. In a teacher's window (the Teacher tab, a name) each day has a
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
day the school runs (not a holiday) and **once school has started**; nothing before. The Student tab shows them as a warning above the classes ("Not taken today": Class 5 - A,
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
* The teacher tab opens on **This month** like the student tab; **Today** is one click away and shows the times.
* Staff (non-teaching) attendance is not built.

## Not built (ask when wanted)

* A grace time, half days, check-out time, location or school-WiFi checks (a teacher could mark from home), how early a teacher may mark, an alert to the principal when teachers
  have not marked by a time (needs a background job; none exists), substitutes.
* Leave **requests** for teachers (the school sets Leave by hand for now).
* A quick-pick list of reasons for an absence (it is free text).
* Staff attendance (the tab says so); export of a range to Excel / printing.

Tests: `backend/src/main/attendance/__tests__/` (`teacherAttendance`, `teacherCorrections`, `studentAttendance`, `studentToday`, `teacherAttendance.realtime`, `attendance.isolation`),
`backend/src/main/classroom/__tests__/attendance.test.ts` (reasons), `backend/src/utils/__tests__/clock.test.ts`, `FrontEnd-React/src/utils/__tests__/attendance.test.ts`,
`pages/attendance/__tests__/AttendancePage.test.tsx`, `components/dashboard/__tests__/MyAttendanceCard.test.tsx`, `pages/classwork/__tests__/ClassWork.test.tsx`
(reason box), `pages/parent/__tests__/ChildAttendanceReason.test.tsx`, `components/layout/__tests__/NotificationsBell.test.tsx` (live sheet), `navConfig.test.ts`.
The clock is a seam (`backend/src/utils/clock.ts`: `vi.spyOn(clock, "now")`), so no test waits for a time of day.
