# 📄 Business Requirements Document (BRD)
## India-Focused School Management & ERP SaaS Platform

| | |
| :--- | :--- |
| **Document Title** | Business Requirements Document |
| **Related Document** | 01_Project_Proposal_and_Product_Blueprint.md |
| **Version** | 1.0 |
| **Date** | August 19, 2026 |
| **Prepared For** | School Management, Trust Board, Key Stakeholders |
| **Prepared By** | Project Coordinator / Product Strategist |
| **Status** | Draft for Client Review |

---

## 1. Purpose of this Document

This BRD translates the product vision described in the Project Proposal into a formal set of **business requirements** — the "what" and "why" the business needs, independent of technical implementation. It is the reference document used to validate scope with the client before functional design begins.

---

## 2. Business Background & Problem Statement

Indian K-12 schools, particularly mid-sized and multi-branch trusts, currently operate with fragmented tools:

- Manual attendance registers and paper fee receipts.
- Fee collection reconciliation done manually across cash, cheque, and multiple UPI apps.
- Parent communication scattered across WhatsApp groups with no audit trail.
- No centralized system for statutory reporting (UDISE+, APAAR) — data compiled manually at year-end, often under deadline pressure.
- No single source of truth when a student has siblings across classes/branches.

This results in **fee leakage, compliance risk, poor parent trust, and high administrative overhead** for school staff.

---

## 3. Business Objectives

| ID | Objective | Success Measure |
| :--- | :--- | :--- |
| BO-01 | Digitize fee collection and reduce reconciliation effort | 90%+ of transactions captured digitally within 3 months of go-live |
| BO-02 | Improve fee recovery rate via automated reminders | Reduce average fee overdue days by 30% |
| BO-03 | Provide statutory-compliant data readiness | 100% UDISE+/APAAR field coverage at onboarding |
| BO-04 | Reduce parent-teacher communication gaps | 80%+ notification open/read rate via WhatsApp/App |
| BO-05 | Enable multi-branch/trust oversight from a single dashboard | Single login for Trust Board across all campuses |
| BO-06 | Reduce staff administrative time on attendance & report cards | 50% reduction in manual report card preparation time |
| BO-07 | Establish a scalable, tiered commercial model | Predictable ARR per student/school tier |

---

## 4. Scope

### 4.1 In Scope (Phase 1 MVP)

Business scope directly maps to the 10 functional modules in the Product Blueprint:

1. School Setup & Configuration (multi-branch, academic year, class/section masters)
2. Student & Family Lifecycle Management (admissions, APAAR/PEN, sibling linking, document vault)
3. Staff & HR Management (directory, allocation, leave workflow)
4. Attendance & Leave Tracking (daily/period-wise, absence notifications)
5. Indian School Fee Engine (fee heads, structures, online/offline collection, receipts)
6. Academics, Examinations & Grading (timetable, homework, exams, board-compliant report cards)
7. Integrated Communication Hub (notices, messaging, omnichannel notifications)
8. Statutory Documents & Certificate Generator (TC, Bonafide, Fee/Tax certificates, ID cards)
9. Unified Parent & Student Mobile App
10. SaaS Super Admin Control Panel (tenant management, module toggles, billing)

### 4.2 Out of Scope (Phase 1)

- Consumer marketplace / product shop features
- Public provider marketplace profiles
- Foreign payment gateways (non-Indian)
- Complex gamification
- Social-media-style content moderation
- AI prompt-based modules
- Transport GPS live-tracking (only stated in Premium tier — needs separate scoping)
- Library management, hostel management, canteen/POS (not mentioned in blueprint — flag for client confirmation)

> **Open Question for Client:** Should Transport live-tracking, Library, and Hostel modules be scoped for a future phase? Recommend capturing as Phase 2 backlog.

---

## 5. Stakeholders

| Stakeholder | Interest / Stake |
| :--- | :--- |
| SaaS Super Admin (Vendor) | Platform uptime, tenant growth, subscription revenue |
| School Admin / Trust Board | Full operational and financial control, compliance assurance |
| Principal / Academic Head | Academic quality, exam integrity, timetable efficiency |
| Accountant / Cashier | Accurate fee ledger, reduced reconciliation effort |
| Teacher / Staff | Ease of attendance, marks entry, communication |
| Parent / Family | Transparency, ease of payment, timely information |
| Student | Access to own academic data |
| Government / Regulatory Bodies | UDISE+, APAAR, DPDP Act compliance |

---

## 6. Business Requirements

