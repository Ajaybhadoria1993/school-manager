# Teaching progress (asked 2026-11-27)

The user (Hinglish, summarised): what a teacher teaches in a class and the homework they give should be visible to the admin and the class
teacher (which teacher, which class, how much, what, what homework), and to the parent for their child, daily. One tab to analyse
teaching, with filters and dates: in which class and subject what is being taught and which topic is going on. The teacher says how many
chapters there are, then each day which chapter they taught.

Asked the same day, after the first version: a planned date per chapter with a "syllabus is behind" alert, a reminder for not writing the
diary, an Excel export, and copying chapters to another section or the next year.

It builds on the class diary (docs/parent-teacher-flow.md phase 4).

## What each person does

| Who | Where | What |
| --- | --- | --- |
| Subject teacher | Class work > Diary | **Add chapters** (total, names, finish by, finished; or **Copy from another section or year**); **Write**: chapter, "Chapter finished", taught, homework |
| Class teacher | Diary, Teaching progress | Everything above for every subject of their class; sees every subject's progress |
| School admin, principal | Teaching progress | Every class; **Reminder** (on or off, and the time) |
| Staff | Teaching progress | Every class, only with the permission `progress.view` (Permissions) |
| Parent | Child's page > Diary | The day's chapter, what was taught, homework; chapters done per subject (not whether they are late) |

A subject teacher sees only their own subjects on Teaching progress.

## Teaching progress (`/teaching-progress`)

Filters: days (opens on today), class, subject, teacher. Five figures: updates, homework given, chapters finished, subjects without an
update, subjects behind schedule (it opens Chapter progress with only those). Three tabs: **Daily updates** (each entry, 25 a page),
**Chapter progress** (each class subject; View lists every chapter with the days it was taught and its planned day), **Teachers** (totals per
teacher). **Export** downloads an Excel of the chosen days and filters: sheets Daily updates, Subjects, Chapters, Teachers (up to 20,000
updates).

* *Updates*, *homework*, *last update* and *without an update* are of the days chosen. *Chapters*, *late* and the *running chapter* are the year's.
* The running chapter is the one taught last, while it is not finished.
* "Teacher" is the subject's assigned teacher; an entry written by someone else says "by ...".
* Rows come from what each class studies now: a subject taken off a class no longer shows its earlier entries here.

## Planned dates and "behind schedule"

* Each chapter may have a **Finish by** day (a day of the session). Planning is optional.
* A chapter is **late** when that day is gone (the day itself is in time) and it is not finished. Finishing it clears it.
* Once a day (at the reminder time) the chapters that have just become late are told in one bell line to the subject's teacher, the class
  teacher and the school (`syllabus.behind`). Each is told once; a new planned day is told again when it goes. This does not depend on the
  diary reminder being on.

## Copying chapters

The Chapters window lists the same subject's chapters of the class's other sections and of any section of the class in an earlier year.
Choosing one **adds** its chapters to the window (a name already there is not added twice); nothing is saved until **Save**. Planned days
come along only from this year's lists; "finished" never does. For a new year: open the section's diary > Chapters > Copy from last year.

## The diary reminder (`diary.reminder`)

* On by default at **4:00 PM** India; the school admin or principal changes it (Teaching progress > Reminder; 12 PM to 9 PM).
* Each teacher gets one bell line with the classes and subjects whose diary of today is not written; it opens the first of them.
* A class with a published timetable: only the subjects it has that day. Without one: every subject with a teacher, not on a Sunday.
* Nobody on a holiday (or a special day without classes), and not a teacher marked absent or on leave, or on their weekly day off.
* The API server asks every 5 minutes (`startReminders` in `server.ts`); once per school per day (`ClassworkReminder.lastRunOn`), nothing
  after 10 PM. **It goes only while the server is running** (a host that sleeps sends it when it wakes, before 10 PM).
* A bell line in the app only: no email, SMS or push.

## API (`/api/v1/classroom`)

* `PUT /syllabus` `{ classId, sectionId, subjectId, chapters: [{ id?, name, done?, plannedOn? }] }` (`classwork.manage`; the subject's
  teacher, the class teacher or the school). One list per class, subject and year, up to 60. `plannedOn` left out = unchanged, `null` =
  none; outside the session `400`. A chapter that was taught is not taken off: `409 CHAPTER_IN_USE`.
* `GET /syllabus/sources?classId&sectionId&subjectId` (`classwork.manage`, may write that subject): the lists to copy from.
* `PUT /diary` also takes `chapterId` (left out = unchanged, `null` = none) and `chapterDone`. A chapter alone is enough to save.
  `404 CHAPTER_NOT_FOUND` for a chapter of another subject. `GET /diary` returns each subject's `chapters` (`plannedOn`, `late`).
* `GET /progress?from&to&classId&sectionId&subjectId&teacherId`, `GET /progress/log?...&page&limit` and `GET /progress/export?...`
  (`classwork.view` or `progress.view`). Up to 366 days; the export `400 TOO_MANY_ROWS` over 20,000 updates.
* `GET|PUT /reminder` `{ enabled, time }` (school admin, principal).
* `GET /parent/children/:id/diary` returns each entry's `chapter` and `progress` per subject.

Models: `Syllabus` (classroom/models/ClassWork.ts), `DiaryEntry.chapterId`, `ClassworkReminder`.

## Decisions (not confirmed by the user)

* Chapters are kept per section and year; copying is by hand from the Chapters window.
* The class teacher gets a bell when another teacher writes their class's diary.
* Writing a diary stays optional; the reminder asks, nothing forces.
* The reminder is on by default for every school.
* Parents are not shown that a chapter is late.

## Not built

Email/SMS/push for the reminder, reminding a teacher a second time, copying many subjects or sections at once.
