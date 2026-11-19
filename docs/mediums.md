# Mediums: one school, each medium on its own

A school can teach in more than one medium, for example English from 8 to 2 and Hindi from 12 to 5, or CBSE and the M.P. Board side by
side. Each one runs on its own: its own classes, students, timetable, attendance and exams. People still see one school.

## Onboarding

The form has four steps, then the platform team's check (Verification):

1. **School details**: the school (name, type, logo, size, UDISE+ code, year established), where it is (location) and how to reach it (contact).
2. **Academic year**: the year's dates, then the boards, the mediums of each, and for each medium its classes and timing.
3. **About you**: the person registering, who becomes the administrator.
4. **Review and submit**.

The API keeps the answers by topic (`steps[1]` the school, boards and year; `steps[2]` the address; `steps[3]` the person), which is what the review
pages read. The two save requests are different: `PUT /onboarding/steps/1` takes the school **and** the address (`step1Schema`),
`PUT /onboarding/steps/2` takes the academic year and the boards (`step2Schema`), so a step saves only its own answers. `missingSteps` is
judged from what is stored, not from `completedSteps`. A school that was part-way through before this change is told which step is missing
when it submits.

In step 2, under each board, every medium chosen opens its own card:

- classes from and up to, and a class per stream in 11 and 12;
- **streams**: Science, Commerce, Arts and Maths, and any the school names itself (up to 8, a name of 2 to 30 letters, each once whatever the
  case). A stream is a class of its own: "Class 11 Maths", "Class 12 Agriculture". The next year's promotion keeps a student in the same
  stream (`classAfter`);
- the sections and seats of every class: up to 26 sections (one for each letter A to Z), up to 200 seats in a section and 2000 in a class in all;
  a class can have no sections, and then its seats are the class's own. The card shows each class's seats in all and the whole plan's total;
- school days and the usual day (start, period length, periods, assembly, lunch, short break), and Saturday's own timing;
- "Copy from..." starts a medium from another one's answers. It only fills the boxes: the two stay separate.

The school's logo is in step 1 (PNG, JPG or WebP, up to 500 KB, checked by its first bytes; SVG is refused because it can carry a script). It
saves on its own, as soon as a picture is chosen.

`boards[].plans[]` is checked by `onboarding/schemas/mediumPlan.schemas.ts` and saved in `Tenant.profile.boardEntries[].plans`. A school that had
saved its boards before plans existed must fill them in again before it can submit.

## How the sides work

Every record in the system already belongs to one school through `tenantId`. So each medium is simply a `Tenant`:

- the first medium is the school's own record;
- each other medium is a record with `parentTenantId` pointing to the school and `medium: { key, label }`.

Nothing else needs to know: every query of every module stays on one side. A school with one medium has no extra record at all.

**Moving between sides.** The administrator's requests carry `X-School-Medium: <side id>`. `requireAuth` (`middleware/auth.ts`) checks that
it is a side of their own school and sets `req.user.tenantId` to it for that request. Anything else is refused (403 `MEDIUM_NOT_FOUND`)
rather than ignored, so nothing is ever read or written on the wrong side. Only `school_admin` can move. `/auth/me` and `/onboarding` use
the loose guard, so they are always about the school itself. `GET /auth/me` lists the sides in `tenant.mediums`.

**In the browser.** `MediumSwitcher` in the top bar (only when there are two or more sides). `redux/slices/mediumSlice.ts` holds the open
side per tab, `baseQueryWithReauth` sends the header, and `mediumMiddleware` drops everything read so far and closes a past year that was
open. Moving goes to the dashboard, because a class open on one side means nothing on the other.

## Approval

`ReviewService.approve` calls `MediumService.setUp`:

1. the first medium's classes, sections, seats and timing are built on the school's record;
2. each other medium gets its record, its running academic year, and the same.

A failure never undoes the approval. A side that could not be made is made the next time the administrator's session is read, and the
sides that exist are left alone. A school approved from a form without plans gets its classes from its one range, as before.

## One school to the platform

- The super admin's list, counts and overview only see records with no parent.
- Suspending or reactivating the school does every side, and signs out everyone on every side.
- `to: "admins"` notifications of a side also reach the school's administrator, not the principals of the other sides.

## What is per side, and what follows from it

Staff, students, parents, the academic year, the calendar and the student and teacher field settings all belong to one side.

- A parent with children in two mediums has one login per side, because a username is unique across the platform. **Not built:** one parent
  login across sides.
- Next year, promotion and closing a year are done side by side.
- The bell shows the side that is open; a live notification from another side still pops up.

## A teacher in two mediums: one login

A teacher has a record on each side they teach in, because their classes, timetable and attendance are that side's. Every record points to the
same login (`Teacher.userId`), which belongs to one side (`User.tenantId`). Code: `staff/services/teacherMedium.service.ts`.

- **Adding.** On the teacher's page, the card "Teaches in" (school admin only, and only in a school with more than one medium) has Add beside
  each other medium: `POST /staff/teachers/:id/mediums`. Name, mobile, email and job details are copied. Subjects, limits, days off and the
  school's own fields start empty, because they belong to a side. A record on that side with the same mobile and no login is joined instead.
  The teacher needs a login first.
- **Moving.** `tenant.mediums` lists the mediums they teach in, their login's own first, and only when there are at least two. The same switch
  in the top bar sends `X-School-Medium`, which `requireAuth` accepts only if they have an active record on that side.
- **No second login.** A login for a mobile number that already has one on another medium is refused (`TEACHER_LOGIN_IN_OTHER_MEDIUM`, under
  the mobile box), in Add teacher, Make a login and the bulk upload.
- **Changes.** Name, mobile and email changed on one side change on the others. Username and password are the one login's.
- **Leaving.** Leaving one side keeps the login open while they teach on another. If the login belonged to the side they left, it moves to one
  where they still teach. Leaving the last side closes it. To take a teacher off a medium, open that medium and use Has left there.

## Promotion and streams

`classAfter` (`students/classNumber.ts`): Class 11 Science moves up to Class 12 Science even though Class 11 Commerce stands right after it.
Class 12 has nowhere to go. Class 10 goes to the first stream of Class 11, and the school can change it on the promotion list.
