# Timetable: hand-off of the 2026-11-03 session

For a new Claude Code session that continues (or touches) the timetable, and for Anuj. The full description of the module (API, rules,
decisions) is `docs/timetable.md`; this file says **what changed in this one long session, why, where it is, and what is still open**.
Nothing of it is committed (branch `anuj-dev`, the working tree holds it all).

## Read first
`docs/timetable.md`, `FrontEnd-React/CLAUDE.md`, `backend/CLAUDE.md`, and the memory note `project-timetable` (it has one paragraph per round
below). The React app is `FrontEnd-React/` (the Next.js `frontend/` is left untouched). Anuj speaks Hinglish; answer in Hinglish, technical
words in English.

## State
* FE: `cd FrontEnd-React && npm test && npm run typecheck && npm run lint && npm run build`: 714 tests in 49 files, lint 0 errors (10 old
  warnings), build fine.
* BE: `cd backend && npm test` (needs the docker Mongo, own `school_erp_test` DB): 672 tests in 46 files at the last full run (the later
  rounds were frontend only).
* The user's servers: API 5000 runs `tsx watch` (reloads itself), app 5173 is Vite (hot reload). No restart was ever needed.

## What was built (six rounds, in order)

### 1. Click a period, type the subject (class timetable grid)
* Before: pick a subject in a box above the week (a "brush"), then click periods; an Eraser. Now: **click a period and a box opens beside
  it** (`components/timetable/PeriodPicker.tsx`): type the first letters, Enter or click. Class subjects first (with `3/6` placed and the
  teacher), then the school's others, then the usual presets (`SUBJECT_PRESETS`, added to the school when picked), then "Add “x” as a new
  subject". A subject whose usual teacher is off that day or busy then says so in red (can still be picked). A period that has a lesson
  opens the same box (+ **Teacher & room** = the old `LessonDialog`, + **Take it out**). Picking the subject a period already has changes nothing.
* Brush, Eraser and the Subject card are gone. `GridTable` takes `openKey` and `onCell(day, period, button)`; `ClassWeek` owns `picking`/`put`/`choose`/`createSubject`.
* Pure helpers in `utils/timetable.ts`: `subjectChoices`, `matchChoices` (starts-with, then word-starts, then contains), `teacherTrouble`, `PRESET_PREFIX`.
* The box is HeroUI `Popover.Content` used on its own (`isOpen`, `triggerRef`; do NOT wrap it in the `Popover` root, that warns about a
  PressResponder with no trigger). Non-modal on a desktop (next period clickable at once), modal and without autofocus under 640px.

### 2. Periods per day (a class's own periods) + backend
* The confusing **Periods & teachers** button is gone. **Periods per day** (`ClassPeriodsDialog.tsx`, `utils/classWeek.ts`): − n + for each
  weekday (0 = no school), "Same on every school day", "Back to the school's periods", weekly total. Changes only that class (every
  section); a day left alone keeps following the school/department. Rows are made from the number (`withPeriods`, `rowsFor`); only days that
  differ from what the class follows anyway are sent.
* Backend: `PUT /timetable/class-day` (`ScheduleService.replaceClassDay`, schema `classDaySchema`): the class's own timings = scope "only",
  exactly that class, no department, named after the class; the call replaces the class's whole own set (no days = follow the school).
  **Precedence changed** (`scheduleRules.ts` `specificity`): all/except 1 < department 2 < named classes 3 (before, department and class
  were on one level and clashed). A lesson in a period that goes: `LESSONS_IN_REMOVED_PERIODS` (409, names sections and counts) unless
  `removeLessons: true` (then cut from every section, timings saved first). `MAX_SCHEDULES` 30 -> 60. Orphan check split into
  `findOrphans` / `orphanError` / `lessonsError`.
* Tests: `backend/.../__tests__/classDay.test.ts` (18), rule tests in `scheduleRules.test.ts`, an isolation probe, the limit test;
  FE `classWeek.test.ts`, `TimetableClassPeriods.test.tsx`.

### 3. Page header
* `pages/school/Timetable.tsx`: the **two tabs are in the header** at the right of the title (same segmented style as the School Class
  page). The **Subjects (n) / Teachers (n) buttons, the subtitle and the line of help under the Fill buttons are gone**.
* `Fill the empty periods` is no longer disabled: with no subject periods it opens the periods-a-week editor (`ClassSubjectsEditor`);
  with unsaved changes it says to save first. Its old entry (the "change periods a week" link) was removed with the help line.

### 4. School timings tab simplified
* **"Timings for a few classes" and `TimingDialog.tsx` deleted.** A class's own periods are set on its timetable (round 2).
* `DayFields.tsx`: School starts, Each period and Assembly in **minutes** (`MinutesBox`: "min", and from 60 "= 1 hr 30 min"), Periods in the
  day, then **Lunch** and **one Short break**, each "[from] to [to] N min".
