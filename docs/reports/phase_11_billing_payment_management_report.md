# MedCore HMS — Phase 11: Billing & Payment Management Implementation Report

**Repository Root:** `MedCore-HMS-Phase-1`  
**Current Phase:** Phase 11 — Billing & Payment Management  
**Status:** Complete & Fully Verified  
**Date:** November 4, 2026  

---

## 1. Executive Summary

Phase 11 (Billing & Payment Management) of the MedCore HMS Hospital Management SaaS platform has been implemented, hardened, and verified in strict accordance with the original 15-phase roadmap and the MedCore HMS PRD.

All monetary calculations (line totals, subtotal, tax amounts, discounts, grand total, amount paid, and outstanding balance) are computed on the backend using decimal-safe financial arithmetic (`@db.Decimal(12, 2)`). Finalized invoices are legally immutable, counter cash settlements generate official sequential receipts, digital checkout sessions verify server-side configuration, and incoming webhooks (Stripe and Razorpay) enforce timing-safe HMAC signature verification, 300-second replay window checks, and event idempotency via `PaymentWebhookEvent`. An auditable refund subsystem restores invoice balances without destroying historical payment records.

Comprehensive automated verification was performed:
- Dedicated Phase 11 test suite (`backend/test/phase11-billing-payment.test.ts`): **48 / 48 passed (100.0%)**.
- Regression test suites across all prior phases (Phases 10, 9, 8, 7, 6, 4, 3 Auth, 2 Database): **341 / 341 tests passed (100.0%)**.
- Backend & Frontend TypeScript type checks: **0 errors**.
- Backend & Frontend production builds: **Clean exit (code 0)**.
- Prisma schema validation: **Valid 🚀**.

---

## 2. Roadmap and Scope Confirmation

The original 15-phase roadmap was strictly preserved:
1. Project Setup & Environment Configuration *(Completed)*
2. Database Design & Prisma Implementation *(Completed)*
3. Authentication & Authorization *(Completed)*
4. Hospital Onboarding & Management *(Completed)*
5. Departments & Doctor Management *(Completed)*
6. Appointment Management & Scheduling *(Completed)*
7. Electronic Medical Records (EMR) *(Completed)*
8. Prescription Management *(Completed)*
9. Laboratory Management *(Completed)*
10. Pharmacy & Inventory Management *(Completed)*
11. **Billing & Payment Management *(Completed in this phase)***
12. Notifications & Communication *(Not started)*
13. Dashboards & Frontend Integration *(Not started)*
14. Comprehensive Testing & Security *(Not started)*
15. Deployment & Production Setup *(Not started)*

> [!IMPORTANT]
> **Phase 12 (Notifications & Communication) has NOT been started.** Work was strictly limited to Phase 11 implementation and verification.

---

## 3. Architecture & Functional Implementation

### A. Invoice Creation and Itemized Billing
- **Decimal-Safe Calculations:** Line totals are derived from validated quantities and unit prices (`quantity * unitPrice`). Taxes and discounts are validated to prevent negative values. Subtotal, grand total (`subtotal + taxAmount - discountAmount`), and outstanding balance are authoritative and derived strictly on the server.
- **Hospital Scope & Sequential Identifiers:** Invoices generate sequential, unique identifiers scoped per hospital tenant: `INV-<HOSPITAL_CODE>-<YEAR>-<COUNTER>` (e.g. `INV-APEX-MAIN-2026-0037`).
- **Consolidated Encounter Billing:** Gathers doctor consultation fees, completed laboratory diagnostics, and dispensed medications from pharmacy dispensing records into an itemized draft invoice upon encounter completion.
- **Draft Modifications:** Line items can be added or deleted from draft invoices with instant atomic recalculation of subtotal and outstanding balance.

### B. Invoice Finalization & Immutability
- **Safe Finalization:** Finalization transitions invoices from `DRAFT` to `ISSUED`, stamps `finalizedAt` and `finalizedById`.
- **Concurrency Serialization:** Enforces PostgreSQL transaction-level advisory locks (`pg_advisory_xact_lock(hashtext(invoiceId))`) to prevent race conditions during concurrent finalization or payment requests.
- **Immutability Enforcement:** Invoices in non-`DRAFT` status (`ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`) reject addition or deletion of line items with `400 Bad Request`.
- **Zero-Item Guard:** Prevents finalizing draft invoices with zero line items.

