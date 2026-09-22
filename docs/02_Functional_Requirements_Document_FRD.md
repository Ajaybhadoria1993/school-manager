# 📄 Functional Requirements Document (FRD)
## India-Focused School Management & ERP SaaS Platform

| | |
| :--- | :--- |
| **Document Title** | Functional Requirements Document |
| **Related Documents** | 01_Project_Proposal_and_Product_Blueprint.md, 02_Business_Requirements_Document.md |
| **Version** | 1.0 |
| **Date** | August 19, 2026 |
| **Status** | Draft for Client Review |

---

## 1. Purpose

This FRD details **how the system must behave** to satisfy the business requirements in the BRD. Each functional requirement (FR) is traceable to a business requirement (BR) ID, includes acceptance criteria, and is tagged with priority (Must/Should/Could).

---

## 2. System Overview

The platform is a **multi-tenant SaaS** application with:
- **Web application** — Super Admin, School Admin, Principal, Accountant, Teacher/Staff
- **Mobile application** (Android/iOS) — Parent, Student, and optionally Teacher
- **Backend services** — Multi-tenancy engine, RBAC, billing, notification dispatch, payment gateway integration

---

## 3. User Roles & Permission Matrix

| Module | Super Admin | School Admin | Principal | Accountant | Teacher | Parent | Student |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Tenant/School Config | Full | View | — | — | — | — | — |
| Branch/Academic Setup | — | Full | View | — | — | — | — |
| Student Admission | — | Full | Full | View | View | — | — |
| Staff Management | — | Full | View | — | — | — | — |
| Attendance Entry | — | View | View | — | Full (own class) | View (own child) | View (self) |
| Fee Structure Setup | — | Full | View | Full | — | — | — |
| Fee Collection | — | View | View | Full | — | Pay Online | — |
| Timetable | — | Approve | Full | — | Propose | View | View |
| Homework/Classwork | — | View | View | View | Full | View | View |
| Exam & Marks Entry | — | View | Approve | — | Enter | View results | View results |
| Report Cards | — | View | Approve/Publish | — | Enter remarks | View/Download | View/Download |
| Notices/Messaging | — | Full | Full | View | Send (own class) | View/Reply | View |
| Certificates (TC/Bonafide) | — | Full | Approve | View | — | Request | — |
| Subscription/Billing (SaaS) | Full | View own invoice | — | — | — | — | — |

> Exact matrix to be validated with client during requirements walkthrough — flagged permissions (e.g., Teacher sending notices) should be confirmed as configurable per school policy.

---

## 4. Functional Requirements by Module

### Module 1 — School Setup & Configuration (Ref: BR-01 to BR-04)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-1.1 | System shall allow School Admin to create/edit multiple branches with campus code, address, and board affiliation. | Branch created with unique code; visible in branch selector across app. |
| FR-1.2 | System shall allow definition of academic year (start/end date) and term/semester splits. | Academic year cannot overlap with an existing active year for the same branch. |
| FR-1.3 | System shall allow creation of Class → Section → Subject hierarchy, including elective/optional subjects. | Subject can be marked "elective"; student can be assigned electives individually. |
| FR-1.4 | System shall capture UDISE+ code, registration number, and allow letterhead/logo upload per branch. | Letterhead appears on generated receipts, certificates, and report cards for that branch. |

### Module 2 — Student & Family Lifecycle Management (Ref: BR-05 to BR-08)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-2.1 | System shall generate a unique Enrolment Number, Admission Number, and Roll Number per student, following a configurable numbering scheme. | Numbers are unique within a branch/academic year and non-editable post-generation without audit log entry. |
| FR-2.2 | System shall capture House and Category/Caste fields as optional/mandatory per government reporting need. | Field-level configuration by School Admin; validation rules configurable. |
| FR-2.3 | System shall capture 12-digit APAAR ID and PEN with a linked parental consent record (timestamp, consenting guardian). | Record cannot be saved without consent flag = true. |
| FR-2.4 | System shall support linking multiple students to one or more parent/guardian accounts (sibling mapping). | One parent login displays all linked children in a switcher UI. |
| FR-2.5 | System shall provide a document vault supporting upload of Birth Certificate, Aadhaar copy, and Transfer Certificate, with file type/size validation. | Only PDF/JPG/PNG accepted, max size enforced, documents encrypted at rest. |

### Module 3 — Staff & HR Management (Ref: BR-09 to BR-11)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-3.1 | System shall maintain a staff directory categorized by Teaching/Admin/Transport/Support. | Filterable, searchable directory with designation and contact fields. |
| FR-3.2 | System shall capture qualification, Aadhaar/PAN, and salary grade per staff member. | Sensitive fields (Aadhaar/PAN) masked in UI by default, visible only to authorized roles. |
| FR-3.3 | System shall support a Teacher-Subject-Class allocation matrix. | Allocation drives which classes/subjects a teacher sees for attendance, homework, marks entry. |
| FR-3.4 | System shall support substitution workflow when a teacher is on leave. | Substitute teacher gets temporary access to the affected class/period only. |
| FR-3.5 | System shall support staff leave application and multi-level approval. | Leave request status visible to requester; approver notified; leave balance auto-updated. |

