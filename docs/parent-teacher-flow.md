# Parent and teacher daily flow (asked 2026-11-04)

The user (Hinglish, summarised): the parent sees the child's **attendance**, **performance**, the school's **functions, activities and
holidays**, and **applies for leave** for the child so the teacher and the admin know why the child is not coming. The teacher sees the
**classes the admin assigned** and writes the class's details: **which topic is going on, what was taught today, the homework, when the
test is**; the admin sees it and the parent understands it too. "Keep the flow simple in UI/UX and in what it does; on the parent's and
the teacher's side everything in 1 or 2 clicks; show a proper modal with every action."

## Decisions (mine; the user did not choose: change if asked)

* **Calendar**: the school admin / principal adds a **Holiday** or an **Event** (a function, an activity) for a day or a few days, with a
  note. Everyone of the school sees it (teachers and parents too). A holiday is not a school day for attendance.
* **Leave**: the parent applies for the child (from, to, reason; Today / Tomorrow in one click). The child's **class teacher** and the
  admin see it and **Approve** or **Decline** it in one click; the parent sees the answer. A pending one can be taken back by the parent.
  An approved leave shows as *Leave* when attendance is taken.
* **Attendance**: taken once a day for a section (or a class without sections) by its **class teacher** or the admin: everyone is
  Present to start with, a click makes a child Absent / Late (approved leave is already Leave); one Save. Not on a holiday, not in the
  future. The parent sees the month and the whole year's percentage.
* **Diary**: for each subject a teacher teaches in a class (or any subject, for the class teacher), per day: **Taught today** (the topic)
  and **Homework**. The parent sees their child's class's diary, the admin any class's.
* **Tests and marks (performance)**: the subject's teacher (or the class teacher) puts a test on a date (subject, topic, out of how many
  marks): parents see it as an upcoming test. After it, the teacher enters each child's marks (or absent); the parent sees the marks,
  the percentage and the average.
* **Teacher's home**: *My classes* (class teacher of, and the classes they teach a subject in); a class opens its workspace with
  Attendance (class teacher only), Diary, Tests and Leaves (class teacher only).
* **Modals**: every action ends in a modal that says what happened (saved, sent, approved) or why not, with one OK. Toasts are not
  enough here (the user asked).

## Phases (each: backend + tests + isolation probe, frontend + tests, real Chrome)

1. Calendar (holidays and events) and the result modal.
2. Leave applications.
3. Attendance.
4. Diary (taught today, homework).
5. Tests and marks.

Progress is written at the end of this file.

## Progress