### C. Invoice Void Workflow
- **Auditable Invalidation:** Allows authorized accountants and administrators to void draft or unpaid invoices with a documented clinical or administrative reason.
- **Settlement Protection:** Rejects voiding invoices that contain active settled payments until payments are refunded.

### D. Counter & Cash Payments
- **Payment Recording:** Supports counter cash, credit/debit card POS, and counter UPI settlements.
- **Receipt Generation:** Produces formal sequential receipt numbers: `RCP-<HOSPITAL_CODE>-<YEAR>-<COUNTER>` (e.g. `RCP-APEX-MAIN-2026-0039`).
- **Balance & Status Transitions:** Partial payments decrease `outstandingBalance` and transition the status to `PARTIALLY_PAID`. Full payment completion marks the invoice `PAID` with balance `0.00`.
- **Overpayment Prevention:** Strictly rejects payment amounts exceeding the invoice's current outstanding balance.
- **Pre-requisite Enforcement:** Rejects payment attempts on `DRAFT` or `VOID` invoices.

### E. Gateway Integration & Webhook Reliability
- **Credential Isolation:** Secret keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) reside exclusively on the server in environment variables.
- **Safe Unconfigured Fallback:** Initiating an online session when API keys are unconfigured throws `503 Service Unavailable` with a clear explanation, avoiding fake success simulation.
- **Cryptographic Signature Verification:**
  - **Stripe:** Parses `t=timestamp,v1=signature`, computes HMAC-SHA256, verifies using `crypto.timingSafeEqual`, and rejects timestamps older than 300 seconds (replay attack protection).
  - **Razorpay:** Computes HMAC-SHA256 signature across raw payload and verifies with `crypto.timingSafeEqual`.
- **Event Idempotency:** Webhook event identifiers are recorded in the `PaymentWebhookEvent` table (`@@unique([gateway, eventId])`). Re-delivered events return `200 OK` (`idempotent: true`) without double-charging the invoice balance.
- **Atomic Settlement:** Validated webhook events execute balance updates and payment record creation in a database transaction with advisory row locking.

### F. Auditable Refunds and Payment Corrections
- **Refund Endpoint:** `POST /api/v1/payments/:id/refund` restricted to `ACCOUNTANT`, `HOSPITAL_ADMIN`, and `SUPER_ADMIN`.
- **Audit Integrity:** Completed payment records are never deleted; status is updated to `REFUNDED` with audit notes.
- **Balance Restoration:** Restores the invoice's `outstandingBalance` and decrements `paidAmount`, transitioning the invoice status back to `PARTIALLY_PAID` or `ISSUED`.
- **Validation:** Rejects refund amounts exceeding the original payment amount and blocks duplicate refunds on already refunded payments.

### G. Multi-Tenancy & Patient IDOR Protection
- **Tenant Scoping:** All invoices and payments are strictly scoped to `user.hospitalId`. Hospital B users cannot read or collect payments for Hospital A invoices (`403 Forbidden`).
- **Patient Privacy:** Patient self-service endpoints (`/patients/me/invoices`, `/patients/me/payments`, `/payments/my`) filter exclusively by `patient.userId === authenticatedUser.id`. Patient B attempting to access or initiate payments for Patient A's invoice is rejected with `403 Forbidden`.
- **Role-Based Access Control (RBAC):** Restricts invoice creation, item modifications, finalization, counter payments, and refunds to authorized billing and accounting roles. Non-billing clinical roles (e.g. `NURSE`, `DOCTOR`) are denied access (`403 Forbidden`).

---

## 4. API Endpoints Summary

