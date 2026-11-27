# Profile photos and Settings > School / Personal details (asked 2026-11-27)

The user (Hinglish, summarised): onboarding already takes the school's logo; on step 3, where the person's details are taken, offer an
optional profile photo. After sign-in, Settings has a **School details** tab (change or upload the logo) and a **Personal details** tab (edit
the details). Adding a teacher offers a photo; a signed-in teacher edits their details and photo in Settings. The same for staff.

## What each person does

| Who | Where | What |
| --- | --- | --- |
| School admin, registering | Onboarding > Your profile | **Your photo** (optional) |
| School admin | Settings > School details | Logo (upload, change, remove) and the school's details (the same boxes as School Details) |
| School admin | Settings > Personal details | Photo; name, role in the school, mobile, alternate mobile. Email is read only |
| School | Add teacher, Add staff | **Photo** (optional), saved right after the person is made |
| School | Teacher page, Change teacher, Change staff | See, change or remove the photo |
| Teacher | Settings > Personal details | Photo; name, mobile, gender, date of birth, address, qualification, experience |
| Staff | Settings > Personal details | Photo; name, mobile, gender, date of birth, address (and qualification, experience if they teach) |
| Parent, student, super admin | Settings | Appearance only |

Teachers and staff **only read** their sign-in email, role, employee code, designation and joining date: the school decides them.

The top bar shows the person's photo (their initials without one).

## Rules

* A photo is optional, PNG / JPG / WebP (checked by the first bytes), at most 300 KB; the browser shrinks it to 480 px first. It saves as
  soon as it is chosen (on the Add pages: when the person is added). A photo that fails never undoes the person.
* Never at a public address: it comes as a `data:` address inside the answer to someone who may see it.
* One person, one photo: a staff member who also teaches, and a teacher of two mediums, show the same one on every page.
* With only `teachers.add` / `staff.add`, a photo can be given to someone who has none; replacing or removing takes `edit`.
* A mobile number that is there is not emptied by its owner; a teacher's stays unique in the school. Only changed boxes are sent.
* Details are changed only in an approved school; the photo also during onboarding.
* The logo can now be changed after approval (it was refused before), not while the application is with the platform team; every medium of
  the school shows it.

## Teacher's resume (asked 2026-11-27)

"When a teacher is added we ask for their resume: give an option to upload it."

* Optional. **Add teacher** (saved right after the teacher is made), the teacher's page and **Change teacher** (upload, replace, download,
  remove), and the teacher's own **Settings > Personal details** (also a staff member who teaches). Not for other staff.
* PDF or Word (.pdf, .doc, .docx), checked by the bytes, at most 2 MB. Saved as it is, one per teacher; the same one for a teacher of two
  mediums. Never at a public address: downloaded after sign-in.
* Who: see and download with `teachers.view`, `teachers.add` or `teachers.edit` (like the teacher's page); upload where there is none with
  `teachers.add`; replace and remove with `teachers.edit`; the teacher their own. Other teachers and parents never.
* API: `GET|PUT|DELETE /staff/teachers/:id/resume`, `GET .../resume/file`; `GET|PUT|DELETE /profile/resume`, `GET /profile/resume/file`
  (field `resume`). Model: `TeacherResume`.
* Not built: resumes in the bulk upload, a preview on the screen, older versions.

## API

* `GET|PUT /profile` the signed-in person's details; `GET|PUT|DELETE /profile/photo` (field `photo`).
* `GET|PUT|DELETE /staff/teachers/:id/photo` and `/staff/members/:id/photo`.
* `PUT|DELETE /onboarding/logo` now also for an approved school.

Model: `PersonPhoto` (profile/models), keyed by the record it is of (`user`, `teacher`, `staff`).

## Decisions (not confirmed by the user)

* Which details a teacher or staff member may change themselves (above); the school's own extra fields are not on Settings.
* A change applies at once: nobody approves it and the school is not told.

## Not built

Photos in the teacher and staff lists, photos on the platform team's review page, a photo for parents, changing the sign-in email or the
password from Settings.
