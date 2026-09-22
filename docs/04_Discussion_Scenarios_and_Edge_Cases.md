# 📄 Scenarios & Discussion Document
## India-Focused School Management & ERP SaaS Platform

| | |
| :--- | :--- |
| **Document Title** | Scenarios for Client Discussion & Validation |
| **Related Documents** | 01_Project_Proposal_and_Product_Blueprint.md, 02_Business_Requirements_Document.md, 03_Functional_Requirements_Document.md |
| **Version** | 1.0 |
| **Date** | August 19, 2026 |
| **Status** | Draft for Client Review |

---

## 1. Purpose

This document lists **real-world operational scenarios** — happy paths, edge cases, and failure modes — organized by module. Use this in the client workshop to confirm expected system behavior *before* development begins. Each scenario should be marked by the client as **Confirmed**, **Needs Change**, or **Out of Scope**.

Recommended format for each row during the workshop: `Scenario → Expected Behavior → Client Decision`.

---

## 2. School Setup & Multi-Branch Scenarios

| # | Scenario |
| :--- | :--- |
| S-1.1 | A trust operates 3 branches with different board affiliations (one CBSE, one ICSE, one State Board) — can report card templates and fee structures differ per branch under the same tenant? |
| S-1.2 | Mid-year, the school wants to add a new branch — does this require Super Admin involvement, or can School Admin self-serve? |
| S-1.3 | A class/section is renamed mid-year (e.g., "Class 5-A" split into "5-A" and "5-B") — how are already-enrolled students migrated without breaking attendance/fee history? |
| S-1.4 | Academic year rollover (April) — how are students promoted to the next class, and what happens to unresolved dues from the previous year? |
| S-1.5 | A school wants to disable a module (e.g., Transport) mid-year after initially enabling it — is historical data retained or hidden? |

## 3. Admission & Family Management Scenarios

| # | Scenario |
| :--- | :--- |
| S-2.1 | A parent has 3 children in 3 different classes across the **same** branch — single login should show all three; how are separate fee dues per child displayed? |
| S-2.2 | A parent has children in **two different branches** of the same trust — should sibling switching work across branches? |
| S-2.3 | A single parent (only one guardian on record) vs. two guardians with separate logins — how is consent (e.g., for APAAR) recorded when only one guardian is active in-system? |
| S-2.4 | A student transfers from another school mid-year — what minimum documents/fields are mandatory to complete admission? |
| S-2.5 | A student's APAAR ID is not yet issued at admission time — can admission proceed with the field left pending, and how is it tracked for follow-up? |
| S-2.6 | A guardian's custody changes (e.g., legal separation) and access needs to be revoked from one parent account — what is the process and who authorizes it? |
| S-2.7 | Duplicate admission entry is accidentally created for the same student — how is de-duplication/merge handled without losing fee or attendance history? |

## 4. Staff & HR Scenarios

| # | Scenario |
| :--- | :--- |
| S-3.1 | A teacher is on approved leave and a substitute is assigned for 3 days — does the substitute get full class access (marks, homework) or only attendance? |
| S-3.2 | A teacher resigns mid-term — how is their historical attendance/marks-entry data preserved once their account is deactivated? |
| S-3.3 | A staff member teaches across two branches — is this supported, and how does allocation/timetable conflict-checking work across branches? |
| S-3.4 | Leave approval workflow — what happens if the approving Principal is unavailable (out of office) for multiple days? Is there an escalation path? |

## 5. Attendance Scenarios

| # | Scenario |
| :--- | :--- |
| S-4.1 | A teacher forgets to mark attendance for a day — can Admin backfill it, and is this flagged differently from real-time entries? |
| S-4.2 | A student is marked absent by mistake and the teacher corrects it after the absence SMS/WhatsApp has already been sent — does the system send a correction notice to the parent? |
| S-4.3 | Half-day attendance (student leaves early with parent permission) — how is this reflected in the monthly percentage and does it trigger an absence alert? |
| S-4.4 | Attendance during a multi-day school trip/excursion — is there a bulk "excused" status distinct from absent? |
| S-4.5 | A student is on long medical leave (2+ weeks) — should attendance percentage calculation exclude approved medical leave from the denominator, or should it count against the student? |

## 6. Fee Collection Scenarios

| # | Scenario |
| :--- | :--- |
| S-5.1 | Parent initiates a UPI payment, money is debited from their bank, but the webhook confirmation to the school system fails/is delayed — how is this reconciled, and what does the parent see in the meantime? |
| S-5.2 | Parent pays a partial installment amount instead of the full due — is partial payment allowed, and how does it reflect against the outstanding balance? |
| S-5.3 | A cheque submitted for fee payment bounces **after** a receipt was already issued — how is the receipt invalidated, dues re-opened, and parent notified? Are bounce charges configurable? |
| S-5.4 | A student is granted a mid-year concession (e.g., sibling discount approved late) — how does this retroactively adjust already-generated dues/receipts? |
| S-5.5 | A parent wants a refund (e.g., student withdraws after paying annual fee upfront) — does the system support partial refund workflows, or is this handled manually outside the system? |
| S-5.6 | Fee payment is made just after the due date, before a late fee penalty is manually waived by the Accountant — is the late fee automatic, and can it be waived per-transaction? |
| S-5.7 | Multiple children's fees are paid in a single UPI transaction by the parent — does the system support combined payment split across siblings? |
| S-5.8 | A school switches payment gateway providers mid-year (e.g., Razorpay to Cashfree) — how is payment history from the old gateway preserved and displayed? |

## 7. Academics & Examination Scenarios