* `utils/timings.ts`: `DaySetup.shortBreaks[]` (after period N) replaced by `breakStart/breakEnd`; `generateDay` treats lunch + short break
  as fixed-time breaks sorted by time (periods are cut to fit and a note says so); new `formatMinutes`, `setupProblems` (both times, end after
  start, no overlap); `setupFromSlots` keeps the FIRST break of a hand-made day; `schoolWeek.ts` `daySummary`/`weekProblems` follow.
* Kept on purpose (Anuj asked for them earlier): the "Timing for" department selector and Days of the week (Usual / Different / Holiday).

### 5. Unsaved changes are asked about (School timings)
* `SaveFirstModal` in `SchoolTimingsTab.tsx`: Cancel / Don't save / **Save and continue**, when another group under "Timing for" is
  picked, or the tab/page changes (`useBlocker`) or the page reloads, with changes in the week being edited. `WeekEditor` keeps a
  `Draft {changed, problem, save}` ref for the tab; `save()` answers why it failed; a week nobody touched is not a change.

### 6. Department view
* The grey strip above a department's card is gone. The department's **classes are chips** (`ClassChips`, `<ul aria-label="Classes in X">`)
  in the card header and in the "follows the school's timing" card ("No classes in it yet" when empty); "Use the school's timing again" /
  "Cancel" moved into the card header (`WeekEditor` props `classes`, `actions`); a new timing shows "Not saved yet"; the Timing-for cards
  say "5 classes · Own timing".

## Open points and things Anuj was told
1. **Teachers cannot be added from any screen now.** Nothing links to `/school/timetable/teachers` (the page and route still exist; the
   sidebar has no Teachers entry). Offered: an "Add a teacher" inside the Teacher & room window.
   **Resolved later the same day:** a **Teachers** entry under Manage school, Add teacher in four steps with a login, one teacher's page and a
   change form (`docs/teachers.md`). The old address now redirects to `/school/teachers`; `TimetableTeachers.tsx` and `TeacherDialogs.tsx` are gone
   (their list, Week, Give classes, Has left and Bring back moved to `pages/school/Teachers.tsx`).
2. The subjects page `/school/timetable/subjects` is linked only from `ClassSubjectsEditor`.
3. Editing a subject's periods a week later has no button: the editor opens from Fill only when no subject has periods.
4. Multi-class named timings (made earlier with the deleted dialog) are invisible and unmanageable from the UI; the backend still resolves
   them (a class's own day clashes with one that already covers it: `SCHEDULE_CLASH`).
5. Periods per day has no "apply to the whole department/school" (it links to School timings for that).
6. Seconds are not supported (minutes and hours only); only one short break; the default of 8 periods still comes from the usual day.
7. Periods per day box scrolls inside on windows about 800px high or less (header and Save stay).
8. The old browser journeys (`j15`...) were never updated for the one-page timetable (stale since 2026-11-01).

## How it was checked (and how to do it again)
* Unit and page tests as above. Page tests stub `fetch` (`src/test/fakeApi.ts`, fixtures `src/test/timetableFixtures.ts`).
* **Real Chrome with the API mocked** (nothing reaches the backend or the DB): Playwright-core drives Anuj's own Vite on 5173 and answers
  every `/api/v1/**` call with `page.route`. Cookies `school_erp_token`, `school_erp_refresh`, `school_erp_remember` on the app origin and a
  mocked `GET /auth/me` (approved school_admin) get past the login. Scripts (session scratchpad, may be gone):
  `C:\Users\anujb\AppData\Local\Temp\claude\e--School-school-manager\7dae19d5-7a03-436a-8c51-4a1f846f6cc2\scratchpad\`
  `popover-journey.mjs`, `periods-journey.mjs`, `timings-journey.mjs`, `dept-journey.mjs` (`PHONE=1` for a phone, `W`/`H` for the window).
  Playwright-core is in `...\dbabdec8-2173-425a-abfd-c5a23175b3f8\scratchpad\node_modules`, Chrome at
  `C:/Users/anujb/AppData/Local/Google/Chrome/Application/chrome.exe`.
* Gotchas met: a non-modal popover closes on any page scroll and on blur (Chrome fires `focusout` when the old box unmounts, jsdom does not:
  the box's `onClose` must only close its own period); Playwright's `click()` scrolls first, use `page.mouse.click` at the box centre after
  `scrollIntoViewIfNeeded` + a short wait; never `scrollIntoView` inside a popover.

## Environment gotchas (this machine)
* The Bash tool breaks heredocs that contain apostrophes or backticks: write scripts with the Write tool, then run them. Python is not installed (use node).
* Run the FE and BE suites one at a time. No Prettier in this repo. `dist/` is ignored.

## How Anuj likes it (seen again and again this session)
Simple and clean: **no helper text, no subtitles, no extra buttons or clicks**; things that are used together live together (a subject is
added where it is used); a visible layout change when he asks for UI/UX; real-browser proof; "do not break any other functionality"; no
commits unless he asks.
