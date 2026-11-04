# MedCore HMS — Phase 6 Patient Self-Service Portal Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Patient Portal & Anti-IDOR Security  
**Status:** Complete & Production Ready  

---

### 1. Overview & Architecture

The Patient Self-Service Portal provides patients with secure, direct visibility into their healthcare records, medications, pathology diagnostics, hospital bills, and notifications.

Accessible via:
- **Frontend URL:** `/portal`
- **Backend API Routes:** `/api/v1/patients/me/*`

#### Anti-IDOR (Insecure Direct Object Reference) Protection
All patient portal endpoints resolve identity exclusively from the authenticated JWT session context (`req.user.id`). Client requests cannot pass a `patientId` query parameter or body property to impersonate another patient. If a patient attempts to access another patient's records or invoices through path parameters, the controller or service intercepts the request and throws `403 Forbidden`.

---

### 2. Functional Sections

#### A. My Prescriptions
- **Endpoint:** `GET /api/v1/patients/me/prescriptions`
- **Capabilities:**
  - Displays list of verified clinical prescriptions.
  - Shows prescribing physician name, department, date, and status (`PENDING`, `PARTIALLY_DISPENSED`, `DISPENSED`).
  - Item details: drug name, form, strength, dosage, frequency, duration, quantity, instructions.
  - **Download Signed PDF:** Directly triggers `GET /api/v1/prescriptions/:id/pdf` to stream the official signed PDF with hospital letterhead and physician digital verification signature.

#### B. My Lab Reports
- **Endpoint:** `GET /api/v1/patients/me/lab-orders`
- **Clinical Governance Standard:**
  - Strictly returns only orders where `status === 'APPROVED'`.
  - Unapproved, in-process, or rejected lab results are filtered out at the service layer and never sent to the client.
  - Displays structured telemetry: test name, measured numeric or qualitative value, reference ranges, measurement units, and diagnostic flags (`NORMAL`, `ABNORMAL`, etc.).
  - Shows reviewing doctor identity and validation timestamp.

#### C. My Invoices & Payments
- **Endpoint:** `GET /api/v1/patients/me/invoices`
- **Capabilities:**
  - Itemized financial summary: Consultation, diagnostic tests, and pharmacy medicines.
  - Real-time balances: Subtotal, taxes, discounts, grand total, paid amount, and outstanding balance.
  - **Pay Online Action:** Calls `POST /api/v1/payments/initiate` to launch Stripe or Razorpay digital checkout.
  - Historical payment receipts and cashier records.

#### D. My Notifications
- **Endpoint:** `GET /api/v1/patients/me/notifications`
- **Capabilities:**
  - In-app notification feed of appointment confirmations, lab report publications, pharmacy ready alerts, and payment receipts.
  - Mark-read capability and unread counter badges.

---

### 3. Patient Portal Verification Tests

The patient self-service portal was verified using end-to-end HTTP integration tests under authenticated patient JWT credentials:
- **Test 41**: Patient can retrieve their own prescriptions (18 personal prescriptions retrieved).
- **Test 42**: Cross-patient prescription query attempts return zero leaked records across tenant boundaries.
- **Test 43**: Patient queries return strictly `APPROVED` lab reports; unapproved reports are hidden.
- **Test 44**: Patient can retrieve their personal billing invoices.
- **Test 45**: Patient attempting to initiate payment for another patient's invoice receives `403 Forbidden`.
- **Test 46**: Patient notification feed scopes exclusively to the authenticated user.
