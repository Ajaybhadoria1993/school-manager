# Notifications (live, on a socket)

Built 2026-11-04. Every signed-in person of a school has a bell in the top bar. New notifications arrive at once on a Socket.IO socket, with a toast. They are also kept in MongoDB, so a closed tab misses nothing.

## Who hears what

Rule: the people who run the school (school admin, principal) hear of **everything** that happens in it. **Nobody is told of what they did themselves.**

| Happening | Parent | Teacher | School (admin, principal) |
|---|---|---|---|
| Parent applies for leave | | Class teacher of the child: "Leave request: Asha Verma" | Yes |
| Parent takes a leave back | | Class teacher | Yes |
| Leave approved / declined | Child's parents: "Leave approved: Asha Verma" (with the note) | Class teacher (when the school answered) | Yes (when the class teacher answered) |
| Attendance saved | Only when their child was marked **absent** or **late**, once per change | Class teacher (when the school saved it) | Yes, with the counts |
| Teacher marks themselves present | | | Every open sheet of the school's admins refreshes (a quiet `attendance:teacher` push: **no bell line**, fifty teachers a day would flood it) |
| The school marks or corrects a teacher's day | | The teacher (if they have a login): "Your attendance of 5 Nov is marked Leave", the note, by whom | |
| Diary written / changed | All parents of the class: "Homework in English" | | Yes |
| Test set / taken off | All parents of the class | | Yes |
| Marks entered | Parents of the children whose marks are new or changed: "Asha Verma: 15 / 20 in Mathematics" | | Yes, with the class average |
| Exam scheduled, changed (name, days, school hours), taken off | Everyone | Everyone | Everyone (but the admin who did it) |
| Exam timetable added for some classes | The children's parents of those classes: "Half-Yearly Exam: Class 5 timetable" | The class teacher and the subject teachers of those classes | Yes |
| Exam paper changed / taken away | Parents of the classes it is (still) for; a class taken off it is told it is taken off | Teachers of those classes | Yes |
| Exam marks entered | The parent of a child whose mark is new or changed ("Asha Verma: 42 / 50 in Mathematics", or "was absent") | The class teacher (when the school entered them) | Yes, with the class average |
| Holiday / event added, changed, taken off | Everyone of the school | Everyone | Everyone (but the admin who did it) |
| Class teacher changed | | The new one ("You are the class teacher of Class 5 - A") and the one before | Yes |
| Subject teacher changed | | The new one ("You teach English in Class 5 - A") and the one before | Yes |

A child marked absent or late with a **reason** (2026-11-06) tells the parent the reason too. Saving the same thing again (attendance, diary, marks, an exam, a paper) tells nobody twice. Exams (2026-11-06): `Notify.exam*` in `events.ts`, the audiences `Audience.childrenOfClasses` and `Audience.teachersOfClasses`; a teacher's message names their classes and opens that class's Exams tab (`/class-work/:classId?section=&tab=exams`). Only open logins are told: a parent whose children have all left, or a teacher who left, hears nothing.

## How it works

- **Server**: `backend/src/realtime/socket.ts`. Socket.IO runs on the API's own port at `/socket.io`. The handshake carries the access token (`auth: { token }`). The socket is refused exactly when a request with that token would be, and the refusal's message is the error code (`TOKEN_INVALID`, `ACCOUNT_DISABLED`, ...). Each socket joins only `user:<id>`.
- **Model**: `Notification` (school-owned, tenantScope), one document per person. It is deleted after 90 days (TTL index).
- **Sending**: `backend/src/main/notifications/services/events.ts` (`Notify.*`) is called by the services after the action is saved. The people are looked up and told **after** the answer has gone (`NotificationService.later`), so a class of forty parents does not slow a Save. A failure is logged and never fails the action.
- **API** (`/api/v1/notifications`, any signed-in person):
  - `GET ?limit=&before=` returns `{ items, unread, hasMore }`, newest first.
  - `POST /:id/read` and `POST /read-all` return `{ unread }`. Every open tab of that person hears `notifications:unread`.
- **App**:
  - `hooks/useLiveNotifications.ts` runs in `MainLayout`. It puts a new notification on top of the bell's cache, shows a toast, and refreshes only the part of an open page it concerns (a parent's leave list, diary, tests, attendance, exams; a teacher's leave requests, classes, a class's exams and marks sheets; the school's exam list and page). A page being filled in (attendance) is not reset.
  - `realtime/notificationSocket.ts`: when the token is old it refreshes it like a request does and connects again; a closed account is not retried.
  - The Vite dev server forwards `/socket.io` (with `ws`).
  - The bell reads the server once when the app opens, then never polls.

## Not built yet

- **Several API instances**: they need the Socket.IO Redis adapter, so a push reaches sockets held by another process. One instance needs nothing.
- **Phone push (mobile app)**: needs FCM / APNs. The same `Notify.*` calls are the place to add it.
- **Platform super admin**: has no bell.
- **Saving a whole allotment list** (the timetable's bulk save) tells nobody. Only the one-subject change and the teachers box's Save on Timetable & teachers do (a new main teacher: `subject.assigned` "You teach ..."; a new backup teacher: `subject.assigned` "You are the backup teacher of ...").
- **Not notified yet**: a published timetable, and a student admitted or moved.
