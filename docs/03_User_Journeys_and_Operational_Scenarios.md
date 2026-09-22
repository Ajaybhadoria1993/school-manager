# 👥 End-User & Operational Scenarios Guide

**Document Title:** End-User User Journeys, Scenarios & Persona Workflows  
**Target Audience:** School Management, School Staff, Teachers, Accountants, Parents, Students  
**Role:** Project Coordinator / Product Manager  
**Date:** August 19, 2026  

---

## 📖 Executive Summary

This document details the **End-User Perspective** for the Indian School ERP SaaS Platform. It maps real-world school scenarios, daily operational workflows, business requirements, and step-by-step user journeys for each persona (School Admin, Principal, Accountant, Teacher, Parent, Student).

---

## 👤 End-User Personas & Practical Scenarios

### Scenario A: Parent Persona (Priya Sharma - Parent of 2 Children)

#### User Story:
> *"As a parent working full-time, I want to check both my children's homework, pay their quarterly fees via UPI on my phone, and know instantly if they reached school safely without calling the school office."*

#### Practical Step-by-Step Flow:
1. **Morning Attendance Alert:** 
   * Priya receives a WhatsApp / Mobile Push Notification at 8:45 AM:  
     `"Rohan (Class 6-A) marked PRESENT at 8:42 AM. Ananya (Class 2-B) marked PRESENT at 8:38 AM."`
2. **Fee Due & 1-Click UPI Payment:**
   * On the 1st of the month, Priya gets a fee alert with a UPI payment link.
   * She opens the Parent App, switches between Rohan and Ananya in 1 click, reviews the fee breakdown (Tuition + Computer Lab), and taps **Pay via GPay / PhonePe / Paytm**.
   * Instant digital receipt is saved in her app and sent to her WhatsApp.
3. **Homework & Exam Tracking:**
   * At 4:00 PM, Priya checks the app's Homework section to see Rohan’s Science assignment due tomorrow and Ananya’s Math worksheet.

---

### Scenario B: Teacher Persona (Rajesh Kumar - Class 8-B Class Teacher)

#### User Story:
> *"As a teacher, I want to take daily attendance in under 1 minute from my smartphone, post daily homework easily, and enter exam marks without managing physical marksheets."*

#### Practical Step-by-Step Flow:
1. **1-Minute Mobile Attendance:**
   * At 8:30 AM, Rajesh opens the Staff App, selects Class 8-B, and taps students who are absent. All other students default to "Present". He taps **Submit**.
   * System auto-dispatches WhatsApp alerts to parents of absent students.
2. **Homework Broadcast:**
   * After Period 4, Rajesh takes a photo of the Math chalkboard problem set, attaches it to Class 8-B's Math subject module, selects Due Date as "Tomorrow", and clicks **Publish**.
3. **Exam Marks Entry:**
   * Following the Mid-Term exam, Rajesh opens the web portal, enters marks out of 100 for Class 8-B, adds teacher remarks (*"Excellence in Algebra, needs practice in Geometry"*), and clicks **Send to Principal for Approval**.

---

### Scenario C: School Accountant Persona (Sunita Verma - Head Cashier)

#### User Story:
> *"As an accountant, I want to record cash and cheque fee payments at the school counter, issue printed receipts immediately, and generate daily collection reports for the Management."*

#### Practical Step-by-Step Flow:
1. **Counter Fee Collection (Cash/Cheque):**
   * A parent comes to the fee counter with ₹15,000 cash for Q2 fees.
   * Sunita types the student's Admission Number (`ADM-2024-0892`), and the system automatically fetches the fee dues, concessions, and installment breakdowns.
   * Sunita clicks **Collect Cash**, system logs the entry, and generates an official printed receipt with school logo and receipt serial number.
2. **Cheque Reconciliation:**
   * For cheque deposits, Sunita enters Cheque No, Bank Name, and Clearance Date. If a cheque bounces, the system auto-reverts the receipt and triggers a Cheque Bounce Notice + Fine to the parent.
3. **End-of-Day Ledger Report:**
   * At 4:30 PM, Sunita clicks **Export Daily Collection**, generating a breakdown of Cash, Cheque, and UPI collections for the Principal.

---

### Scenario D: Principal Persona (Dr. V. K. Nair - Academic Head)

#### User Story:
> *"As a principal, I want to oversee overall school attendance, approve exam report cards, manage teacher substitutions when someone is on leave, and issue Transfer Certificates (TC) officially."*

#### Practical Step-by-Step Flow:
1. **Morning Operational Dashboard:**
   * Dr. Nair views the dashboard: 96% overall student attendance today; 2 teachers on leave.
2. **Automated Teacher Substitution:**
   * He selects the 2 absent teachers; the system automatically suggests free teachers during those period slots and assigns substitution periods.
3. **Report Card Approval & TC Generation:**
   * Dr. Nair reviews Class 10 Mid-Term marks, clicks **Approve & Publish Report Cards**, releasing them to parent apps.
   * For a departing student, he reviews auto-populated UDISE+, APAAR, attendance, and fee clearance status, then clicks **Generate Official Transfer Certificate (TC)**.
