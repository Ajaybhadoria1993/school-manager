# Fees (2026-11-12): the set-up

A sidebar row **Fees** that opens four pages: **Fee structure**, **Fee heads**, **Concessions** and **Fee rules** (`/fees/structure|heads|concessions|rules`;
`/fees` leads to the first). The user asked for "a separate Fees tab with modals, covering how fees are kept in a real school: every class's fees,
registration, admission, exam, dress, everything, researched and written down". This is the **set-up** of what a school charges; **collecting** it (a student's fee account, payments, receipts, dues) is the second part below (2026-11-19). It is a new, self-contained module: nothing that existed was changed except the menu, the route
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

## Collecting fees (2026-11-19)

The user asked for "the complete structure and record of fees". Three pages under the same Fees row, for the people allowed **`fees.collect`** (the accountant starts with it): **Collect fees**
(`/fees/collect?student=<id>`), **Dues** (`/fees/dues`) and **Receipts** (`/fees/receipts`).

### What is kept (backend/src/main/fees; all `tenantScope`d, all carry `academicYearId`)

| Model | What it is |
| :--- | :--- |
| **`FeeCharge`** | One instalment a student owes ("Tuition fee · Apr", "Admission fee"): `key` (chart line + month, `bus\|2026-04`), `source` (`chart` / `transport` / `optional`), the head's name as it was, `dueDate`, `amount`, `concession`, `paid`. Owed = `amount - concession - paid`. Unique `{student, year, key}`: making fees twice never doubles anything. |
| **`StudentConcession`** | A school concession **given to one student for one session**, kept as it was when given (mode, value, which heads), `pending` until approved or `approved`, why, who gave it. Unique per student, session and concession. |
| **`FeeReceipt`** | Money taken for one student on one day: numbered **`2026-2027/0001`** in order per school and session (`seq` = highest + 1, a unique index makes two at once retry), mode, reference, `paidOn`, the charges it settled (`items`), `lateFine`, `total`, note, who took it. **Never edited or deleted**: a mistake is cancelled (reason, who, when) and the number stays. The student's name and class are kept as they were. |

### How the account is made

`FeeAccountService.generate` (run whenever an account is opened or a payment is taken; safe to repeat): reads the child's class this session and whether they are **new** (no enrolment in an earlier session) or **existing**, takes
the class's chart lines for that kind (everyone's + new's or existing's, **not** the optional ones), and makes a charge for each due month; a **one-time** fee is one charge, due in the session's first month. The due day is the
Fee rules' due day (`dueDay` of the month; months before the session's first month fall in the next calendar year). The child's **bus stop fee** (docs/transport.md) is a charge for each of the 12 months, `source: transport`.
**Optional** fees are not made: the family takes one with *Add* (`POST /students/:id/optional`, `source: optional`) and it can be taken off only while nothing is paid on it.

- A charge **follows the chart only while nothing is paid on it**: a raised chart reaches the unpaid instalments, what was paid stays as billed. A fee no longer on the chart (class changed, stop taken off, line removed) goes, unless money was paid on it.
- **Concessions** (`reprice`): each approved concession takes a percentage, or a flat amount, off each instalment of the heads it names; "every fee" means the **class's fees** (not the bus, not the optional ones, unless the concession names them); it never takes more
  than what is still unpaid on an instalment. Giving one needs `fees.manage`; the school admin and the principal give at once, for anyone else a concession that *needs approval* waits (`pending`, takes nothing off) until the admin or the principal approves it (`POST /student-concessions/:id/approve`).
  A school concession that has been given to a student cannot be deleted (409 `CONCESSION_IN_USE`: switch it off).
- A **chart line with payments** cannot be deleted (409 `FEE_LINE_HAS_PAYMENTS`); one without payments goes with its unpaid charges.

### Taking a payment (`POST /fees/collect`)

`{ studentId, mode (cash, cheque, dd, upi, card, online), reference, paidOn, items: [{chargeId, amount}], lateFine?, note }`. Checked first, in words (400 with `details` by path): a charge of this student, no more than is owed on it, **the whole instalment when the rules do not allow part payment**,
a cheque or draft number, a day that is not in the future and not before the session. **The late fine** is by the rules (`FeeSettings`): none, a flat amount for each late instalment, an amount for each day late, or a percentage of what is paid for each month (30 days) late; an instalment is late once the
days of grace after its due day have passed; capped by the most a family pays. The cashier may take **less** (waive it), never more (400 on `lateFine`). Then each charge is added to with a **guard** (`paid + amount <= net`), so two cashiers cannot both take the same instalment (409 `ACCOUNT_CHANGED`, nothing is
kept); a failure later undoes what was added (no transactions here). The money is not "held": the receipt is the record.

### The rest of the API (`/api/v1/fees`)

