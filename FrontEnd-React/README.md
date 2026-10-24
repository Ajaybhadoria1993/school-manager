# EduShiksha web app: React version

The same app as [`../frontend`](../frontend) (Next.js), rebuilt as a **React + TypeScript + Vite** single-page app with
**Redux Toolkit / RTK Query**, laid out like the Infinity Medisetu web app. Same screens, same look, same behaviour, the
same backend (`../backend`, unchanged). The Next.js app is untouched and keeps working.

| Layer | Choice |
| :-- | :-- |
| UI | React 19, TypeScript, Tailwind CSS v4, HeroUI v3 (the dropdowns and the review page), lucide icons |
| Build | Vite 7 |
| Routing | React Router 7 (data router, every page is its own lazy chunk) |
| State and API | Redux Toolkit, RTK Query (one API slice per backend feature) |
| Fonts | Plus Jakarta Sans and Merriweather, bundled with `@fontsource` (nothing loads from Google) |

## Run it

```bash
# backend and MongoDB as described in ../README.md (the API on http://localhost:5000)
cd FrontEnd-React
npm install
npm run dev          # http://localhost:5173
```

In development the Vite server forwards `/api` to `http://localhost:5000`, so the browser only ever talks to
`localhost:5173` (no CORS to configure). Use `VITE_DEV_API_TARGET=http://localhost:5001 npm run dev` if the backend runs
elsewhere.

**Links in emails:** the backend builds them from `CLIENT_URL` in `backend/.env` (its first entry): sign-up confirmation,
invitations, password reset and sign-in links. In development it is `CLIENT_URL=http://localhost:5173` (the default too), so they
open this app. The backend reads `.env` when it starts: restart it after changing it.

| Command | What it does |
| :-- | :-- |
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | serve the production build (also proxies `/api`) |
| `npm run typecheck` / `npm run lint` | checks |

### Environment

Only one variable (see `.env.example`): `VITE_API_BASE_URL`, default `/api/v1`. For a production build, set the full API
address, for example `https://api.example.com/api/v1`, and serve `dist/` with the usual single-page fallback (every unknown
path returns `index.html`).

**Feature guides:** [Classes & Sections](#manage-school-classes--sections) and [Students](#manage-school-students) (how the pages and
their API work, at the end of this file).

## Signing in, and what happens when the token expires

The access token lives 15 minutes, the refresh token 30 days, both in cookies (`utils/auth.ts`, the same cookie names as the
Next.js app). The rules live in one place, `src/redux/api/baseQueryWithReauth.ts`, which every API slice is built on:

1. A request that comes back **401** triggers **one** refresh (`POST /auth/refresh`), then the **same request is sent again**
   with the new token. The person sees nothing: the page, the form or the invite they were sending just carries on.
2. Requests that fail at the same moment (a page load fires several) **share that one refresh**; requests started while it
   runs wait for it and go out with the new token. The refresh token rotates, so two refreshes at once would sign someone out.
3. **Two tabs** take turns (a Web Lock), and the second adopts the token the first just got instead of refreshing again.
4. If the **refresh token is refused** (revoked, expired), the session ends: cookies are cleared, every cached response is
   dropped, and the person lands on `/login?reason=expired` with a note.
5. If the server is **unreachable** during a refresh, the session is kept, the request shows its error, and the next try
   (for example "Try again", or coming back online) refreshes and recovers.
6. A disabled account or a suspended school (`ACCOUNT_DISABLED`, `TENANT_INACTIVE`) ends the session with its own message.
   Signing out in one tab signs out the others.

## Layout of `src/`

```
main.tsx, index.css          entry, Tailwind + HeroUI + design tokens (the one block of colours)
routes/                      AppRoutes (the route table), RootLayout, SuperAdminRoute (guard)
Layouts/                     MainLayout (signed-in shell), OnboardingLayout (setup frame)
pages/                       auth/, landing/, onboarding/, dashboard/, school/, modules/, superAdmin/, NotFound
components/                  ui/ (Button, Input, Select, Modal...), auth/, brand/, landing/, layout/, dashboard/,
                             onboarding/, review/, tenants/, classes/, shared/
redux/
  store.ts, hooks.ts
  slices/authSlice.ts        who is signed in (user, school, loading, why a session ended)
  api/                       baseQueryWithReauth.ts, authApi.ts, tenantApi.ts, onboardingApi.ts, academicsApi.ts, studentsApi.ts, apiRoot.ts
  middlewares/               logoutMiddleware (forget cached data when a session ends)
hooks/                       useAuth, useAuthSession, usePending, useSchoolProfile, useSidebarCollapsed, useMotion...
types/                       api, auth, tenant, onboarding, academics, students (one barrel: types/index.ts)
constants/                   schoolOptions, modules, tones, academics, students
utils/                       auth (cookies), apiErrors, helpers, status, validators, review, postLoginPath
```

Imports are relative (no `@/` alias), types live in `src/types/`, and a new API slice must be added to
`redux/api/apiRoot.ts`: the store builds its reducers and middleware from that list.

## What differs from the Next.js app

Nothing you can see. Under the hood:

- No server: the landing page's "already signed in" redirect and the `Referrer-Policy: no-referrer` header on
  `/reset-password` and `/accept-invite` are done in the browser (`getToken()` check, `hooks/useNoReferrer.ts`).
- `next/image` became `<img>` (the photos are served as they are, not resized per screen).
- `next/font` became `@fontsource` packages.
- Data comes through RTK Query instead of a hand-written `fetch` wrapper. Lists and dashboards are asked again on every
  visit, and an invite or a decision marks the lists as stale (tags), so the sidebar badge and the dashboards update on their own.
