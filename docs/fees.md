# Fees (2026-11-12): the set-up

A sidebar row **Fees** that opens four pages: **Fee structure**, **Fee heads**, **Concessions** and **Fee rules** (`/fees/structure|heads|concessions|rules`;
`/fees` leads to the first). The user asked for "a separate Fees tab with modals, covering how fees are kept in a real school: every class's fees,
registration, admission, exam, dress, everything, researched and written down". This is the **set-up** of what a school charges. **Nothing is
collected or billed yet** (see "Not built"). It is a new, self-contained module: nothing that existed was changed except the menu, the route
table, the permissions catalogue (one more group) and the model registry test (three year-free models).

## The four pages

| Page | What it is |
| :--- | :--- |
| **Fee structure** | The fee chart of every class for a session. Classes on the left (what a new student pays in a year, or "Not set"); the chosen class on the right: each fee with its amount, how often, who pays and what a year comes to, and four figures: what a **new student** pays (and how much of it when joining), what an **existing student** pays, the **optional extras**, and the **refundable** part (caution money). Buttons: **Add fee** (one class or many at once), **Copy to other classes**, **Copy fees** (last session's fees with a raise), a session picker (the running and the **upcoming** session, so next year can be set up before April), a pencil and a bin on each line. |
| **Fee heads** | The school's own list of fees (Tuition, Admission, Exam, Uniform...), the same every session. **Add the usual fees** (a checklist of the fees most schools have, with a line on each, the common ones ticked), **Add a fee**, change, switch off, delete (only when it is on no fee chart and in no concession). |
| **Concessions** | The concessions the school gives: why (brother or sister, staff member's child, merit, needy family, RTE seat, defence / government family, sports or arts, single girl child, other), a **percentage or an amount**, **which fees** it takes off (every fee, or the ones ticked), whether it **needs approval**. A new one can start from a usual concession. |
| **Fee rules** | The day of the month a fee is due (1 to 28), days of grace, the **late fine** (none / one flat amount / an amount for each day late / a percentage for each month late, with a most a family pays), part payment, and what the school **holds back while fees are due** (the report card, the transfer certificate). One Save. |

## What is kept (backend/src/main/fees)

- **`FeeHead`**: name (once per school, any case or spacing), `kind` (tuition, admission, development, annual, exam, facility, deposit, transport, hostel,
  supplies, other), `refundable`, the usual frequency, who usually pays and whether it is usually optional (these only fill the Add fee form in),
  note, in use / switched off. The school's own list, **year-free** (`YEAR_FREE_MODELS`).
- **`FeeLine`**: one line of one class's fee chart in one session: `academicYearId`, `classId`, `headId`, **`amount` (one instalment, rupees, up to two decimals,
  above 0, at most ten lakh)**, `frequency`, `dueMonths`, `appliesTo` (every student / new / existing), `optional`, note. **One line for a head in a class and session for each kind of
  student** (unique index): a school that charges a new student more than the rest has two tuition lines. It carries `academicYearId`: a session's chart is its own.
- **`Concession`** and **`FeeSettings`** (one per school, the rules): year-free, the school's own rules.
- All four are `tenantScope`d, each has an isolation case (`fees.isolation.test.ts`).

### How a line is read

- **The amount is for one instalment.** Tuition 1,200 monthly is 1,200 a month; the year is the amount times the months it falls due in.
- **Frequency and months:** `one_time` (no months: paid when the child joins), `yearly` (1 month), `half_yearly` (2), `quarterly` (4), `monthly` (1 to 12: a school that does not
  take May and June ticks 10). The usual months are counted from the month **the session starts** (April for most schools, but it is the session's own first month): quarterly from April is
  Apr, Jul, Oct, Jan. The server refuses months that do not fit the frequency, in words ("Choose 4 months: the fee is charged four times a year").
- **A one-time fee is for new students only** (registration, admission, caution money); the server refuses "every student". A fee charged every year to a child who stays on (re-admission) is `yearly` + `existing`.
- **Optional** means the family chooses it (uniform, books, the bus, a hostel bed): it is not added to what the child must pay; the chart says it apart as "Optional extras".
- **Transport has no amount on a class's chart** (`TRANSPORT_FEE_BY_STOP`): it comes from the stop the child boards at (Transport > Routes, the stop's monthly fee). The page says so.
- **Totals** (`totalsOf`): a new student = every compulsory line that is for everyone or for new students (a one-time fee once, the others for each due month); an existing student = every compulsory line that is for everyone or
  for existing students; `atJoining` = the one-time part of a new student's; `refundable` = the refundable part (caution money); `optional` = every optional line over the session.
- **Warning**: a class whose **development fee is more than 15% of its tuition fee** is flagged (see Research).

### Sessions

- Reads answer for the session being looked at (a closed year via `X-Academic-Year`, otherwise the running one) or for `?yearId=` (any of the school's); a closed year is read only app-wide (`yearView`, 409 `YEAR_READ_ONLY` for every change).
- Changes go to the **running** session, or to the **upcoming** one (`yearId` in the body). That is the real use: next year's fees are decided in February, with a raise.
- **Copy last session's fees** (`POST /structure/copy-year`, `raisePercent` 0 to 100): copies every line of the session before the target (by start day) into it, each amount raised by the percentage and rounded to a **whole rupee**; a line a class already has is kept; a class
  or a fee that no longer exists is left out. 409 `NO_PREVIOUS_YEAR` / `NOTHING_TO_COPY`.
- **Copy to other classes** (`POST /structure/copy-class`): Class 6, 7 and 8 often pay the same. A fee a class already has is kept, or changed to the source class's when `replace` is on.

## API (`/api/v1/fees`)

`GET /structure[?yearId=]` (the session, the sessions that can be set up, every class with its lines, totals and warnings, and the fees that are on: ONE read for the whole page), `POST /structure/lines` (`classIds[]` = the same fee for many classes
at once; 409 `FEE_LINE_EXISTS` names the classes that already have it and **writes nothing**), `PATCH|DELETE /structure/lines/:id`, `POST /structure/copy-class`, `POST /structure/copy-year`;
`GET|POST /heads`, `POST /heads/many` (the usual fees in one go; a name the school has is left alone), `PATCH|DELETE /heads/:id` (409 `FEE_HEAD_IN_USE`; 409 `FEE_HEAD_NAME_TAKEN`);
`GET|POST /concessions`, `PATCH|DELETE /concessions/:id`; `GET|PUT /rules`. Other answers: 400 `CLASS_NOT_FOUND`, `FEE_HEAD_NOT_FOUND`, `FEE_HEAD_OFF`, `TRANSPORT_FEE_BY_STOP`; 409 `NO_ACADEMIC_YEAR`.

## Who may use it (docs/permissions.md)

Two permissions for the staff kinds: `fees.view` (the four pages) and `fees.manage` (change; brings `fees.view`). The school admin and the principal always. The **accountant** starts with both (fees are new and their fee chart is their work, so nobody
loses anything); every other kind starts without. A teacher or a parent never reaches these pages (`requireSchoolPermission`). The Add / Change / Copy buttons show only to those who may change, and not while a past year is open.

## Screens (FrontEnd-React)

`pages/fees/{FeeStructure,FeeHeads,Concessions,FeeRules}.tsx`; dialogs in `components/fees/` (**FeeLineDialog**, FeeHeadDialog, UsualFeesDialog, CopyFeesDialog, ConcessionDialog, FeeBits = class checklist and month chips);
`redux/api/feesApi.ts` (one tag `Fees`: every change makes what is open stale, each page asks again once); the research lives in `constants/fees.ts` (`USUAL_FEES`, `USUAL_CONCESSIONS`, `RAISE_NEEDS_APPROVAL_ABOVE`); words in `utils/fees.ts`.

## Research: what Indian schools charge (2026-11-12)

What a real school's fee chart holds, and how each is usually charged. `USUAL_FEES` is this list (ticked = what nearly every school has).

| Group | Fee | Usually | Who pays | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Registration and admission | **Registration fee** (the form) | once | new | usually **not given back**, even if the child does not join (some schools charge a prospectus / form fee apart) |
| | **Admission fee** | once | new | the biggest one-time charge; usually not given back |
| | Re-admission fee | every year | existing | some schools charge it each year to a child who stays on |
| Refundable deposit | **Caution money** (security deposit) | once | new | **given back** when the child leaves, after any dues (Uttar Pradesh's Act: within 30 days of the TC) |
| Tuition | **Tuition fee** | monthly or quarterly | all | the largest part of a fee chart; some schools skip May and June (10 months) |
| Development | Development fee | every year | all | for furniture and equipment; see the 15% limit below |
| Annual charges | **Annual charges** | every year | all | upkeep, library, labs, office |
| Exam | **Exam fee** | once or twice a year, or with each term | all | |
| | Board registration fee | every year | all | paid to the board for **Class 9 and 11**: add only to those classes |
| | Board exam fee | every year | all | **Class 10 and 12** only |
| | Practical exam fee | every year | all | senior science / computer |
| Facilities and activities | **Computer**, **Library**, **Sports** | every year | all | |
| | Science lab | every year | all | usually from Class 6 or 9 |
| | Activity, Smart class, Student insurance, Medical check-up | every year | all | |
| | Picnic / excursion, Annual day | every year | all (optional) | optional unless the school makes it compulsory |
| Uniform, books, stationery | **Uniform (dress)**, **Books** | every year / when joining | **optional** | if the school sells them; the family chooses |
| | Sports uniform and PT kit, Stationery, School bag | | optional | |
| | School diary, ID card, Tie / belt / badge | every year | all (the tie, belt and badge: new) | |
| Transport | **Transport fee** | monthly | optional | **by the stop**, not by the class: from Transport > Routes |
| Hostel and mess | Hostel, Mess, Laundry | monthly | optional | |
| Other | PTA fund, Magazine, Transfer certificate fee | every year / once | | many schools charge nothing for a TC |

**Concessions** (`USUAL_CONCESSIONS`; there is no national standard, the percentages are the school's own): **sibling** (usually 5% to 15% on tuition, for the second and later child), **staff member's child** (often 50% of tuition and no admission fee),
**RTE free seat** (the 25% free seats a private school gives under the Right to Education Act: the child pays nothing), **needy family (EWS / BPL)**, **merit** (for example 25% to the top 5 of a class), **single girl child**, **defence / government family**
(often on the admission fee), **sports or arts achiever**.

**Rules** a school sets: a due day, days of grace, a **late fine** (a flat amount, an amount a day, or a percentage a month, with a cap), part payment, holding the report card or the transfer certificate while fees are due (docs/04 S-6.4: "a configurable policy toggle").

### What the law says, and what the software does about it

| Rule | Source | What is built |
| :--- | :--- | :--- |
| A **development fee** may be charged for furniture and equipment, up to **15% of the tuition fee** (and is a capital receipt, kept in its own account). | Supreme Court, *Modern School v. Union of India* (2004) 5 SCC 583. A Delhi summary (a secondary source) says it is capped at 10% there; **some states set their own**. | A class's chart is **flagged** when its development fee is more than 15% of its tuition fee (a warning, not a block). The separate **account** for it is for the collection phase. |
| A fee raise of **up to 10%** on the year before needs no permission; **more than 10%** needs the district fee committee, more than 15% the state committee; the proposed fee structure is filed each year. | Madhya Pradesh Niji Vidyalaya (Fees tatha sambandhit vishayon ka viniyaman) Adhiniyam, 2017 and its 2020 Rules (the school's home state). | **Copy fees** with a raise above 10% says so ("check your state's rule"), and does not block it. Filing is not built. |
| **No capitation fee**; fees must match the facilities; **full disclosure, no hidden charges**; fees are charged under the heads the bye-laws allow. | CBSE affiliation bye-laws (2018 revision), the Supreme Court's capitation-fee rulings. | Every fee is a named head on a published chart; nothing hidden. Publishing the chart on a website is for later. |
| **RTE:** free education for children admitted to the 25% free seats (from the entry class up to Class 8). | RTE Act 2009, s.12(1)(c). | The **RTE free seat** concession (100%, every fee). The student's *RTE seat* tick already exists; linking it is for the collection phase. |
| **Caution money is refundable.** | School practice; state Acts (Uttar Pradesh: 30 days from the TC). | A head can be marked **refundable**; the chart shows the refundable part apart. The refund itself is for later. |
| Services a school gives its own students (tuition and the like) are generally **GST-exempt**. | Check with your CA. | No GST on any line. |

Sources: [Modern School v. Union of India, 2004 (Indian Kanoon)](https://future.indiankanoon.org/doc/1421376/); [CBSE affiliation bye-laws](https://no4korba.kvs.ac.in/sites/default/files/3301-99-13affiliationbyelaws14112012.pdf);
[CBSE revamps norms of affiliation, 2018](https://www.pressreader.com/india/hindustan-times-delhi/20181019/281943133858120); [Madhya Pradesh Niji Vidyalaya Fees Rules, 2020](https://www.legitquest.com/act/madhya-pradesh-niji-vidyalaya-fees-tatha-sambandhit-vishayon-ka-viniyaman-rule-2020/D407);
[MP High Court on the 10% limit](https://future.indiankanoon.org/doc/95740962/); [Uttar Pradesh Self-financed Independent Schools (Fee Regulation) Act, 2018](https://lawgist.in/states/uttar-pradesh/uttar-pradesh-self-financed-independent-schools-fee-regulation-act-2018/3);
[Ezyschooling fee study](https://ezyschooling.com/parenting/expert/school-fees-analysed-through-ezyschooling-fee-index); schools' own fee schedules (registration / admission / caution money / development / exam).
Several of these are secondary summaries: **check the current state notification** before relying on a figure.

## Tests

Backend `fees/__tests__/fees.test.ts` (heads, the chart, months, totals, the 15% warning, copying, the upcoming session, a closed session, concessions, rules, who may use it) and `fees.isolation.test.ts`; `permissions.test.ts` (the accountant starts with fees).
Frontend `utils/__tests__/fees.test.ts` and `pages/fees/__tests__/Fees.test.tsx` (the four pages and their dialogs, with a pretend API), `navConfig.test.ts`.

## Not built (the next phases, in the order a school needs them)

1. **A student's fee account**: when a student is admitted (or the year starts) the class's chart becomes what *that* child owes, instalment by instalment, with the due dates from the rules; the optional fees the family chose; the transport fee from the stop the child boards at
   (students are not linked to Transport routes yet). Needs a `StudentFee` / ledger that points to the **enrolment** (so it has the year, class and section) and carries `academicYearId`.
2. **Concessions given to a student**, with a reason, approval and a proof (the RTE tick, BPL tick and category on a student already exist); a sibling concession found by the guardian.
3. **Collecting**: cash, cheque (with bounce), DD, UPI / online (a gateway), part payment, a **receipt** numbered in order per school per financial year, the late fine from the rules, advance payment, a day's collection report.
4. **Dues and reminders**: who owes what, by class; reminders before and after the due day; holding the report card / TC when the rules say so.
5. **Refunds** (caution money on leaving, a withdrawal), cancelling a receipt, a **fee certificate** (80C) for a year.
6. **Reports**: collected / due / overdue by class, head-wise, the development-fund account, the fee structure to publish.
7. **Smaller things**: due dates that differ by fee (today every fee falls due on the rules' due day, in the months of the line); rounding a raise to ₹10; a fee chart that is a band of classes ("Class 6 to 8") instead of copies; copying a chart between the school's mediums;
   a class that is deleted leaves its lines behind (they are not shown); a parent seeing their child's fees.

## Open questions for the school

- Does the school charge **new students more** than existing ones (two tuition lines)? It can; is it common enough to ask on Add fee?
- Should **optional** fees (uniform, books) be set per class or one price for all? Today per class, with Add fee able to give one price to many classes at once.
- Is a **fee increase above the state's limit** only a warning (today) or should it need the principal's agreement?