| Method | Endpoint | Authorized Roles | Description |
|---|---|---|---|
| `POST` | `/api/v1/billing/invoices` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Creates an itemized draft invoice with server-calculated totals |
| `POST` | `/api/v1/billing/invoices/consolidate/:appointmentId` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Consolidates encounter appointment into draft invoice |
| `POST` | `/api/v1/billing/invoices/consolidate-encounter` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Body-based encounter consolidation endpoint |
| `POST` | `/api/v1/billing/invoices/:id/items` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Adds a line item to a draft invoice |
| `DELETE` | `/api/v1/billing/invoices/:id/items/:itemId` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Removes a line item from a draft invoice |
| `POST` | `/api/v1/billing/invoices/:id/finalize` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Finalizes a draft invoice into immutable `ISSUED` status |
| `POST` | `/api/v1/billing/invoices/:id/void` | `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Voids an unpaid invoice with audit reason |
| `GET` | `/api/v1/billing/invoices` | Billing Staff, `PATIENT` (own), `SUPER_ADMIN` | Lists hospital invoices with optional filters |
| `GET` | `/api/v1/billing/invoices/:id` | Billing Staff, `PATIENT` (own), `SUPER_ADMIN` | Retrieves single invoice details, line items, and payments |
| `POST` | `/api/v1/payments/cash` | `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Records counter cash/card/UPI payment with official receipt |
| `POST` | `/api/v1/payments/initiate` | `PATIENT`, `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Initiates online Stripe/Razorpay checkout session |
| `POST` | `/api/v1/payments/:id/refund` | `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` | Issues full/partial refund and restores invoice balance |
| `GET` | `/api/v1/payments/invoice/:invoiceId` | Billing Staff, `PATIENT` (own), `SUPER_ADMIN` | Retrieves payment history for an invoice |
| `GET` | `/api/v1/payments/my` | `PATIENT` | Retrieves patient's personal payment history |
| `GET` | `/api/v1/patients/me/invoices` | `PATIENT` | Portal endpoint for personal invoices |
| `GET` | `/api/v1/patients/me/payments` | `PATIENT` | Portal endpoint for personal payment receipts |
| `POST` | `/api/v1/payments/webhooks/stripe` | Public (Header verified) | Stripe webhook receiver with replay window & HMAC check |
| `POST` | `/api/v1/payments/webhooks/razorpay` | Public (Header verified) | Razorpay webhook receiver with HMAC-SHA256 verification |

---

## 5. Frontend Billing & Patient Portal Integration

### A. Billing Management Dashboard (`frontend/app/billing/page.tsx`)
- **Status Filtering & Real-time Search:** Filter invoices by status (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`) or search by patient name, MRN, or invoice number.
- **Detail View:** Displays itemized line items with descriptions, quantities, unit prices, line totals, and item type badges (`CONSULTATION`, `LAB_TEST`, `PHARMACY`, `PROCEDURE`, `ROOM_CHARGE`, `OTHER`).
- **Financial Breakdown:** Visualizes subtotal, taxes, discounts, grand total, paid amount, and outstanding balance in bold color-coded indicators.
- **Draft Modifications:** Staff can add new line items or delete items directly from the details panel on draft invoices.
- **Finalization & Invalidation:** One-click finalize button with confirmation prompt; void modal for cancellation with audit reason tracking.
- **Counter Payments:** Modal to record payments across cash, card POS, and UPI with custom receipt notes and validation against remaining balance.
- **Refund Management:** Direct refund trigger on recorded payments for accountants and admins with amount and reason prompts.

### B. Patient Self-Service Portal (`frontend/app/portal/page.tsx`)
- **Invoices Tab:** Displays patient's personal hospital charges, itemized breakdowns, and balance due.
- **Payment Receipts History:** Renders receipt numbers, payment methods, transaction dates, and status (`COMPLETED`, `REFUNDED`) directly underneath each invoice.
- **Online Checkout:** Integrated "Pay Now (Stripe / Razorpay)" button calling the backend initiation endpoint.
- **Strict Privacy:** IDOR-protected via session token filtering.

---

## 6. Verification & Test Results

### A. Dedicated Phase 11 Test Suite
**Command:** `pnpm --filter @medcore/backend test:phase11`  
**Execution File:** `backend/test/phase11-billing-payment.test.ts`  
**Result:** **48 / 48 PASSED (100.0%)**