- `PendingProvider` (the sidebar's "waiting for approval" number) is now the hook `usePending()`.

---

# Manage school: Classes & Sections

The first page under **Manage school** in the menu: click the **Manage school** row in the sidebar and **Classes &
Sections** (`/school/classes`) opens underneath it. It is where the principal or school admin
builds the layout of the school *before* any student or teacher exists: which classes the school runs, and which
sections each class has. Students, attendance, timetable and fees will all point at these sections later.

Who can use it: **school admin** and **principal** (they can read and change). Teachers and accountants can read the
data through the API (they will need it for attendance and marks) but have no page for it yet. The platform owner
(super admin) has no school, so the API refuses it.

## The three levels

```
Department   a heading that groups classes          Primary          (optional)
  Class      one year of study                      Class 5
    Section  a group of students who sit together   Class 5 - A, Class 5 - B
```

- A **department** is only a label. Deleting one never deletes classes; they move to "Other classes".
- A **class** has a name and a place in the teaching order. Class names are unique in a school ("class 5" and
  "Class  5" are the same name).
- A **section** has a name (A, B, or a stream like *Science* for Class 11 and 12), **seats** (the most students it should hold)
  and a **room**. Seats and room are **required by default**; the school can make them optional with the switch above the sections (see
  *Seats and room required* below). Section names are unique inside a class.
- A class is **not tied to a school year**: Class 5 exists every year. Its **sections are**: they belong to the school's
  current academic year (the *Sections* tile and a class's *Sections* heading name it), so next year's Class 5 can have its own
  sections while last year's stay as they were. See `docs/academic-years.md`.

## What you can do on the page

| You want to | Do this | What happens |
| :-- | :-- | :-- |
| Create every class at once | Empty page: pick the first and last class and the number of sections, press **Create N classes** | A preview shows exactly what will be made. Classes you already have are left alone, so it is safe to run again. The range is filled in from what the school told us when it registered. |
| Add one class | **Add class** (banner) | Everything is picked with one click on chips: the usual classes of a school in India (Pre-Nursery, Nursery, LKG, UKG, Class 1 to 12; the ones the school already has are left out) or **Other...**, which opens a box for a name of your own; then the department (it follows the class you pick, until you pick one yourself) and how many sections to start with (None, or 1 to 10), with what they will be called written right under it ("Class 5 will have 3 sections: A, B, C."). When the school already has every usual class, the box for a name of your own is open at once. See *Adding a class* below. |
| Group classes in a department | **Add department** on the "Other classes" heading (or **Create department** in the banner) | One dialog: pick the department with one click on a chip (Pre-Primary, Primary, Middle, Secondary, Senior Secondary, Kindergarten, the NEP stages...; the ones the school already has say *In school*) or choose **Other...** and type a name of your own, then tick the classes that go in it. Picking a usual name ticks its usual classes (Primary: Class 1 to 5, Pre-Primary: Nursery to UKG); a name of your own ticks every loose class, and the ticks can be changed. A department the school already has is reused, so the same dialog also moves classes into it. See *Adding a department* below. |
| Rename a department | The **pencil** on the department's heading | A small window: pick a usual name from the dropdown (the ones no department uses yet) or choose **Other...** and type your own. Picking renames it at once; a name another department already has is refused with a message and the box stays open. It is only a heading, so nothing else changes. |
| Delete a department | The **bin** on the department's heading | Asks first. Only the heading goes: its classes stay in your school, under "Other classes". |
| Change a department's classes, or any class or section in it | **Manage** on the department's heading | Opens the department's own screen: everything below is done there, see *One department's own screen*. The class cards on the list only show. |
| Put the classes that are in no department somewhere | **Manage** on the "Other classes" heading (a department dropdown on each class), or **Add department** there to give several classes a department at once | |

**First-time help** is built in: a *How this page works* card (close it with the X, bring it back with **Guide**; it is
remembered on this device), a **?** next to things that need a word of explanation, and a tooltip on every button and
icon. Every form also has its hint written under the field, because a hover tip does not exist on a phone.

## One department's own screen (the workspace)

On the list, the class cards only **show** (no buttons at all), and each department's heading has a **pencil** (rename), a **bin**
(delete, after asking) and **Manage**; on a phone they drop to a second line under the name. Manage
opens `/school/classes/departments/:departmentId`, the one place where the classes in a department and their sections are changed. The
"Other classes" heading has Manage too: its address ends in `none` instead of an id and it lists the classes that are in no
department. The page is a **list with a detail**, like a patient list with the patient's tests: pick a class on the left and it
opens on the right. **Nothing is sent to the server while you type**: the class has **one Save** (in its header, dimmed until something is
changed) that saves the class name and every changed section together, and a chip or a bin acts when you press it.

```
+--------------------------------------------------------------------------------------------------------------+
| ( <- Back )                                  the deep-blue banner of the list page, with the department's own mark |
| [bag]  Primary (pencil)                                                          [ < Pre-Primary ] [ Middle > ] |
|        ( 5 classes ) ( 3 sections ) ( 80 seats )                                                             |
+--------------------------------------------------------------------------------------------------------------+
| CLASS NAME [ search ........................................................ ]       SORT BY [ Order v ]      |
+--------------------------------------------------------------------------------------------------------------+
+-- 5 classes            [+ Add class] --+   +-- the class you picked -----------------------------------------+
|| 1 Class 1    3 sections . 80 seats    |   | [1] CLASS NAME [ Class 1 ]                     [ Save ] | Delete |
|   2 Class 2    No sections             |   | Sections  3 sections . 80 seats                  [ + Section D ] |
|   3 Class 3    No sections             |   | +-- [A] Section [ A ]   bin --+  +-- [B] Section [ B ]   bin --+ |
|                                        |   | | Seats [ 40 ]  Room [ 101 ]   |  | Seats [ 40 ]  Room [ 102 ]  | |
| Showing 1 to 5 of 5   Rows [10] < 1 >  |   | | Unsaved changes    [ Save ]  |  |                [ Save ]     | |
+----------------------------------------+   | +------------------------------+  +-----------------------------+ |
                                             +-----------------------------------------------------------------+
```

This screen is for **changing what exists**. A new department is made on the list page (**Create department**), and a new class
with **Add class** there or with the small **Add class** button above this list (it adds to this department). You arrive here by
choosing a department, so there is no department to pick and no seats filter: the bar holds only the search and the sort.

- **The heading** (`components/classes/department/DepartmentHero.tsx`) is drawn on the same deep-blue gradient as the list page's banner
  (`heroSurface` and `HeroGlow` in `ClassesHero.tsx`). It has a **Back** button, the department's mark (its icon in the colour it has on
  the list page, `TONES`), its name with the small pencil, frosted pills that count what is in it (classes, sections, and seats once any
  are set), and the departments before and after it at the right. "Other classes" is the neutral navy and has no pencil. The pills
  are counted from the same `getStructure` data, so they follow every change at once. There is no breadcrumb: the way back is the Back
  button.
- **Going back** (`components/ui/PageBackNav.tsx`) is one pattern in the whole app, as on a new-patient page: under the page title, a
  round arrow and where the page sits (`Students > Add student`). `<PageBackNav crumbs={[{ label: "Students", to: "/school/students" }, { label: "Add student" }]} />`:
  the arrow goes to the crumb before the last (or `onBack`, or one step back in history); every crumb but the last is a way back; a
  crumb may be an in-page step (`onClick`). `onDark` is for a deep-blue banner (a department's workspace).
- **The marks** (`departmentIcon()` in `utils/academics.ts`): Pre-Primary, Kindergarten and Pre-School a baby, **Primary a school bag**
  (it was a pencil, which looked like an edit button beside the name), Middle an open book, Secondary a flask, Senior Secondary a cap,
  any other name the plain layers icon. The same mark is used on the list page, in the dialogs' chips and in this heading.

- **The class list is asked of the server** (`GET /academics/classes`, below): the name search, the sort, the page and the page size are
  query parameters, together with the department this screen is about; nothing is filtered in the browser. The search, the page and
  the open class are kept in the address (`?q=&sort=&dir=&page=&limit=&class=`), so a reload, a link and the back button keep them
  (`hooks/useClassFilters.ts`). The search box waits 300 ms after the last key, so typing "class 5" is one request, not eight; while
  you type in it it shows your text, otherwise what the address says. (The endpoint can also filter by department and by seats, for
  the screens that will need it; this screen does not offer them.)
- **The class on the right** is read by its id (`GET /academics/classes/:id`), so it stays right whatever the list shows: it can
  be renamed, and it stays open after it leaves this list (a class put in a department from the Other classes screen is pinned open
  in the address). The first class of the list opens by itself.
- **One Save for the whole class, never by leaving a box.** At the right of the header, level with the name box, are **Save** and, set
  apart by a thin line, **Delete**. Save is dimmed while nothing differs from what is saved. Typing only edits the screen
  (`hooks/useClassDraft.ts` keeps what was typed): there is no "unsaved changes" message; the Save button turns on, and a
  card with something typed in it is outlined in amber and says *Not saved yet*. Save, or Enter in any box, sends the class name (if
  it changed) and then one request for each changed section, one after another, each with **only its changed boxes** (`PATCH` takes
  partial bodies, so saving the seats can never put back an old room saved a moment earlier); then the line says *Saved*. A wrong value
  (no name, seats that are not 1 to 200) is shown under its box before anything is sent. If the server refuses one change (a name already
  used), the others are still saved, the line says *One change could not be saved*, and the refused card keeps its text and its message
  so it can be fixed and saved again. Escape in a card puts that card's saved values back (in the name box, the saved name). A box shows what was just saved until the server's answer arrives, so it never flashes back to the old value,
  and an answer arriving while something is being typed never overwrites it (only the boxes that were typed in are kept).
- **A section is a card** (`department/SectionCard.tsx`, which only shows and edits what the draft holds): a badge with its letter, boxes
  for **Section**, **Seats** (with a **?** that explains them) and **Room**, each with its small title always visible, and a bin at its
  top right. The cards have no Save of their own. Cards sit two across when there is room beside the list and one under the other when
  there is not (a container query, so it follows the width of the panel, not of the screen).
- **Seats and room required** is a switch beside the *Section A* button, on by default (`components/ui/Switch.tsx`; the **?** next to it explains
  it). **It is the school's setting, kept on the server** (`Tenant.settings.sectionDetailsRequired`, `GET` and `PUT /academics/settings`),
  and **the server enforces it**, not the browser: creating a section without both, or changing a section so that it ends up without
  one, is answered `400 SECTION_DETAILS_REQUIRED` with `details: [{ path: "capacity", message: "Enter the seats" }, { path: "room", ... }]`,
  whoever sends it (`SectionService`). The screens check the same rule first, with the same words, so the person gets the message
  before anything is sent: the *Add section* dialog and the one Save (a changed section must end up with seats and room). While it is on
  the titles carry a red star; when it is off they say *(optional)* and empty boxes are fine. Flipping the switch acts at once (it is not
  part of Save), changes no data, and a toast says what it is now. Sections that have neither (made together with their class by *Add
  class* or quick setup, or before the rule) are not blocked while they are left alone, but they say *Add the seats and the room* and
  cannot be changed (not even renamed) until they have both.
- **The class's bin** is in the header, beside Save (there is no "Delete this class" strip); it asks first, like a section's bin.
- **A class's department is not asked for here.** You came in through a department, so the class is already in it and nothing about
  departments is shown on the right. Only a class that is in no department (the **Other classes** screen) shows a row of the school's
  departments as chips, each in its colour, under the name: one click puts the class in it (the chip shows as picked straight away) and a
  toast says so; the class then leaves that list but stays open on the right. A department is never made here: that is **Create department**
  on the list page.
- **Renaming or deleting the department** (`department/DepartmentSettings.tsx`) has no button of its own on the page, because it is
  rarely needed: a small pencil beside the department's name opens a window with the name as a dropdown (a usual name, or
  **Other...** to type your own; picking renames it at once; a name another department uses is refused with a message and the box
  stays open) and **Delete department** (asks first; its classes stay, in no department). It is the same window
  (`department/RenameDepartmentModal.tsx`) that the pencil on the list page's heading opens; there the bin is its own icon, so the
  window shows only the rename part.
- **Add a class** (`department/AddClassBar.tsx`): the small **Add class** button above the list opens a box that is already focused and
  already shows its list: the classes **the school already has come first** (each says where it is: "In school . already here",
  "In school . Middle", or "no department: moves here"), then the usual classes it does not have yet ("New class"). **Picking a row
  adds the class at once**; a name that is not in the list is typed and added with Enter or **Add**. It uses
  `POST /academics/departments/:id/classes` (or, on the "Other classes" screen, `POST /classes` with no department).
- **A standard class goes where it belongs in the teaching order**, on the server (`ClassService.placeInTeachingOrder`): adding
  Class 3 to a school that has Class 2 and Class 4 puts it between them, and adding Class 12 puts it right behind Class 11 even
  if the school has classes of its own after that. A numbered class ("Class 13") continues the count; a name of its own
  ("Hobby Club") goes last. The same applies to the banner's **Add class**. There is no re-order screen: the order is always the teaching order.
- **Deleting** is the one thing that asks first (a class, a section, a department; the classes of a deleted department stay, in no
  department). The question keeps its own copy of what it asks about, so "this class has students" stays on screen.
- On a phone the list is above and the class below it; picking a class scrolls it into view.
- The screen reads the same `getStructure` query as the list page for the department names, so the two always agree.

## Adding a department (and putting classes in it)

```
"Other classes"  3 classes . 0 sections                                  [ Add department ]
```

The classes that are in no department are listed under **Other classes**, and that heading carries the **Add department**
button (the banner's **Create department** opens the same dialog). In the dialog (`AddDepartmentModal.tsx`):

- The **Department** is a row of chips (`components/ui/ChipPicker.tsx`): one click picks it, no list to open and scroll. The
  usual names live in `DEPARTMENT_SUGGESTIONS` (`constants/academics.ts`), with the span of classes each normally holds; a chip
  says *In school* (and has the colour of its heading on the list page) when the school already has that department. The last
  chip, **Other...**, opens a box for a name of your own, so a school is never stuck with the usual names. Whatever is picked or
  typed ends up as the same text, so the form treats both alike.
- A line under the box says what will happen: *"Primary" is new. It is created...* or *You already have "Primary"...*.
- **Classes to put in it** lists every class that is in no department, as tick buttons (Tick all / Clear). The ticks follow the
  name until you change one yourself; after that they are yours. A name with no usual span (your own, or "Junior Wing")
  ticks all of them, because the person came here to put these classes somewhere.
- One request does it all: `POST /academics/departments/assign` with `{ name, classIds }`. The server checks the classes are
  the school's, creates the department unless one with that name exists (the name is compared without regard to case or
  spacing), and moves the classes in, including out of any department they were in. The page redraws from the refreshed
  `getStructure`. The button says what it will do: *Create and add 3 classes*, *Put 1 class in Primary*, or is disabled
  (*Tick a class first*) when the department exists and nothing is ticked.

## Adding a class

The banner's **Add class** (`ClassModal.tsx`) is three questions, each answered by one click on a chip (`ChipPicker`, a group of
radio buttons, so the arrow keys and a screen reader work too):