### Module 4 — Attendance & Leave Tracking (Ref: BR-12 to BR-15)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-4.1 | System shall allow teachers to mark daily attendance (Present/Absent/Late/Half-Day) via Web and Mobile. | Attendance locked after a configurable cut-off time, editable only by Admin with audit log. |
| FR-4.2 | System shall optionally support period-wise attendance for configured classes. | Configurable toggle per branch/class; aggregates into daily status. |
| FR-4.3 | System shall trigger an automatic WhatsApp/SMS notification to parents when a student is marked absent. | Notification sent within a configurable time window (e.g., within 30 minutes of attendance submission). |
| FR-4.4 | System shall auto-calculate monthly/term attendance percentage and feed it into the report card module. | Percentage recalculates automatically on any attendance correction. |

### Module 5 — Indian School Fee Engine (Ref: BR-16 to BR-21)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-5.1 | System shall allow creation of Fee Heads (Tuition, Admission, Lab, Transport, Development Fund, etc.). | Fee heads reusable across multiple fee structures. |
| FR-5.2 | System shall allow class-wise fee structure creation with configurable installment schedules (Monthly/Quarterly/Annual). | Installment due dates auto-generate per academic year calendar. |
| FR-5.3 | System shall support student-wise concessions/scholarships as a flat amount or percentage, per fee head. | Concession requires Admin/Accountant approval and reason code; reflected in ledger. |
| FR-5.4 | System shall integrate with Razorpay/PayU/Cashfree for UPI, Cards, and NetBanking payments, including dynamic UPI QR codes. | Payment status updates in real time via webhook; retries on webhook failure. |
| FR-5.5 | System shall support offline payment entry (Cash/Cheque/DD) by Accountant, including cheque number and bounce status tracking. | Cheque marked "bounced" reverses the fee credit and re-opens the due amount, with parent notification. |
| FR-5.6 | System shall auto-generate a digital fee receipt (with letterhead) immediately upon successful payment, downloadable/printable. | Receipt number sequential and non-reusable, per branch, per financial year. |
| FR-5.7 | System shall send automated due-date reminders via WhatsApp/SMS/Push at configurable intervals before and after due date. | Reminder schedule configurable by Accountant; stops automatically once paid. |
| FR-5.8 | System shall provide a real-time fee collection dashboard (collected vs. due vs. overdue) filterable by class/branch. | Data refresh within 5 minutes of a transaction. |

### Module 6 — Academics, Examinations & Grading (Ref: BR-22 to BR-24)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-6.1 | System shall allow timetable creation with period slots, breaks, and teacher-subject mapping conflicts checked automatically. | System blocks saving a timetable that double-books a teacher in the same period. |
| FR-6.2 | System shall allow homework/classwork creation with file attachments (PDF/image), visible to assigned class/section only. | Parent/student notified upon publish. |
| FR-6.3 | System shall allow exam schedule creation (Unit Test, Mid-Term, Final) per class. | Exam dates validated against academic calendar/holidays. |
| FR-6.4 | System shall provide a marks entry portal supporting weightage-based calculation (Internal + Written). | Total auto-computed; entry locked after submission unless reopened by Principal. |
| FR-6.5 | System shall generate board-compliant report cards (CBSE CCE/GPA, ICSE, State Board) including attendance % and teacher remarks. | Report card template selectable per board; exportable as PDF. |
| FR-6.6 | System shall route report card publishing through a Principal approval step before parent visibility. | Report card not visible to parent until "Published" status set. |

### Module 7 — Integrated Communication Hub (Ref: BR-25 to BR-27)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-7.1 | System shall allow School Admin/Principal to publish notices/circulars to selected audiences (all/branch/class/section). | Read-receipt tracking available to sender. |
| FR-7.2 | System shall support two-way Parent-Teacher messaging with a persistent audit log. | Messages timestamped, non-deletable, exportable for dispute resolution. |
| FR-7.3 | System shall dispatch notifications via Push, WhatsApp Business API, DLT-registered SMS, and Email, with channel fallback logic. | If WhatsApp delivery fails within X minutes, system falls back to SMS automatically. |

### Module 8 — Statutory Documents & Certificate Generator (Ref: BR-28 to BR-30)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-8.1 | System shall generate Transfer Certificates with auto-incremented serial numbers, per branch. | Serial number sequence never repeats, even across academic years. |
| FR-8.2 | System shall generate Bonafide Certificates on demand with configurable purpose text. | Generated PDF includes school letterhead and authorized signatory placeholder. |
| FR-8.3 | System shall generate Fee Paid / 80G Tax Benefit certificates summarizing a student's paid fee for a financial year. | Amounts must reconcile exactly with the fee ledger. |
| FR-8.4 | System shall generate QR-coded ID cards for students and staff, exportable as print-ready PDF (batch and individual). | QR code encodes a verifiable student/staff reference ID. |