`GET /students/search?q=` · `GET /students/:id/account[?yearId=]` (the account: charges, totals `amount / concession / net / paid / outstanding / dueNow / overdue`, `lateFineToday`, concessions, receipts, optional fees on offer; a past session is only read) · `POST /students/:id/generate` ·
`POST /students/:id/optional`, `DELETE /students/:id/optional/:lineId` · `POST /students/:id/concessions`, `POST /student-concessions/:id/approve`, `DELETE /student-concessions/:id` · `POST /generate` (every student of the running session, or one class: `fees.manage`) ·
`POST /collect` · `GET /receipts?from&to&studentId&mode&status` (a window of days; today when none), `GET /receipts/:id` (with the school and the session, to print), `POST /receipts/:id/cancel { reason }` (`fees.manage`; claimed first so two cancellations cannot both give the money back) ·
`GET /dues?classId&search` (instalments that have come due and are not paid, by student, the late ones apart, with the late fine, worst first) · `GET /collection?from&to` (what was taken: total, by mode, by day, late fine, cancelled).

### Who may (docs/permissions.md)

`fees.collect`: the accounts, taking payments, the dues, receipts. `fees.manage` (as before, now also): give or take back a student's concession, cancel a receipt, make every student's fees. The school admin and the principal always; approving a waiting concession is theirs only.
A teacher or a parent never reaches these.

### What a parent sees

`GET /parent/children/:id/fees` now carries the child's **account** (charges with their standing, the four totals, the concessions in force, the receipts that stand; a cancelled receipt and a concession still waiting are not shown), then the chart, the bus fee and the due rules as before. A parent
**cannot pay here** (no payment gateway): the money is taken at the office. Opening the page makes the child's charges (the same safe `generate`).

### Screens

`pages/fees/{CollectFees,Dues,Receipts}.tsx`; `components/fees/{StudentAccount,CollectDialog,ReceiptDialog,AccountDialogs}.tsx` (`GiveConcessionDialog`, `CancelReceiptDialog`); the printable receipt (`receipt.css` hides the rest of the page while printing);
`feesApi` tag `Collect`; `utils/fees.ts` repeats the late-fine rule so the window offers what the server will accept.

### Tests

Backend `fees/__tests__/collection.test.ts` (26: the status and late-fine rules as numbers, generating and re-generating, the bus, optional fees, concessions and their approval, a payment in full / in part / with the fine / waived, a cheque's number, two payments at once,
receipt numbers, cancelling, the dues, the day's collection, the parent's view, the deletes that are refused, who may, one school never reaching another's); frontend `pages/fees/__tests__/Collect.test.tsx` (20), `utils/__tests__/fees.test.ts`, `pages/parent/__tests__/ChildBusFees.test.tsx`.
Checked in a real browser on the throwaway stack: Collect fees (account, tick, Collect window with the fine, receipt) and the parent's Fees section.

## Not built (the next phases)

1. **Online payment** by a gateway (UPI / card from the parent's phone) and its reconciliation; today a UPI or online payment is one the office has checked and writes down.
2. **Refunds** (caution money on leaving, a withdrawal), a **fee certificate** (80C) for a year; a receipt **cancelled and re-made** in one step.
3. **Dues reminders** before and after the due day (SMS / notification / WhatsApp), and **holding the report card or the transfer certificate** while fees are due (the rules keep the switches; nothing reads them yet).
4. **Concession proof** (an uploaded certificate), the **sibling concession found by itself** from the guardian, the RTE and BPL ticks on a student giving the concession by themselves.
5. **Reports** beyond the day's collection and the dues: collected / due by class and by head, the development-fund account, the fee structure to publish.
6. A student **promoted to the next session** gets the new session's account when it is opened (the charges are per session); carrying an old **balance forward** is not built.
7. **Due dates that differ by fee** (today every fee falls due on the rules' due day), a late fine **posted as a charge** of its own, **advance payment** that waits for a later instalment.

## What a parent sees: the chart (2026-11-19, earlier)

`GET /parent/children/:id/fees` (permission `child.fees`, parents only, the child must be the parent's own), the child's page > **Fees** (`components/parent/ChildFees.tsx`). It is **the school's fee chart for the child's
class this session, not a bill**: nothing is collected or kept per student yet (the phases above), so **what was paid and what is due is not shown**, and the page says so and sends the parent to the office. It gives:

- the fees of the child's class for a student like theirs: everyone's, plus **new** students' for a child with no enrolment in an earlier session, or **existing** students' for one who has (`audience`); each with its amount, how
  often and what it comes to for the year; marked *Optional* or *Given back*; the compulsory total, the optional total and the refundable part (`FeeStructureService.chartFor`);
- the **bus fee** of the stop the child boards at (a month's fee, kept out of the totals: the family chooses the bus; docs/transport.md), when the child rides a route;
- the school's **due day, days of grace, late fine and part payment** (the Fee rules).

A **concession** given to a child is not applied (there are no concessions given to students yet), so the chart is the full amount.

## Open questions for the school

- Does the school charge **new students more** than existing ones (two tuition lines)? It can; is it common enough to ask on Add fee?
- Should **optional** fees (uniform, books) be set per class or one price for all? Today per class, with Add fee able to give one price to many classes at once.
- Is a **fee increase above the state's limit** only a warning (today) or should it need the principal's agreement?