- **Class name**: the usual classes this school does not have yet, then **Other...** (a box for a name of your own; Enter adds the
  class). With every usual class already there, only the box is shown, already open and focused.
- **Department**: the school's departments and **No department**, each in its colour. It follows the class you pick (Nursery picks
  Pre-Primary when the school has it) until you pick a department yourself; from then on it is yours and never changes by itself.
  A department is never created here; that is **Create department**.
- **Sections to start with**: None, or 1 to 10. A line right under the chips says what will be made: *Class 5 will have 3
  sections: A, B, C.*

A name the school already has is refused by the server (*CLASS_EXISTS*) and the message appears under the name, with the dialog
still open.

## How it works, step by step

Take "move Class 5 to Middle" as an example.

```
 you press Manage on the Primary heading
        |
 DepartmentManagePage (pages/school/DepartmentManage.tsx): the list on the left is GET /academics/classes?departmentId=...&page=1
        |
 you press Class 5 in the list: ?class=<id> goes into the address and ClassDetail reads GET /academics/classes/:id
        |
 you open the Department dropdown of the class on the right and pick "Middle"        (components/classes/department/ClassDetail.tsx)
        |
 useUpdateClassMutation  ->  PATCH /api/v1/academics/classes/:id  { departmentId }      (redux/api/academicsApi.ts)
        |                              |
        |                       the server checks who you are, validates the body (Zod), and saves it
        |                       only inside YOUR school (backend/src/main/academics)
        |
 the mutation "invalidates" the Structure tag  ->  RTK Query asks again for the list, the class and the structure
        |
 the list redraws without Class 5, the class on the right shows Middle, a toast says "Class 5 moved to Middle"
```

The key idea: **the whole layout of a school is one small piece of data** (a few dozen rows), so the page asks for all
of it in one request (`getStructure`) and every change just marks it stale. The screen is always drawn from what the
server says, never from a local guess.

### Where things live

```
pages/school/Classes.tsx            the list page: loads the data, decides which dialog is open, draws the groups
pages/school/DepartmentManage.tsx   a department's workspace: a list of classes and the class picked (/school/classes/departments/:departmentId, or "none")
components/classes/
  ClassesHero.tsx                   the deep-blue banner at the top (same gradient as the dashboard's welcome banner)
  DepartmentGroup.tsx               a department band in its colour with its classes below as cards; pencil (rename), bin (delete) and Manage ("Other classes" has Add department and Manage)
  ClassCard.tsx                     one class as a coloured card: mark, name, section chips. Only shows, no buttons
  ManageLink.tsx                    the "Manage" button of a department heading
  AddDepartmentModal.tsx            pick a department (chips, or Other... to type one) and tick the classes that go in it
  ClassModal.tsx                    the banner's Add class: chips for the class, the department and the number of sections
  QuickSetupPanel.tsx               what a school with no classes sees first (navy side panel + the form)
  QuickSetupForm.tsx                "create all my classes" with the live preview (page and dialog use it)
  GuideCard.tsx                     the "how this page works" card
  ConfirmModal.tsx, useSave.ts      "are you sure?"; the "Save" logic every dialog shares
  department/RenameDepartmentModal.tsx the rename window (usual names / Other...), with an optional Delete department part; opened from the list page's pencil and from the workspace's
  department/DepartmentSettings.tsx the pencil beside the name on the workspace and the window it opens (rename + Delete department)
  department/ClassFilters.tsx       the bar across the top: the class-name search (waits 300 ms after typing) and the sort
  department/ClassList.tsx          the page of classes the server sent, "Showing 1 to 10 of 16", the arrows, rows per page
  department/DepartmentHero.tsx     the deep-blue top of the screen: Back, the department's mark and name, the pills, the neighbours
  department/ClassDetail.tsx        the picked class: name form, the bin, the sections as cards, the departments row for a class in none
  department/ClassNameField.tsx     the class name box (it edits the draft; the header's Save saves it)
  department/SectionCard.tsx        one section as a card: name, seats, room and a bin; edits the draft
  department/fieldStyles.ts         the small grey title over a box
  department/OtherSelect.tsx        a dropdown with an "Other..." row that opens a box for a name of your own
  department/AddClassBar.tsx        the "Add a class" box (the school's classes first, then the usual ones, or type your own)
hooks/useClassDraft.ts              what is typed and not saved on a class screen (name + sections), and the one Save that sends it
hooks/useClassFilters.ts            the filters, sort, page and picked class, kept in the address and turned into the server's query
components/ui/PageBackNav.tsx       the app's one way back: a round arrow and the breadcrumb, light or on a dark banner
components/ui/StickyAside.tsx       the column beside a long form: scrolls until it is all in view, then stays put
components/ui/ComboBox.tsx          a dropdown you can search and also type your own answer into (next to Select)
components/ui/ChipPicker.tsx        "pick one" as a row of chips (radio buttons underneath): one click, every choice visible
components/ui/AppModal.tsx          the frame of every dialog (HeroUI Modal)
components/ui/Hint.tsx              InfoTip (the ?), WithTip (tooltip on a button), TipButton (icon button with a label)
components/ui/ComboBox.tsx          a dropdown you can search and also type your own answer into (next to Select)
redux/api/academicsApi.ts           every request of this page (RTK Query): one query and the mutations
types/academics.ts                  the shapes of the data
constants/academics.ts              standard class names and which department each belongs to (mirrors the server)
utils/academics.ts                  small pure helpers: grouping, next section letter, quick-setup preview, plural()
routes/SchoolManagerRoute.tsx       lets only school admin / principal in
```

How a few details work:

- **Dialogs.** The page keeps one value, `dialog`, that says which dialog is open and for what. A dialog is mounted
  only while it is open, so its form always starts fresh. Each dialog calls its own mutation through `useSave`, which
  keeps the dialog busy while the request runs, closes it on success, and keeps the server's message on failure.
- **Errors.** `getApiError()` turns a failed request into `{ message, code }`. A name that is already taken
  (`CLASS_EXISTS`, `SECTION_EXISTS`, `DEPARTMENT_EXISTS`) is shown under the name field; anything else is shown in a red
  box in the dialog. The server's messages are written for people, so they are shown as they are.
- **Grouping.** The server sends departments already in display order (by where their first class sits) and classes in
  teaching order. `groupClasses()` only lays them out wing by wing and adds an "Other classes" group when needed.
- **Menu highlight.** `activeNavItem()` in `nav-config.ts` picks the *longest* matching address, so when one menu address is
  the start of another only one item lights up. The menu now holds only Dashboard and Manage school > Classes & Sections and Students
  (plus Schools for the super admin); the planned modules in `constants/modules.ts` keep their preview pages but are not in the menu.
- **The "Manage school" row folds.** Groups listed in `FOLDING_GROUPS` (`nav-config.ts`) are drawn by the sidebar as one row
  with a chevron instead of a heading: click it and the group's pages slide open underneath (the same in the icon-only
  menu and in the phone drawer). A group is open by itself when you arrive on one of its pages (a reload, a link, the back
  button), and after that it stays as you leave it. Closed pages are `invisible` and `inert`, so Tab and screen readers skip them.
  To fold another group, add its name and icon to `FOLDING_GROUPS`.
- **The classes come from sign-up.** When the platform approves a school, the backend creates the classes between the lowest
  and the highest class the school gave at sign-up (`StructureService.startFromProfile`), with their departments and **no
  sections**, so this page opens as a ready list. A school that has no classes (older, or all deleted) sees the "Add your
  classes" panel instead, pre-filled with that same range.
- **Sections are optional for a class.** A class does not need sections ("No sections"). In a department's workspace the
  "Section A" button (the next free letter, `nextSectionName()`) opens a dialog (`department/AddSectionModal.tsx`) with the name filled in
  and boxes for the seats and the room (see below); "Sections" shows the boxes of each section's name, seats and room. Students of a class without sections will belong to the
  class itself (see the note in `services/usage.ts`).
- **The guide** is open for a school with no classes and out of the way once there are classes; the Guide button opens it again.
- **Colours and motion.** The page uses the dashboard's look: the same gradient banner, the same `KpiCard` tiles (count-up
  numbers, glow, a line that draws on hover) and the same stagger / float animations, all switched off for people who ask
  for less motion. Each department gets one colour from `TONES` (`constants/tones.ts`: `gradient`, `chip`, `wash` were
  added for this) in the order the departments are listed, by `groupClasses()`, so Primary is the same green on the
  heading, the class marks, the section chips, and the quick-setup preview. The big mark on a class card
  is `classMark()` ("5" for Class 5, "LKG", "PN" for Pre-Nursery).

## The API (`backend/src/main/academics`)

Everything is under `/api/v1/academics` and works on the **signed-in user's own school**: the school id comes from the
login, never from the request, and every query filters by it, so one school can never see or change another's data
(it gets a 404, as if the thing did not exist).

| Method and path | What it does | Who |
| :-- | :-- | :-- |
| `GET /structure` | departments, classes with their sections, totals | school admin, principal, accountant, teacher |
| `GET /classes` | the class list, each with its sections, filtered, sorted and paged by the database (one aggregation): `search` (part of the name), `departmentId` (an id or `none`), `seatsMin` / `seatsMax` (a class's seats are its sections' limits added up; a class with no seats set is left out when filtering by seats), `sort` (`order`, `name`, `seats`; names in natural order, Class 2 before Class 10), `dir`, `page`, `limit` (1 to 50, default 10). Answers `{ items, page, limit, total, totalPages }` | school admin, principal, accountant, teacher |
| `GET /classes/:id` | one class with its sections | school admin, principal, accountant, teacher |
| `POST /quick-setup` | `{ fromClass, toClass, sectionsPerClass }` (0 to 6; 0 makes the classes only) creates the usual classes, skipping those that exist | admin, principal |
| `POST /departments`, `PATCH /departments/:id`, `DELETE /departments/:id` | create, rename, delete (its classes are kept) | admin, principal |
| `POST /departments/assign` | `{ name, classIds }`: put those classes in the department with that name, creating it if the school has none; answers `{ department, created, assigned }` | admin, principal |
| `POST /departments/:id/classes` | `{ classIds, names, sectionCount }`: move those classes into the department and create the named ones in it (standard classes land in teaching order); answers `{ department, moved, created }` | admin, principal |
| `POST /classes`, `PATCH /classes/:id`, `DELETE /classes/:id` | create (with `sectionCount`), rename / move to a department, delete with its sections | admin, principal |
| `POST /classes/:id/sections`, `PATCH /sections/:id`, `DELETE /sections/:id` | add, change (name, seats, room), delete. Seats and room are required unless the school made them optional (400 `SECTION_DETAILS_REQUIRED`, per missing box) | admin, principal |
| `GET /settings`, `PUT /settings` | the school's switches: `{ sectionDetailsRequired }` (also in `GET /structure` as `settings`) | read: everyone at the school; change: admin, principal |

Good to know:

- Names are trimmed, inner spaces collapsed, and compared without regard to case. Seats are a whole number from 1 to 200
  (or empty). Limits: 15 departments, 60 classes, 30 sections per class.
- **A class or section that has students cannot be deleted** (`CLASS_HAS_STUDENTS`, `SECTION_HAS_STUDENTS`): the Students module counts
  them (`backend/src/main/academics/services/usage.ts`), by section and by class (a class without sections holds its students itself), and
  a class with students in another academic year is kept as history (`CLASS_HAS_HISTORY`). The delete dialog shows the server's sentence
  ("This class has 5 students. Move them to another class first.").
- Quick setup uses these departments: Pre-Primary (Pre-Nursery to UKG), Primary (1-5), Middle (6-8), Secondary (9-10),
  Senior Secondary (11-12). The names must match `backend/src/main/academics/constants.ts`.