* **Phase 1 done (2026-11-04)**: `CalendarEvent` (backend `main/classroom/`, `/api/v1/classroom/calendar`: GET for everyone of the
  school, POST / PATCH / DELETE for school admin and principal; `from` / `to` give what touches those days), tests
  `classroom/__tests__/calendar.test.ts` + `classroom.isolation.test.ts`, test school `src/test/classroom.ts` (`classroomSchool`: Class
  5 - A with Asha (father Ravi) and Kabir (mother Sita), Class 1 with Mira (father Anil), Meena class teacher + Maths of 5 - A, Dev
  English of 5 - A, Kiran nothing; every one with a login and a token). Frontend: menu *Calendar* (`/calendar`) for everyone of the
  school; `pages/calendar/CalendarPage.tsx`, `components/calendar/EventDialog.tsx`, `classroomApi`, and
  **`components/ui/ResultModal.tsx`** (`useResultModal`: done / failed window with one OK, for every action of this flow).
  **Calendar redesign (2026-11-05)**: the page is a real calendar. *Month* = grid of days, Sunday first, holidays (red) and events
  (blue) as bars (a few days = one straight bar, at most 3 rows a day then "+N more"); *Year* = 12 small months with the days marked,
  a month's name opens it; arrows (month / year), Today, counts, Month | Year switch; beside it the list "Holidays & events" of what is
  shown (the year grouped by month) with pencil and bin. A click on a day: school + empty day = the Add window with that day already
  in; otherwise a window with what is on the day (school: pencil, bin, Add for that day; teacher / parent: read only). The server is
  asked once per year (`GET ...?from=<year start - 7 days>&to=<year end + 7 days>`), so moving between months asks for nothing.
  Pieces: `utils/calendar.ts` (monthGrid, weekLanes / visibleLanes, dayKinds, yearRange...), `components/calendar/` (MonthGrid,
  YearGrid, CalendarToolbar, EventList, EventRow, DayDialog, look.ts). Calendar year (Jan to Dec), not the school's academic year.
  **Standard holidays (2026-11-05, asked: "the calendar should have the holidays a calendar at home has, Diwali and the national days;
  the school adds or takes off by itself, but the national ones stay")**: every school's calendar starts with the Government of
  India's gazetted holidays (DoPT list, 17 a year: Republic Day, Holi, Id-ul-Fitr, Ram Navami, Mahavir Jayanti, Good Friday, Buddha
  Purnima, Bakrid, Muharram, Independence Day, Milad-un-Nabi, Janmashtami, Gandhi Jayanti, Dussehra, Diwali, Guru Nanak Jayanti,
  Christmas). They are not stored per school: `backend/src/main/classroom/data/standardHolidays.ts` holds them (2026 and 2027 as the
  Government published; every other year only the days that never move: 26 Jan, 15 Aug, 2 Oct, 25 Dec; **add the next year's list there
  each July**, when DoPT publishes it). `GET /classroom/calendar?from=&to=` (both days) returns them among `items`, each with a
  `source`: `school` (the school's own record), `national` (Republic Day, Independence Day, Gandhi Jayanti: always on) or `festival`
  (the rest); without both days only the school's own come. A holiday the school put on with the same name over that day takes the
  standard one's place. A school that does not close for a festival takes it off: `PUT /classroom/calendar/standard/:key` `{ shown }`
  (school admin / principal; key like `2026-11-08-diwali`; national: 409 `HOLIDAY_LOCKED`; unknown: 404 `HOLIDAY_NOT_FOUND`), kept in
  `HiddenHoliday` (one row per school and key) and returned as `hidden` so it can be brought back (the page: bin on a festival, "Taken
  off (n)" under the list with "Bring back"). Everyone of the school hears of it (bell). **Attendance** is not taken on a standard
  holiday the school has not taken off (`CalendarService.holidaysBetween`), a national day always. The moon-dependent ones (Eid,
  Muharram) can differ by a day by state (the Government moved Bakrid 2026 from 27 to 28 May): the school takes the day off and
  adds its own. Tests run with the standard holidays off (`STANDARD_HOLIDAYS=off` in vitest.config.mts) so "today" is never a
  national holiday to them; `calendar.test.ts` "the standard holidays" switches them on. Which are national (locked) is a choice
  of mine: Diwali and the other festivals the school may take off; to lock one, change its `source` in the data file.
* **Phase 2 done**: `LeaveRequest` (child's class kept at sending; `appliedBy` "Ravi Verma (Father)"). Parent:
  `GET|POST /parent/children/:id/leaves`, `POST /parent/children/:id/leaves/:leaveId/cancel` (pending only). School:
  `GET /classroom/leaves?status=pending|all` (a teacher sees the classes they are class teacher of; school admin / principal all),
  `POST /classroom/leaves/:id/decide { status, note? }` (class teacher of that class or the school; once: `LEAVE_DECIDED`;
  `NOT_CLASS_TEACHER`). `ParentService.childOf` is now public (every parent read and write starts there). Frontend: menu *Leave
  requests* (`/leaves`, teacher / admin / principal: Waiting | All, Approve one click, Decline asks a note), parent child page
  `components/parent/ChildLeaves.tsx` (Apply for leave window, list with Waiting / Approved / Declined / Taken back, Take back).
* **Phase 3 done**: `AttendanceDay` (one per class/section/day, unique). `GET /classroom/attendance?classId&sectionId|none&date` (a day
  not saved: all Present, approved leave = Leave; `holiday`), `PUT /classroom/attendance` (class teacher or the school; not a holiday:
  `HOLIDAY`; not ahead; `NOT_IN_CLASS`; missing children = present), `GET /classroom/my-classes` (teacher: class teacher of + teaching
  units with subjects, `access.ts myClasses`), parent `GET /parent/children/:id/attendance?month` (days, monthTally, year; late counts
  as there). Frontend: teacher home *My classes* (`components/dashboard/MyClasses.tsx`) -> `/class-work/:classId?section=`
  (`pages/classwork/ClassWorkPage.tsx`, `components/classwork/AttendancePanel.tsx`: Today / Yesterday, Present / Absent / Late / Leave
  per child, Save attendance -> window with the counts); parent `components/parent/ChildAttendance.tsx` (year %, month days, arrows).
* **Phase 4 done**: `DiaryEntry` (one per class/section/day/subject: `taught`, `homework`, `writtenBy`). `GET|PUT /classroom/diary`
  (a subject's teacher writes their subject, the class teacher and the school every subject: `NOT_THEIR_SUBJECT`; not ahead), parent
  `GET /parent/children/:id/diary?date`. Frontend: Diary tab (`components/classwork/DiaryPanel.tsx`: a card per subject, Write ->
  window "Taught today" / "Homework" -> "Diary saved"); parent `ChildDiary` (day arrows).
* **Phase 5 done**: `ClassTest` (subject, day, topic, out of, marks per child or absent). `GET|POST /classroom/tests`,
  `GET|DELETE /classroom/tests/:id`, `PUT /classroom/tests/:id/marks` (not before the test day: `TEST_NOT_HELD`; average leaves out
  the absent), parent `GET /parent/children/:id/tests` (coming tests, results with %, average). Frontend: Tests tab
  (`components/classwork/TestsPanel.tsx`: Add a test with Today / Tomorrow / In a week, Enter marks with absent ticks -> window with
  the class average, Take away); parent `ChildTests`; the school reaches a class's work from its School Class page (*Class work*).
  The child's page puts the day first (diary, tests, attendance, leave, timetable), the child's details after.
  Checked in real Chrome (`flow-r9.mjs`, 18/18).
* **Exams (2026-11-06)**: the school's own exams (Half-yearly, Annual, unit tests...) are a separate module with their own page, marks and
  results, shown to the teachers in the **Exams tab** of a class's work and to the parents on the child's page, with bell notifications, and
  the class's week gives way on exam days: docs/exams.md. The teacher's own `ClassTest` above is a different thing (a teacher's quick test
  for one class).
* **Attendance page for the school (2026-11-06)**: the school reads the students' attendance of any class for any days (with the **reason** a teacher may give for an
  absence) and the teachers' own attendance (self-marked, with the time): docs/attendance.md.
* **Not built**: the school's own *Add a test* (it has no subjects of its own on the Tests tab); a teacher setting a test for a
  subject they do not teach. Live notifications for all of this: docs/notifications.md (2026-11-04).