```
==========================================================================
📊 Phase 11 Billing & Payment Test Suite Execution Summary
==========================================================================
Total Tests Run: 48
Passed:         48 / 48 (100.0%)
Failed:         0 / 48

  • Section 1 (INVOICE_CREATION): 7 / 7 passed
  • Section 2 (INVOICE_ITEMS_MUTATIONS): 5 / 5 passed
  • Section 3 (INVOICE_FINALIZATION): 5 / 5 passed
  • Section 4 (VOID_WORKFLOW): 3 / 3 passed
  • Section 5 (PAYMENT_RECORDING): 8 / 8 passed
  • Section 6 (REFUNDS_AND_CORRECTIONS): 5 / 5 passed
  • Section 7 (GATEWAY_INITIATION): 3 / 3 passed
  • Section 8 (WEBHOOK_VERIFICATION): 6 / 6 passed
  • Section 9 (SECURITY_AND_TENANCY): 6 / 6 passed

✨ All 48 Phase 11 Billing & Payment Management Tests Passed Successfully! ✨
```

### B. Full Regression Suite Execution

| Suite Script | Phase / Domain | Tests Run | Passed | Failed | Pass Rate |
|---|---|---|---|---|---|
| `test:phase10` | Phase 10 — Pharmacy & Inventory | 50 | 50 | 0 | 100.0% |
| `test:phase9` | Phase 9 — Laboratory Management | 50 | 50 | 0 | 100.0% |
| `test:phase8` | Phase 8 — Prescription Management | 46 | 46 | 0 | 100.0% |
| `test:phase7` | Phase 7 — Electronic Medical Records | 58 | 58 | 0 | 100.0% |
| `test:phase6` | Phase 6 — Integrated Clinical & Billing | 55 | 55 | 0 | 100.0% |
| `test:phase4` | Phase 4 — Hospital, Doctor, Patient, Appts | 43 | 43 | 0 | 100.0% |
| `test:auth` | Phase 3 — Authentication & RBAC | 22 | 22 | 0 | 100.0% |
| `test:db` | Phase 2 — Database Schema & Relations | 17 | 17 | 0 | 100.0% |
| **Total Regressions** | **Phases 2 – 10** | **341** | **341** | **0** | **100.0%** |

### C. Build & Typecheck Verifications

- **Prisma Schema Validation:** `pnpm exec prisma validate --schema=prisma/schema.prisma` -> `The schema at prisma\schema.prisma is valid 🚀`
- **Backend Type Check:** `pnpm --filter @medcore/backend typecheck` -> Clean (0 errors).
- **Frontend Type Check:** `pnpm --filter @medcore/frontend typecheck` -> Clean (0 errors).
- **Backend Production Build:** `pnpm --filter @medcore/backend build` -> Clean exit (code 0).
- **Frontend Production Build:** `pnpm --filter @medcore/frontend build` -> Next.js 15.5 production bundle compiled successfully (all 16 routes static/prerendered).

---

## 7. Required Environment Variables

For live production payment gateways, configure the following variables in `.env` (kept strictly server-side):

```env
# Stripe Payment Gateway
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Razorpay Payment Gateway
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

*Note: In test and sandbox environments where credentials are not supplied, the system safely throws `503 Service Unavailable` on live initiation while mocking/verifying cryptographic signatures in integration tests.*

---

## 8. Remaining Limitations & Production Notes

1. **Live Gateway Verification:** In development/testing environments without active merchant accounts, Stripe and Razorpay checkout session creation returns `503 Service Unavailable` as required by the security specification. Live checkout requires actual production merchant API keys.
2. **Audit & Compliance:** Passing automated test suites demonstrates functional and structural compliance but does not replace an external PCI-DSS or HIPAA compliance audit.

---

## 9. Conclusion

Phase 11 (Billing & Payment Management) is fully completed, tested, and verified. Phase 12 (Notifications & Communication) has **not** been started. Awaiting user instructions before proceeding to Phase 12.