- Tests: `backend/src/main/academics/__tests__/academics.test.ts` (66 cases: permissions, every rule above, and that one
  school cannot reach another's data). The list page was checked in a real browser (27 steps): the folding menu
  (closed, opened by click, opened by itself on its page, icon-only, phone drawer), quick setup, every dialog, duplicates,
  deleting, the guide and tooltips, and a phone-width layout. The department workspace was checked the same way (14 steps, repeated until it was stable: one bar with only the search and the sort and no department or seats filter, a pencil beside the name instead of a settings button, a class opening on the right and in the address, search sent to the server once after typing stops, sorting by seats, pages and rows per page on twelve extra classes, the search surviving a reload and Clear taking it away, renaming and moving the open class (only existing departments and No department offered), the Add class box opening with its list already showing the school's own classes first, deleting the open class, renaming by a usual name and by Other... in the window, a taken name refused, deleting from that window, the Other classes screen, a phone width with no sideways scrolling).

The redesigned workspace was checked again (the 14 steps above, with the department step now clicking a chip, and 8 more: the heading naming the department with its pills counting classes, sections and seats and following every change; the Other classes screen in navy with no pencil; adding Section A at once, seats and room saving on their own and surviving a reload, a wrong seat count refused; deleting a section; moving a class by chip and the chip showing as picked at once; the delete strip asking first and Cancel keeping the class; a phone width with no sideways scrolling).

The one-Save version of the class screen was checked in real Chrome (9 steps: a single Save in the header, dimmed, with Delete beside it at the right and no Save in any card; typing sending no request, even after leaving the boxes, and the header counting what is unsaved; Escape reverting one card and Discard everything; one click on Save sending the class name and each changed section as separate requests with only what changed, and the boxes not flashing back; Enter saving; a wrong value refused before sending, and a refused name keeping its text while the other changes still saved; the ? not saving; both kinds of bin asking first; a phone width with Save and Delete on screen).

The required seats and room were checked in real Chrome (9 steps: the switch on by default and the server saying so, no unsaved-changes message; the Add section dialog asking for both and sending nothing while they are missing; a section added with them; the server itself refusing a request that skips the form, box by box; a section that cannot be saved with seats or room emptied; sections made with their class marked as incomplete and refused a rename until completed; switching it off, then optional everywhere and remembered after a reload; switching it on again changing no data; a phone width). The backend has its own tests for the rule (`academicSettings.test.ts`).
The requests were counted in real Chrome, action by action (9 steps: opening a department makes its three reads once; the switch is a single PUT; picking another class asks for that class only and a class just seen asks for nothing; typing asks for nothing; one Save with three changes is three writes and one refresh; one section's change and adding a section are one write and one refresh; renaming a department re-reads only the layout; going back to the list page and into the department again asks for nothing; the dashboard asks for the academic year once).

The list page headings were checked the same way (5 steps: a pencil, a bin and Manage on every department heading, none on the class cards, none of the pencil and bin on Other classes; renaming by a usual name and by Other... with a taken name refused; the bin asking first, Cancel keeping the department, Delete moving its classes under Other classes; Manage and the workspace pencil still working; a phone width where the buttons drop under the name and nothing scrolls sideways).

The two dialogs were checked the same way (9 steps: no Re-order button on the page and no route for it on the server; Add class with the usual class as a chip bringing its department and a live line about its sections, the box for a name of your own open at once when every usual class exists, a department you picked not taken back when the name changes, an empty name asked for, a name the school has refused with the dialog kept; Add department with the 15 usual names and Other... as chips marked In school, Primary ticking exactly Class 1 to 5, a name of your own with the classes you tick, a name the school has reused with nothing to tick doing nothing, Enter making an empty department; both dialogs on a phone width with no sideways scrolling).

## Which requests a screen makes (and why no more)

A request is made only when the thing it reads or writes changed or is not known yet. The classes API (`redux/api/academicsApi.ts`) has
three reads with their own tags and each change names exactly what it touches:

| Read | Tag | What it is |
| :-- | :-- | :-- |
| `GET /academics/structure` | `Structure` | the whole layout: the list page, the headings, the counts, the year, the settings |
| `GET /academics/classes` | `ClassList` | one page of a department's class list (rows with section and seat counts) |
| `GET /academics/classes/:id` | `Class` | the class on the right, with its sections |

| You do | Requests |
| :-- | :-- |
| Flip the *Seats and room required* switch | **1**: `PUT /settings`. The cached layout is updated from the answer; nothing is read again |
| Type, or leave a box | none |
| Save (a name and two sections changed) | 3 writes, then **one** refresh of the layout, the list and the class (the writes are sent with `refresh: false`, and `refreshClass()` asks once at the end) |
| Add / delete a section | 1 write, then those three reads |
| Rename a department | 1 write, then the layout only (a row of the list does not carry its department's name) |
| Pick another class | the class only; one seen less than a minute ago and not changed since is shown from what is known |
| Go to the list page and back into a department | none while what is known is younger than a minute |
| Open the list page of a school that has classes | no `GET /onboarding` (it only fills the first-time panel of a school with no classes) |

`refetchOnMountOrArgChange: 60` keeps a screen that comes back from asking again for what it just had; our own changes already refresh
what they touch, and a copy older than a minute is read again. A read that is not on screen is not fetched after a change: RTK Query
drops its cached copy and reads it when it is next needed. `chatter.mjs`-style checks (count the requests each action makes) are the way
to keep this true when a screen changes: a new mutation must list the tags it touches, never "everything".

## Adding the next "Manage school" page

The menu group **Manage school** is meant to grow one page at a time (timetable, students, ...). To add one:

1. Backend: a feature folder in `backend/src/main/<name>/` (copy the shape of `academics`) and one line in `backend/src/routes/index.ts`.
2. Frontend: an API slice in `redux/api/<name>Api.ts` (add it to `apiRoot.ts`), types in `types/<name>.ts`.
3. A page in `pages/school/`, its components in `components/<name>/`, and its route in `routes/AppRoutes.tsx` (inside the
   `SchoolManagerRoute` block if it is for the people who run the school).
4. A menu entry in `components/layout/nav-config.ts` with `group: "Manage school"` (it then shows under the folding
   "Manage school" row on its own).
5. Reuse `AppModal`, `Field`, `Select`, `InfoTip`, `WithTip`, `TipButton` and `useSave`, and put the first-time help in the
   page the same way (guide card, `?` tips, hints under fields).

The Students pages below were built this way.

---

# Manage school: Students

The second page under **Manage school**: click the **Manage school** row in the sidebar and **Students** (`/school/students`) opens
under Classes & Sections. It is where the school admin or the principal **admits** students for the current academic year and finds,
reads and changes them later. Design, data model, API and rules: [`../docs/students.md`](../docs/students.md).

Who can use it: **school admin** and **principal** (the people who admit; `STUDENT_WRITERS` in `constants/students.ts` is the same
one list as the server's, so a reception role is one line later). The accountant can read students through the API but has no page yet.
The dashboard's **Students** tile and its **Add a student** shortcut open these pages for them (other roles still see the preview).

## The three ideas

```
Student     the child: name, birthday, address, admission number            ADM-2026-0001, Asha Verma   (stays every year)
  Parents   one record per parent, found by mobile number, linked to       Ravi Verma, 98765 43210      (stays every year)
            every child of theirs (a brother or sister is linked, not typed again)
  Place     the class and section in ONE academic year (an enrolment)       2026-2027: Class 5 - A, roll 7
```

## The list (`pages/school/Students.tsx`)

A plain page in the style of a list screen (no banner), modelled on the appointments list of Infinity Medisetu:

```
Students (?)                        [ ? Guide ] [ Fields ] [ Export ] [ Bulk upload ] [ + Add student ]
View and manage every student of 2026-2027.
[ Students 20 ] [ Classes with students 3 ] [ Seats left 53 ] [ Full sections 1 ]     (the dashboard's KpiCard)
[ Search by name or admission number ............ ] [<] [ All classes (20) v ] [>] [ Pick a class v ]   [ List | Grid ]
+--------------------------------------------------------------------------------------------------------------+
| STUDENT                 CLASS AND SECTION   PRIMARY PARENT              ADMITTED                              |
| [AV] Asha Verma         (Class 5 - A)       Ravi Verma (Father)         23 Oct 2026                         > |
|      ADM-2026-0001       Roll 7              98765 43210                 Female . 10 years                    |
+--------------------------------------------------------------------------------------------------------------+
Showing 1 to 12 of 20 students                                        Rows per page: [12 v]   <  [1] 2  >
```

- **The header** is only the title (with a **?** that says what the page shows), a line naming the year, and the buttons: **Guide**,
  **Export** (once there are students: a link to the Export page, the school's fields and Excel, carrying the filters as
  `?q=&class=&section=`), **Bulk upload** and **Add student**. No banner.
- **The guide** (`StudentsGuide.tsx`) is open for a school with no students yet and out of the way after that; the X closes it, **Guide**
  brings it back (remembered on this device). The controls and the cards have a tooltip where a first-time user may wonder.
- **The tiles** come from `GET /students/capacity`: students this year, classes that have students, seats left in the sections that
  have a limit, and full sections.
- **One row of filters** (`components/students/StudentToolbar.tsx`, `hooks/useStudentFilters.ts`), all of it the server's:
  - the **search** takes all the room the other controls leave, and waits 300 ms after the last key, so typing "zoya" is one request;
  - the **class** is a dropdown that says how many students each class has ("Class 5 (5)"), with **arrows** to step to the class before
    or after it (the date arrows of the appointments list, here for classes; they stop at "All classes" and at the last class);
  - the **section** of that class, with its students and seats ("Section B (2/1 seats)"); it waits for a class (it cannot name one section
    without the class, since A exists in many classes);
  - **List / Grid**, at the far right, switches how the same page is drawn: it asks for nothing, is kept in the address (`view=`) and
    remembered on this device.
  There is **no sort to pick**: the students come in the server's order (by class and section, then by name), and a `sort=` left in an old
  link is ignored (the API still accepts `sort` and `dir`, see `docs/students.md`). The two dropdowns are as wide as each other.
  Everything lives in the address (`?q=&class=&section=&page=&limit=&view=`), so a reload, a link and the back button keep it.
  **Clear** (shown when a search or a class is set) takes them away.
- **The table** (`StudentTable.tsx`): the student (initials, name, admission number), the class and section as a chip with the roll
  number, the primary parent with their number, and the admission date with gender and age. A row opens the student (the name is the real
  link; a click on the rest of the row follows it). On a phone only the student column stays, with the class and the parent under the name,
  so the page never scrolls sideways.
- **A card** (Grid, `StudentCard.tsx`) is a link to the student: initials on a colour that comes from the admission number (it never changes),
  the name and number, this year's class and section as a chip, the roll number, gender and age, the primary parent and their number. It
  lifts and takes a tint under the pointer, like the class cards.
- **The pages** (`StudentPager.tsx`): "Showing 13 to 20 of 20 students", **Rows per page** (12, 24, 48) and numbered pages with
  previous / next (`1 ... 4 5 6 ... 20` when there are many). A page number asks the server for that page.
- **Empty states** (`StudentsNotice.tsx`) say what to do next: a school with no current academic year is sent to the dashboard (and has
  no Admit button: the server would refuse); a school with no classes is sent to Classes & Sections; a school with classes but no student
  gets *Admit your first student*; a search that finds nobody offers **Clear**.

## Admitting a student (`pages/school/StudentAdmit.tsx`)

Laid out like a new-patient page of a clinic app (the Infinity Medisetu one):

```
Add student  Academic year 2026-2027
(<-) Students > Add student
+-- Student ------------------------------------+   +-- (o) New student ------------+
|  First name   Last name   Gender   Date ...    |   |  Fill the form to see a live  |
+-- Class and section --------------------------+   |  preview here                 |
+-- Parents and guardians ----------------------+   +-- Form completion        33% -+
+-- Address ------------------------------------+   |  (v) Name  ( ) Gender  ...    |
+-- More details (folded) ----------------------+   +-- Quick tips -----------------+
[ Clear all ]                              [ Admit student ]     <- pinned to the bottom of the screen
```

- **The header** (`StudentFormHeader.tsx`) is plain, like a new-patient page: the title with the academic year beside it (or "A brother
  or sister of Asha Verma"), then the round Back arrow and *Students > Add student*. No banner. The same header heads a student's page
  (*Students > Asha Verma*), its edit form (*Students > Asha Verma > Edit*) and the bulk upload.
- **Left: the form**, one card per block: **Student**, **Class and section**, **Parents and guardians**, **Address**, **More details**
  (folded). The boxes sit in rows of three (`form/formGrid.ts`: as many columns as the card's width allows, one on a phone): *First
  name, Last name, Gender* (a dropdown), then *Date of birth, Admission date, Age* (worked out, green when it is 2 to 25); the parent's
  *Mobile number* and *Relation* (a dropdown) side by side; *House and street, Area, City*, then *State, PIN code*.
- **Right: the sidebar** (`form/AdmitSidebar.tsx`), read-only, drawn from what has been typed:
  - **Preview**: the initials and the name, the class and section, gender and age, the primary parent and number, and "Admission number is
    given when you press Admit". Empty, it says *Fill the form to see a live preview here*.
  - **Form completion**: a bar with a percentage and a checklist (name, gender, date of birth, class and section, parent and mobile number,
    address). A line is ticked when none of its boxes has a message, by the same rules as the boxes; only what is required is counted. At
    100% it says *Everything needed is filled in: press Admit.*
  - **Quick tips**: four short lines for a first-time user.
  It **scrolls with the page only until it is all in view, then stays put** while the form scrolls on (`ui/StickyAside.tsx`: a
  column taller than the screen stops when its bottom is in view, above the pinned bar). On a phone it goes under the form.
- **The pinned bar** at the bottom of the screen (it stays while the form is on screen) holds the one **Admit student** button at the right
  and **Clear all** at the left. Both are dimmed until something is typed. **Clear all** asks first (*Clear the whole form?*), then empties
  every box, the preview and the completion; nothing was saved, so nothing is deleted.

- **Nothing is sent while typing.** Admit is dimmed until something is typed. Admit (or **Enter** in any box) first checks every box
  with the **server's own words** (`checkStudentForm` in `utils/students.ts`, the messages in `constants/students.ts`); what is wrong shows
  under its box, the first wrong box gets the focus, and nothing is sent. A box shows its message once it was left, so a new form is not
  red. **Escape** in a box puts it back. If the server still refuses (something only it can know, such as a roll number already used),
  its message appears under the same box, in the same words.
- **Class and section** (`form/PlacementFields.tsx`): the classes as chips **grouped by the school's departments** (Pre-Primary,
  Primary, Middle...; *Pre-primary* and *School* for a school without departments), a numbered class shown as its number (read as
  "Class 5"); a live summary on the Class line (*Class 6 | Section B | Roll 34*). The sections of the picked class **of the current
  year only** are cards: the name, *Open* / *Almost full* (85% or more) / *Full* / *No limit*, *25 of 40 seats filled* and a bar; a
  full one is dimmed. When the cards do not fit, the row scrolls sideways with a fade at the edge. The **roll number** box shows *Next
  free* (the one after the highest given in that section, from `GET /students/capacity`: no extra request) and **Auto-assign** takes it. Picking a full section asks first (*Class 5 - B
  is full: 1 of 1 seats are taken... Put the student here anyway*); only a yes picks it, and the admission then says so to the server
  (`allowOverCapacity`). Under the class chips, the **section and the roll number share one row of a fixed height**: no class picked yet, a class without sections (*No section: joins the whole class*) and a class with sections take the same room, so nothing below moves when a class is picked. The line under the chips is always one line (the picked section's seats, or what the chips say). The roll number is optional.
- **A parent starts with the mobile number** (`form/GuardianFields.tsx`). The box keeps digits only (+91 and a leading 0 are dropped when
  pasted). Nothing is asked while fewer than 10 digits are there; at exactly 10 valid digits, and only when the number changed,
  `POST /students/guardians/lookup` is sent once (a POST: the number never appears in an address). Then either
  - **the parent is already in your school**: a green card names them and their children (*Asha Verma (Class 5 - A)*), with
    **Use as is** (picked: their saved details are not touched) or **Update details** (their boxes open, filled; the changes are saved for
    every child of theirs). The new child is **linked** to the same parent record; or
  - **new to your school**: the name, another number, email and occupation open.
  The relation (Father, Mother, Guardian, Other) is a chip row; one parent is the **Primary contact** (badge; **Make primary** on the
  others); **Add another guardian** adds up to four, and a second parent's number may be unknown (*No mobile number? Enter the details*).
- **The address** has a state dropdown (the app's `Select`) and the PIN code keeps digits only. **More details** (folded) is two compact rows: blood
  group and category as dropdowns (*Not known* / *Not given* clear them), and the previous school (name, last class, TC number, TC
  date) as one row of boxes; the columns follow the width (`auto-fill`), so a narrow card makes more rows, not cut-off boxes. All of it
  is optional, so its labels carry no star and no "(optional)" (`Field quiet`).
- **What the server may answer, and what the page does**: `SECTION_FULL` (the section filled up meanwhile) asks *Admit anyway*;
  `DUPLICATE_STUDENT` (same name, birthday and primary parent's number) shows the existing student as a link and asks *It is another child:
  admit* (Cancel saves nothing); `GUARDIAN_EXISTS` (someone saved that number a moment ago) shows the parent card as if the lookup had
  found them; `NO_ACTIVE_YEAR` and anything else show a red note at the top. The questions are `form/AskDialog.tsx`.
- **After Admit** the page opens the new student (`/school/students/:id`) with a green note: *Asha Verma is admitted, with admission
  number ADM-2026-0001, in Class 5 - A* and **Admit another student**.

## A student's page (`pages/school/StudentDetail.tsx`)

The pinned header shows the initials, the name, the admission number, the class and the roll number, with **Admit a sibling** and **Edit**.
Below, as coloured cards (`detail/StudentOverview.tsx`): *This year*, *About*, *Parents and guardians* (the primary one marked, the
number as a phone link with *not verified yet*), *Brothers and sisters* (chips that open each child), *Class history* (one row per
academic year, the current one marked *now*), *Address*, *Previous school*.

- **Admit a sibling** opens the admission form with the parents' numbers (looked up once each, so the green cards show at once) and the
  address filled in.
- **Edit** (`detail/EditStudentForm.tsx`) turns the page into a form laid out like the admission page: a plain header (**Back**, "Edit
  student", the name and admission number), the admission form's blocks on the left filled with what is saved, and on the right
  (`detail/EditSidebar.tsx`) the student **as saved** (initials, name, a green *Active*, admission number, class, age, gender, parent, phone,
  address, blood group, admitted on) and a few tips. A bar pinned to the bottom holds the one **Save changes** (dimmed until something
  differs) and **Undo changes** (every box back to what is saved, after asking). **Back** leaves the form straight away when nothing was typed
  and asks *Leave without saving?* when something was. Typing sends nothing. **Save** (or Enter) sends, one after another and each with
  only what changed: each changed parent (`PATCH /students/guardians/:id`), the student's own details (`PATCH /students/:id`) and the class,
  section or roll number (`PATCH /students/:id/enrolment`; moving into a full section asks first). What the server refuses stays typed with
  its message; what was saved is not sent again. A changed class or section drops the old roll number unless a new one is typed. The
  relation and the primary contact are shown but not changed here (not built yet).

## Bulk upload and export (`pages/school/StudentImport.tsx`)

For a school that already has its students in Excel, modelled on the bulk stock upload of a pharmacy app (a sample template to
download, fill and upload), but any sheet opens as an editable table first, because a school's own sheet is seldom in our columns:

```
[ Back ]  Bulk upload students
( 1 Upload file )------------( 2 Preview & fix )------------( 3 Done )
1  [ drop your file here, or browse ]            | Start from the sample file  [ Download sample template ]
   How it works / Note                           | Already have a students sheet? Upload it as it is.
2  sunrise-list.xlsx . 12 rows . 7 ready . 5 need a fix                                   [ Choose another file ]
   Missing in your file: Date of birth (red)          [ Date of birth v ] [ dd-mm-yyyy ] [ + Add column ]
   Your school also wants: State . 12 rows  Aadhaar number . 12 rows   (amber, once)     Add one for every row
   One class of the file is not in your school: "Class 9" . 1 row  [ Pick a class v ] [ Change it ]
   One section would go over its seats: Class 5 - B ...  [ ] Admit them all anyway
   [ All rows 12 | Need a fix 5 | Ready 7 ]                                [ Rows to fix (CSV) ] [ + Add column ]
   +-----+-------------------+-------------+------------------+---------+-----
   | ROW | STATUS            | Adm No      | Student Name     | Class   | ...      (file titles)
   |     |                   | (v Admis.. v)| (v Student na.. v)| (v Class v)      (what each was read as: a plain list)
   | 4 🗑| Ready             | 2019/45     | Aarav K. Sharma  | V       |          (every cell editable)
   | 7 🗑| [Student name]    |             | [Riya] red border | 5th     |
   +-----+-------------------+-------------+------------------+---------+-----
                                                       5 rows need a fix and are not uploaded.  [ Upload 7 students ]
3  8 students admitted to 2026-2027 . [ Fix the 3 rows ] [ Download them ] [ Upload another file ] [ Go to students ]
```

- **Step 1** checks the file's type and size on screen (`.xls` gets "save it as .xlsx"), then `POST /students/import/read` (the server
  reads it; it is not kept). The read is dispatched with `track: false`, so the `FormData` never lands in the store. The sample
  template is `GET /students/import/template`, saved under the server's file name (`downloadSheet` in `studentsApi.ts`).
- **Step 2** (`PreviewGrid`, `PreviewPanels`) keeps the file in the page's state and changes it there: a cell (`onBlur` / Enter; Escape
  puts it back), a column's detail (`assignColumn`: one column per detail), a new column (`addColumn`, for a missing detail or from
  Add column), a class name in every row (`replaceClass`), a row left out. `utils/studentImport.ts` does the rest: `autoMap` (titles to
  details by `IMPORT_FIELDS[].synonyms`), `missingForImport`, `unmatchedClasses` / `matchClass`, and `prepareRow`, which cleans each
  value (`normaliseDay`, `normaliseGender`, `normaliseMobile`, `normaliseState`...), builds the admission body and checks it with
  `checkStudentForm`; a problem carries its label and the `fields` whose cells turn red (`fieldsOf`: `guardians.1.mobile` is the
  Mother's mobile column). `crossCheck` finds the same student, admission number or roll number twice (rows already admitted from the
  file included). A row is prepared again only when it changes (a cache per row object, renewed when a column's detail changes), and
  the table shows 50 rows a page. Nothing is sent while the table is changed.
- **Step 3**: **Upload** sends the ready rows, 100 a request; then `refreshAfterImport()` marks the list, the seats and the cached student
  pages stale once. Admitted rows leave the table; refused ones stay with the server's reason until they are changed (a `SECTION_FULL`
  one is ready again when Admit them all anyway is ticked). The rows to fix are a CSV made in the browser (`problemsCsv`: the file's
  columns plus *Problem*). Closing the tab while uploading asks first; **Back** asks while rows are in the table.
- The school's needs (`GET /students/settings`, read once) only add warnings: `prepareRow(row, mapping, structure, rules)` checks a row
  with `LENIENT_FIELD_RULES` (what stops it) and again with the school's rules (what it lacks: *Not in the file, but your school needs
  it: ...*; the server's copy of that warning is left out). `autoMap(headers, exportColumns)` tries the school's export headings first,
  so its own exported file maps itself. `typedTableFields(rules)` gives the typed table the usual columns plus every detail the school
  needs.

## Export: the school's fields and its Excel (`pages/school/StudentExport.tsx`, `/school/students/export`)

One page for both, kept short so it hardly scrolls (the user found a separate fields page and a grid of column cards confusing; then
asked that a field switched off stay where it is, for up / down arrows, a hand on the rows, fields of the school's own, and no count
strip, no legend, no Undo, the preview behind a button):

```
Export students  (36 students this year)                                     [ Class 5 x ] [ Back to the default ]
(<-) Students > Export
[=] Fields  24 on . 24 off   19 mandatory . 1 of your own                      [ + Add your own field ] [ v ]
    (closed when the page opens; open:)
HEADING IN THE EXCEL      ON    MANDATORY     PLACE  |  HEADING IN THE EXCEL      ON    MANDATORY     PLACE
:: A  Admission No.       (on)  Auto           ^ v   |  :: X  House (gear)        (on)  (on) Mandatory ^ v
       Student                                       |         Your own . List of choices (4)
:: B  Student Name        (on)  lock Always    ^ v   |   -   First Name           (off)  -                  (dimmed)
   -  Age                 (off)  -                   |   ...
...                                                  |
Preview                                         The first 2 of 2 students . 24 columns, exactly as the file will have them
|   | A             | B            | C      | ...
| 1 | Admission No. | Student Name | Gender | ...
To upload this Excel back later through Bulk upload, turn on: Date of Birth (Age is not enough).
Changes not saved yet                                                                            [ Save ] [ Export ]
```

The fields are an accordion, closed when the page opens (the user: the first look is the file; open the fields to change them):
the arrow at the right (or the title) opens and closes it, and it opens by itself when Save finds a heading to fix. After Save the
list stays as it is (a field switched off keeps its place). The count of students is at the top, not on the Export button. The
app's toasts show at the top centre, clear of the bars pinned to the bottom of the forms.

- `components/students/export/ExportFieldsCard.tsx`: every field as a compact row, in two lists side by side on a wide screen
  ("Fields" and "More fields", one order: the left list, then the right): the heading in the Excel (press it to type your own: Enter
  keeps it, Escape puts back what it was), On in green, Mandatory in blue, ↑ ↓, native drag and drop (a row in use shows a hand and
  becomes draggable on a press outside its buttons; a row that moved flashes for a moment). On a phone, Mandatory and the arrows go
  under the field. `CustomFieldDialog.tsx`: add, change (the gear) or delete a field of the school's own, checked with the server's
  words (a list's name, two the same, the choices). `ExportPreviewCard.tsx`: the sheet as it will be, under the fields (the headings
  even with no student), with what an upload back would lack. `utils/exportLayout.ts`: the
  draft `{ rows: [{ key, on, heading }], rules, custom }` and what changes it (`switchRow`: on / off where it stands, with its setting;
  `stepRow`: ↑ ↓ pass the next field in use; `dragRow`, `setMandatory`, `renameRow`, `addCustom` / `editCustom` / `removeCustom`),
  `infoOf` (a field's usual heading, group and what its Mandatory is: the school's setting, its own field, Always, Auto or Optional),
  `rulesForLayout` (both occupations share one setting), `layoutProblems`, `isDefaultLayout` (saved as `null`), `missingForUpload`.
- **Save** sends one `PUT /students/settings` with the changed settings, the school's own fields (when changed) and the columns, and
  puts the answer in the cache (`upsertQueryData`), so Add student follows at once with no read. The bar says *Changes not saved yet*
  or *All saved*. **Back** asks while something is not saved; **Back to the default** asks, then fills the draft (still to save; the
  school's own fields stay, switched off). A list filter from the Students page shows as a chip in the header (its x exports everyone).
- Add student and Edit show the school's own fields in `components/students/form/CustomFields.tsx` (*Your school's own details*: a
  box per kind, ticks as switches); `checkStudentForm` checks them with the server's words; the student's page lists the answers
  (it reads the settings only for a student who has some).
- The preview is one `GET /students/export/preview` (the first 5 students with every column's value), so switching, typing and moving
  ask for nothing. **Export N** saves a change first (the server makes the file from what is saved), then `GET /students/export` with
  the filters.
- The form follows `form.rules` (`utils/fieldRules.ts`: `asks`, `mayLeave`): a field that is off has no box, an optional one says
  "(optional)", a card with nothing to ask is not drawn; the sidebar counts "Other details your school needs".
- **No file**: step 1 also offers *Paste from a sheet* (the text is sent to `POST /students/import/read` as a file named `pasted-table.csv`) and *Type the students here* (`startTyping`: an empty table of 10 rows, **Add 10 rows**; empty rows are `blank`, never a problem, never uploaded).

## Where things live

```
pages/school/Students.tsx             the list: plain header, guide, tiles, filter row, table or cards, pages, empty states
pages/school/StudentImport.tsx        the bulk upload: upload, the editable preview, the upload in parts of 100 rows, the result
pages/school/StudentExport.tsx        the school's fields and Excel on one page: On / Mandatory / place / heading, preview, Save, Export
components/students/export/           ExportFieldsCard (the fields, an accordion), CustomFieldDialog (a field of its own), ExportPreviewCard
utils/exportLayout.ts                 column letters, heading checks, moving, the default layout, what an upload would lack
utils/fieldRules.ts                   asks / mayLeave: how a box follows the school's rules
constants/studentFields.ts            the details a school decides about, the export's columns, the defaults (mirror of the server's)
components/students/import/           ImportStepper, UploadStep, PreviewGrid (the editable table), PreviewPanels (missing columns,
                                      Add column, class names, tabs), ImportPanels (file bar, seats, progress, done), ImportRowsTable
utils/studentImport.ts                matching columns and classes, cleaning values, one row as an admission and its red cells, the CSV
pages/school/StudentAdmit.tsx         the admission form and its questions (full section, possible duplicate)
pages/school/StudentDetail.tsx        one student: the cards, or the edit form
components/students/
  StudentsGuide.tsx, StudentsNotice.tsx                      the first-time guide, the "why it is empty" card
  StudentToolbar.tsx                  the filter row: search, class (+ arrows), section, List / Grid
  StudentTable.tsx, StudentCard.tsx   the same page of students as a table or as cards
  StudentPager.tsx, StudentAvatar.tsx numbered pages and rows per page; the initials badge
  StudentFormHeader.tsx               the plain header of every student page: title (+ a line beside it), the back arrow and breadcrumb, buttons
  form/AdmitSidebar.tsx               the admission page's right column: live preview, form completion, quick tips
  form/FormCard.tsx                   one block of the form (coloured mark, title, ?)
  form/StudentFields.tsx, PlacementFields.tsx, GuardiansCard.tsx, GuardianFields.tsx, AddressFields.tsx, RecordsFields.tsx (IDs,
  previous school), MoreFields.tsx, CustomFields.tsx (the school's own fields), ChoiceSelect.tsx (a list box whose first row
  "Not given" empties it)
  form/AskDialog.tsx                  "are you sure?" that is not a deletion
  form/FormActionBar.tsx              the bar pinned to the bottom of the admission and edit forms (the page puts its buttons in it)
  detail/StudentOverview.tsx, detail/EditStudentForm.tsx, detail/EditSidebar.tsx
hooks/useStudentForm.ts               what is typed: one Save / Admit, messages, Escape, the parent lookup, server answers under the boxes
hooks/useStudentFilters.ts            search, class, section, page and view (List / Grid) in the address
utils/students.ts                     the rules with the server's words, what is sent (only what changed), how a student is shown
constants/students.ts                 the lists, the limits, the messages (the server's exact words), who may admit
redux/api/studentsApi.ts              every request of these pages (RTK Query)
types/students.ts                     the shapes of the data
```

## Which requests these pages make

| Read | Tag | What it is |
| :-- | :-- | :-- |
| `GET /students?...` | `StudentList` | one page of the list |
| `GET /students/:id` | `Student` (by id) | one student's page; a change to one student never re-reads another's |
| `GET /students/capacity` | `Capacity` | how full each section is and its next free roll number (the tiles, the seat cards, "Next free") |
| `GET /academics/structure` | `Structure` (academics) | the class and section names, shared with Classes & Sections |
| `GET /students/settings` | `StudentSettings` | the school's fields and export layout (the forms, Fields, Export, Bulk upload) |
| `GET /students/export/preview?...` | `StudentList` | the first 5 students of the export with every column (the Export page) |

Counted in real Chrome, action by action:

| You do | Requests |
| :-- | :-- |
| Open the list from the menu | 3: the page of students, the seats, the class layout |
| Press Admit student | none (the layout and the seats were just read) |
| Type a parent's mobile number | none until the 10th digit, then 1 `POST /students/guardians/lookup` |
| Press Admit | 1 `POST /students`; the new student's page is filled from the answer and the cached seats move one seat, so nothing is read |
| Admit a sibling | 1 lookup per parent's number, then the admission |
| Type "zoya" in the search | 1 `GET /students?q=zoya...`, 300 ms after the last key |
| Pick a class (dropdown) or step with the arrows | 1 `GET /students?classId=...`; a class or list seen a moment ago and not changed since comes from what is known (none) |
| Pick a section, press a page number, change rows per page | 1 each (`sectionId=`, `page=2`, `limit=24`) |
| Switch List / Grid | none: the same page is drawn another way |
| Open a student not seen yet | 1 `GET /students/:id` (a student just admitted or saved: none) |
| Press Edit | none when the layout and the seats are known (else those two) |
| Save a name and a parent's occupation | 2 writes (`PATCH /students/guardians/:id`, `PATCH /students/:id`), no read: the page takes the answers |
| Move to another section | 1 `PATCH /students/:id/enrolment`, no read |
| Press Bulk upload | none (the layout and the seats are known) |
| Download sample template | 1 `GET /students/import/template` |
| Upload a file | 1 `POST /students/import/read` (a wrong type or size: none) |
| Change cells, column details, add a column, change a class name, leave a row out | none |
| Rows to fix (CSV) | none (the CSV is made in the browser) |
| Upload 10 students | 1 `POST /students/import` per 100 rows (only the ready rows), then the seats are read again once (the page shows them) |
| Go to students (after an import) | 1 `GET /students?...` |
| Press Export | the preview (and the settings when not read yet) |
| Switch a field on / off or Mandatory, rename, move | none |
| Save | 1 `PUT /students/settings` (the settings and the columns); Add student follows with no read |
| Export N | 1 `GET /students/export?...` (after the PUT when something was changed) |
| Paste from a sheet > Show it as a table | 1 `POST /students/import/read` |
| Type the students here, type, Add 10 rows | none |

A change marks stale only what shows it: the list, and the pages of the brothers and sisters (by id). A read that is not on screen is
not fetched after a change: RTK Query drops its copy and reads it when it is next needed. `refetchOnMountOrArgChange: 60`, as for the
classes.

## How it was checked

In real Chrome on a throwaway stack (API on 5001 with its own database, this app on 5174): 29 steps for students (the list's three reads
and empty state; a plain header with no blue banner and the table's columns; the admission page with a plain header, the sidebar to the
right of the form, a bar pinned to the bottom of the screen, the preview and the completion following what is typed, and Clear all asking
and then emptying every box; the form dimmed, every message under its box with nothing sent; Escape; digits-only mobile and one lookup at the 10th digit; Admit as one POST and the page from its answer; Admit a sibling linking
the same parent; a full section asked about and admitted on yes; the duplicate warning with Cancel saving nothing; a roll number refused by
the server under its box; the server's words equal to the form's; search, class, section, the class arrows and page numbers as
single requests; no sort control and an old `sort=` ignored; the filter row on one line with a wide search and two equal dropdowns, and nothing in it moving when a class is picked (Clear keeps its place); List / Grid asking for nothing and remembered after a reload; 20 students over two pages with "Showing 13 to 20 of 20";
opening a student as one read; the edit page (plain header, the student as saved beside the form, a pinned bar, Undo changes and Back asking before they throw typed changes away, no request for any of it); Edit with Escape, Enter and two writes; a move as one write; a phone width where the table, the grid and
the filter row never scroll sideways; a clean console), 14 for the bulk upload as an editable preview (three steps; a school's own sheet
with a title row, whole names and no State column opening as a table in one request, each column's detail recognised in its heading;
the missing State added as a column for every row; "Class 9" changed to Class 8 in every row at once; a name and a mobile corrected in
their cells, Enter and Escape; a column set to Not uploaded and back; a row left out; no request for any edit; one upload request; the
two students over the seats of 5-B returned with the reason and admitted on "admit them all anyway"; the repeat of an admitted row
still marked; own admission numbers, siblings, the corrected values and "B +ve" on the server; the export; a phone width; a clean
console), 5 for a school without an academic year, 8 for Classes & Sections (dialogs,
workspace, delete guards with real students) and 8 for onboarding and the dashboard.

And 16 for the school's fields and Excel on one page: a new school asking only its default list (Aadhaar and the previous school;
no Samagra, religion, More details or admission date; the mother's boxes open at once); Admit with only the basics showing what the
school needs under each box and sending nothing; a wrong Aadhaar refused, a right one typed with spaces taken and the full admission
as one POST; no Fields button on the list; Export from the filtered list in two reads, 24 on and 23 off, Student Name locked, Gender
"Always"; Mandatory switched off (the mother's occupation following the father's), four fields off and Religion on at the end, with
no request and Back asking; Save as one PUT, the server keeping the settings and the columns; Add student following at once (no
Previous school card, Aadhaar optional, Religion asked); a heading renamed, Class moved to A with ‹, Age off and Date of Birth on with
the "upload it back" note following; a field dragged by its grip; a heading used twice refused before saving, Escape; Export saving
first, then the file's headings and order equal to the preview's; that file uploaded back with its own headings recognised and a
warning for the missing Aadhaar; Back to the default saved; a phone width; a clean console.