| # | Scenario |
| :--- | :--- |
| S-6.1 | A teacher submits marks and then realizes an entry error **after** submission lock — what is the correction workflow, and who can reopen it? |
| S-6.2 | A student is absent for an exam — how is this reflected on the report card (blank, "AB", zero, or excluded from average)? |
| S-6.3 | Two subject teachers need to jointly grade one subject (e.g., practicals + theory) — does the marks entry portal support split weightage entry by multiple teachers? |
| S-6.4 | The school wants to withhold a report card until outstanding fees are cleared — should this be a configurable policy toggle? |
| S-6.5 | A report card is published, but the Principal later needs to issue a correction (e.g., grading error found by a parent) — how is a revised report card version-controlled and communicated? |
| S-6.6 | Homework is assigned but a student joins the class late (mid-term transfer) — does the student see homework history from before their admission date? |

## 8. Communication & Notification Scenarios

| # | Scenario |
| :--- | :--- |
| S-7.1 | WhatsApp delivery fails for a parent (number not on WhatsApp, or opted out) — does the system automatically fall back to SMS, and how quickly? |
| S-7.2 | A parent sends a message to a teacher outside school hours — is there an expected response SLA, or an auto-reply indicating office hours? |
| S-7.3 | A notice is sent to "all parents" but some parents have not yet verified their mobile number — how are unverified contacts flagged and handled? |
| S-7.4 | A parent disputes that they never received an important notice (e.g., exam date change) — does the audit log provide delivery + read receipts to resolve the dispute? |
| S-7.5 | A school wants to send a notice only to parents whose fees are overdue — does the messaging module support conditional/segmented audiences? |

## 9. Statutory Document Scenarios

| # | Scenario |
| :--- | :--- |
| S-8.1 | A parent requests a Transfer Certificate for a student with pending dues — should the system block TC generation until dues are cleared, and is this configurable per school policy? |
| S-8.2 | A TC is issued with an error (wrong date/reason) and needs correction — is TC re-issuance version controlled, and does the serial number get reused or a new one issued? |
| S-8.3 | A parent needs a Bonafide Certificate urgently (e.g., for a visa application) — is there an expedited/priority request flow, or is turnaround time uniform? |
| S-8.4 | ID cards need to be reprinted mid-year (student lost the card) — is this a self-service reprint request or does it require Admin approval? |

## 10. Compliance & Data Privacy Scenarios

| # | Scenario |
| :--- | :--- |
| S-9.1 | A parent withdraws consent for APAAR data sharing after initially granting it — what happens to already-submitted UDISE+/APAAR records, and is this legally reversible? |
| S-9.2 | A parent requests full deletion of their child's data after the student has left the school (DPDP "right to erasure") — how does this reconcile with statutory record-retention requirements (e.g., TC records)? |
| S-9.3 | A data breach or unauthorized access attempt is detected — what is the notification workflow to affected schools/parents, and within what timeframe? |
| S-9.4 | An Aadhaar/PAN field is accessed by a staff member without proper authorization level — does the audit log capture and alert on this? |

## 11. Multi-Tenant & Platform Administration Scenarios

| # | Scenario |
| :--- | :--- |
| S-10.1 | A school's subscription lapses (non-payment) — is access immediately revoked, or is there a grace period with read-only access? |
| S-10.2 | Two schools under the same trust want **shared** Trust Board visibility but **separate** day-to-day operations and fee ledgers — how is this modeled (separate tenants vs. one tenant with branches)? |
| S-10.3 | A school wants to upgrade from Basic to Premium tier mid-year — is proration applied, and do newly unlocked features (e.g., Parent App) require re-onboarding of parent accounts? |
| S-10.4 | The Super Admin needs to investigate a support ticket that requires viewing tenant data — what access controls and audit logging apply to prevent SaaS-vendor overreach into school data? |
| S-10.5 | A school wants to export all their data before terminating their subscription — is there a self-service data export feature, and in what format? |

## 12. Mobile App Specific Scenarios

| # | Scenario |
| :--- | :--- |
| S-11.1 | A parent has no smartphone but uses a basic feature phone — is there a minimum web/SMS-only path to stay informed and pay fees (e.g., SMS with a payment link)? |
| S-11.2 | Parent app is used on a poor/intermittent network in a rural area — what is the offline/degraded-connectivity behavior (e.g., cached last-known attendance/homework)? |
| S-11.3 | A parent switches phones and needs to log in on a new device — what authentication method is used (OTP/password), and are old sessions invalidated? |

---

## 13. Scenario Prioritization for Workshop

Recommend grouping the above into three discussion tiers with the client:

| Tier | Focus | Suggested Time |
| :--- | :--- | :--- |
| **Tier 1 — Must Resolve Before Design** | Fee reconciliation (S-5.x), Admission/Sibling logic (S-2.x), Compliance (S-9.x) | Workshop Session 1 |
| **Tier 2 — Resolve Before Build** | Attendance edge cases (S-4.x), Academics/Exams (S-6.x), Statutory docs (S-8.x) | Workshop Session 2 |
| **Tier 3 — Resolve Before UAT** | Communication fallback (S-7.x), Multi-tenant admin (S-10.x), Mobile edge cases (S-11.x) | Workshop Session 3 |

---

## 14. Next Steps

1. Walk through each scenario table with the client, capturing decisions in the blank "Client Decision" column.
2. Any scenario marked **Needs Change** should generate a corresponding update to the BRD/FRD before sign-off.
3. Scenarios marked **Out of Scope** should be explicitly logged as a Phase 2 backlog item, not silently dropped.
4. Once finalized, this document becomes the basis for the **UAT test case suite**.