### Module 9 — Unified Parent & Student Mobile App (Ref: BR-31)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-9.1 | App shall present a dashboard with sibling switcher for parents with multiple linked children. | Switching child updates all views (fees, attendance, homework) contextually. |
| FR-9.2 | App shall show live fee due amount with 1-click UPI checkout. | Checkout completes within the app without redirect confusion; status reflected instantly. |
| FR-9.3 | App shall display attendance calendar with color-coded (green/red/yellow) day status. | Calendar reflects corrections within the sync window. |
| FR-9.4 | App shall provide homework tracker and downloadable report cards. | Report card downloadable as PDF, viewable offline once downloaded. |
| FR-9.5 | App shall show school event calendar and a notification inbox with read/unread state. | Notifications persist across sessions until explicitly cleared. |

### Module 10 — SaaS Super Admin Control Panel (Ref: BR-32, BR-33)

| FR ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| FR-10.1 | System shall provide an onboarding wizard to create a new school tenant with initial admin user. | New tenant fully isolated from all other tenant data upon creation. |
| FR-10.2 | System shall allow activation/deactivation of a tenant and management of subscription tier (Basic/Standard/Premium). | Deactivated tenant users cannot log in; data retained per retention policy. |
| FR-10.3 | System shall allow per-module feature toggling per school (e.g., disable Transport module). | Disabled module hidden from all roles within that tenant, without deleting underlying data. |
| FR-10.4 | System shall provide platform-wide usage analytics and a support ticket queue. | Analytics dashboard filterable by tenant, date range, and module usage. |

---

## 5. Non-Functional Requirements

| Category | Requirement |
| :--- | :--- |
| **Performance** | Page load under 3 seconds on 4G; payment confirmation reflected within 5 seconds of gateway callback. |
| **Scalability** | Must support horizontal scaling to onboard 500+ school tenants without architecture change. |
| **Availability** | 99.5% uptime SLA for Standard/Premium tiers; documented maintenance windows communicated in advance. |
| **Security** | Role-based access control, encryption at rest and in transit, PII masking for Aadhaar/PAN, secure session management. |
| **Data Isolation** | Strict tenant-level and branch-level data segregation; no cross-tenant data leakage under any role. |
| **Auditability** | All fee transactions, marks entries, and attendance corrections must maintain an immutable audit trail. |
| **Localization** | UI must support English + at least one regional language (to be confirmed with client — e.g., Hindi). |
| **Backup & DR** | Daily automated backups; documented RTO/RPO for disaster recovery. |
| **Accessibility** | Mobile app and web portal should meet basic accessibility standards (readable font sizes, color-contrast for attendance indicators). |

---

## 6. Integration Requirements

| Integration | Purpose | Notes |
| :--- | :--- | :--- |
| Razorpay / PayU / Cashfree | Online fee collection (UPI, Cards, NetBanking) | Webhook-based reconciliation required |
| WhatsApp Business API | Primary notification channel | Requires approved message templates |
| SMS Gateway (DLT-registered) | Fallback notification channel | TRAI DLT template registration is a prerequisite, has lead time |
| Email (SMTP/Transactional) | Receipts, certificates, report card delivery | — |
| UDISE+ Export | Government compliance reporting | Export format to be confirmed against latest UDISE+ schema |
| APAAR / DigiLocker | Student ID verification (future-ready) | Phase 1: field capture only; live API integration may be Phase 2 |

---

## 7. Data Requirements

- Structured Excel import templates for Student, Staff, and historic Fee data during onboarding.
- Data validation rules (mandatory fields, format checks) applied at import and at manual entry.
- Retention policy for a departed student's data (post-TC issuance) — **to be confirmed with client**, recommended minimum per RTE/board record-keeping norms.

---

## 8. Reporting Requirements

| Report | Audience | Frequency |
| :--- | :--- | :--- |
| Fee Collection Summary (branch-wise) | Accountant, School Admin | Daily/On-demand |
| Attendance Summary | Principal, School Admin | Daily/Monthly |
| Outstanding Dues Report | Accountant | Weekly/On-demand |
| Exam Performance Analytics | Principal | Per exam cycle |
| Staff Leave Summary | School Admin | Monthly |
| Tenant Usage & Billing Report | SaaS Super Admin | Monthly |

---

## 9. Traceability Note

Every FR in this document maps to one or more BR IDs in the Business Requirements Document. Any new functional requirement raised during design/UAT that does not trace to an existing BR must be logged as a **scope change request** for client sign-off.
