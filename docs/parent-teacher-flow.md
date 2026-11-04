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
  school; `pages/calendar/CalendarPage.tsx` (month by month; Add holiday or event / pencil / bin for the people who run the school),
  `components/calendar/EventDialog.tsx`, `classroomApi`, and **`components/ui/ResultModal.tsx`** (`useResultModal`: done / failed
  window with one OK, for every action of this flow).
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