Requirements are prioritized using **MoSCoW** (Must have / Should have / Could have / Won't have this phase).

### 6.1 School & Branch Operations

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-01 | The system must support multiple campuses/branches under a single school trust with centralized oversight. | Must |
| BR-02 | The system must allow academic year definition aligned to the Indian school calendar (April–March) with term splits. | Must |
| BR-03 | The system must allow board affiliation (CBSE/ICSE/State Board) configuration per branch. | Must |
| BR-04 | The system must support UDISE+ code and registration number capture per branch. | Must |

### 6.2 Student & Family Management

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-05 | The business requires a single unified student master capturing enrolment, admission, and roll numbers along with category/caste fields for statutory reporting. | Must |
| BR-06 | The business requires APAAR ID and PEN capture with parental consent logging. | Must |
| BR-07 | The business requires parents with multiple children (siblings) to access all children from a single login. | Must |
| BR-08 | The business requires secure digital storage of student documents (Birth Certificate, Aadhaar, Transfer Certificate). | Must |

### 6.3 Staff & HR

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-09 | The business requires a centralized staff directory across teaching, admin, transport, and support roles. | Must |
| BR-10 | The business requires teacher-subject-class allocation to drive timetable and marks-entry access. | Must |
| BR-11 | The business requires a leave application and approval workflow for staff. | Should |

### 6.4 Attendance

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-12 | The business requires daily attendance capture on Web and Mobile. | Must |
| BR-13 | The business requires optional period-wise attendance for senior classes. | Should |
| BR-14 | The business requires automatic parent notification (SMS/WhatsApp) when a student is marked absent. | Must |
| BR-15 | The business requires monthly attendance percentage to auto-populate on report cards. | Must |

### 6.5 Fee Management

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-16 | The business requires configurable fee heads and class-wise fee structures with installment schedules. | Must |
| BR-17 | The business requires support for student-wise concessions and scholarships. | Must |
| BR-18 | The business requires online fee payment via UPI, cards, and net banking through an Indian payment gateway. | Must |
| BR-19 | The business requires offline fee entry (cash/cheque/DD) with cheque bounce tracking. | Must |
| BR-20 | The business requires automatic digital receipt generation on school letterhead. | Must |
| BR-21 | The business requires automated fee due reminders to reduce overdue collections. | Must |

### 6.6 Academics & Examinations

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-22 | The business requires digital timetable creation and homework/classwork distribution. | Must |
| BR-23 | The business requires exam schedule creation and a marks entry portal with weightage calculation. | Must |
| BR-24 | The business requires board-compliant report card formats (CBSE, ICSE, State Board) with teacher remarks. | Must |

### 6.7 Communication

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-25 | The business requires a digital notice board and circular distribution to parents. | Must |
| BR-26 | The business requires two-way parent-teacher messaging with an audit trail. | Should |
| BR-27 | The business requires omnichannel notification delivery: Push, WhatsApp, DLT-registered SMS, Email. | Must |

### 6.8 Statutory Documents

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-28 | The business requires auto-numbered Transfer Certificate and Bonafide Certificate generation. | Must |
| BR-29 | The business requires Fee Paid / Tax Benefit certificate generation. | Should |
| BR-30 | The business requires QR-coded ID card generation for students and staff. | Should |

### 6.9 Mobile Experience

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-31 | The business requires a parent mobile app with sibling switching, fee payment, attendance, homework, and report card access. | Must |

### 6.10 Platform Administration

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| BR-32 | The business requires a Super Admin panel for onboarding, subscription tier management, and module toggling per school. | Must |
| BR-33 | The business requires usage analytics and support ticket visibility at the platform level. | Should |

---

## 7. Regulatory & Compliance Requirements

| ID | Requirement |
| :--- | :--- |
| BR-C01 | System must be **DPDP Act (Digital Personal Data Protection)** compliant — data minimization, encryption at rest, explicit parental consent logging, and role-based access to children's personal data. |
| BR-C02 | System must support **UDISE+** data export formats. |
| BR-C03 | System must support **APAAR (One Nation One Student ID)** field capture and consent linkage. |
| BR-C04 | System must be **DigiLocker-ready** for future document verification integration. |
| BR-C05 | All transactional SMS must use **DLT-registered templates** per TRAI regulations. |

---

## 8. Commercial / Business Model Requirements

| ID | Requirement |
| :--- | :--- |
| BR-M01 | Platform must support tiered subscription plans (Basic, Standard, Premium) with feature gating per tier. |
| BR-M02 | Platform must support both flat annual fee (small schools) and per-student/month pricing (mid/large schools) billing models. |
| BR-M03 | Platform must support custom/negotiated pricing and SLA terms for large trusts (2,000+ students). |

---

## 9. Assumptions

- Client schools have reasonably reliable internet connectivity at the admin/accountant level.
- Parents predominantly have smartphone + WhatsApp access; SMS is the fallback channel.
- Schools will provide historical student/staff data in a structured format (Excel) for migration.
- Payment gateway merchant accounts (Razorpay/PayU/Cashfree) will be set up by the school or facilitated by the vendor.

## 10. Constraints

- Must operate within Indian data residency expectations for student PII.
- SMS delivery is subject to DLT/TRAI approval turnaround time, which is outside platform control.
- Report card formats must be configurable, since exact formats vary by board and even by individual school.

---

## 11. Risks

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Low digital literacy among some parents/staff | Medium | Provide SMS fallback, in-app tutorials, admin-assisted onboarding |
| Payment gateway settlement delays | Medium | Real-time reconciliation dashboard, gateway webhook monitoring |
| Data migration errors from legacy registers/Excel | High | Structured import templates + validation + staged UAT before go-live |
| DPDP Act compliance changes post-launch | Medium | Modular consent framework to adapt to regulatory updates |
| Multi-branch data segregation errors | High | Strict tenant/branch-level data isolation, tested via QA scenarios |

---

## 12. Success Criteria / Acceptance

The business considers Phase 1 MVP successful when:

- All 10 functional modules are live and used by at least one pilot school.
- Online + offline fee collection is fully reconciled in the ledger.
- Report cards are generated for at least one completed exam cycle in a board-compliant format.
- Parent app adoption reaches an agreed threshold (to be defined with pilot school).
- Zero critical data-isolation defects across branches/tenants in UAT.

---

## 13. Approval

| Name | Role | Signature | Date |
| :--- | :--- | :--- | :--- |
| | Client Sponsor | | |
| | Project Coordinator | | |
| | Technical Lead | | |
