# MedCore HMS — Phase 6 Security & RBAC Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Focus:** Role-Based Access Control, Tenant Isolation, Financial Integrity & Anti-IDOR  
**Status:** Complete & Production Ready  

---

### 1. Comprehensive Phase 6 Permission Matrix

| Role | Prescriptions (Author / PDF) | Lab Orders (Create) | Lab Results (Upload) | Lab Results (Approve) | Pharmacy (Catalogue / Batches) | Dispensing (FIFO) | Billing (Draft / Finalize) | Cash Payments (Receive) | Portal (`/patients/me`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SUPER_ADMIN** | Read / PDF | Read | ❌ | Read | Read | ❌ | Read | ❌ | ❌ |
| **HOSPITAL_ADMIN** | Read / PDF | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **DOCTOR** | ✅ (Author & PDF) | ✅ | ❌ | ✅ | Read | ❌ | Read | ❌ | ❌ |
| **NURSE** | Read / PDF | ❌ | ❌ | ❌ | Read | ❌ | Read | ❌ | ❌ |
| **LAB_TECHNICIAN** | ❌ | ❌ | ✅ | ❌ (No self-approval) | Read | ❌ | ❌ | ❌ | ❌ |
| **PHARMACIST** | Read / PDF | ❌ | ❌ | ❌ | ✅ | ✅ (FIFO) | Read | ❌ | ❌ |
| **ACCOUNTANT** | ❌ | ❌ | ❌ | ❌ | Read | ❌ | ✅ | ✅ | ❌ |
| **RECEPTIONIST** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Draft & Finalize) | ✅ | ❌ |
| **PATIENT** | Read Own / PDF | ❌ | ❌ | ❌ | ❌ | ❌ | Read Own | Pay Own | ✅ (Own Data) |

---

### 2. Multi-Tenancy & TenantGuard Protection

MedCore HMS maintains complete logical tenant partitioning:
- **Authoritative Tenant Anchor:** Authorization strictly uses `req.user.hospitalId` extracted from the server-validated JWT payload.
- **Client Forgery Immunity:** If a malicious client passes `?hospitalId=foreign-hospital-uuid` or `{ "hospitalId": "..." }` in the body, `TenantGuard` intercepts and blocks the request with `403 Forbidden` (`FORBIDDEN_TENANT_MISMATCH`).
- **Service-Level Filtering:** Every database query in `PrescriptionsService`, `LaboratoryService`, `PharmacyService`, `BillingService`, and `PaymentsService` includes an explicit `where: { hospitalId }` clause.

---

### 3. Financial Security & Payment Hardening

- **Decimal Arithmetic:** Invoices and payment entities use `@db.Decimal(12, 2)` preventing IEEE 754 floating-point inaccuracies.
- **Client Total Rejection:** Invoice totals are strictly computed on the server by summing line items. Client-supplied totals are discarded.
- **Finalized Invoice Immutability:** Invoices transitioned to `ISSUED` status cannot have items appended, edited, or deleted.
- **Cryptographic Webhook Signatures:**
  - Stripe webhook payloads verify the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`.
  - Razorpay webhooks verify SHA256 HMAC signatures against `RAZORPAY_KEY_SECRET`.
- **Webhook Idempotency:** Webhook IDs are recorded in `PaymentWebhookEvent`. Repeated webhook notifications from the payment gateway are acknowledged without duplicate credit application.
- **Cash Counter Audit:** Cash payments must specify receiving cashier identity, producing an auditable receipt identifier (`RCP-<HOSPITAL>-<YEAR>-<COUNTER>`).

---

### 4. Clinical Privacy & Separation of Duties

- **Lab Results Privacy:** Patients cannot query unapproved diagnostic results. Unapproved lab tests are filtered at the database level.
- **Technician Self-Approval Guard:** In [LaboratoryService.reviewOrder](../../backend/src/laboratory/laboratory.service.ts), if the reviewing user ID matches the technician who submitted the structured results, approval is rejected with `403 Forbidden: Laboratory technicians cannot approve their own results`.
- **Anti-IDOR:** Direct object references (`/patients/me/*`) derive the patient identity exclusively from the authenticated user token, eliminating horizontal privilege escalation vulnerabilities.
