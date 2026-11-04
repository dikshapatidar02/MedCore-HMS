# MedCore HMS — Phase 6 Security & Correctness Findings

This document catalogs all 11 security, correctness, and API interoperability findings discovered during the independent adversarial audit of Phase 6, along with their reproduction scenarios, root cause analyses, applied safe fixes, and regression verification tests.

---

### Finding 1: HTTP Method Mismatch on Diagnostic Sample Collection & Processing
- **Severity**: **High**
- **Location**:
  - [laboratory.controller.ts](../../backend/src/laboratory/laboratory.controller.ts#L98-L135)
  - [frontend/app/laboratory/page.tsx](../../frontend/app/laboratory/page.tsx#L125)
- **Reproduction Scenario**:
  A laboratory technician clicks "Collect Sample" or "Start Processing" on the frontend Laboratory Management board. The frontend issues `POST /api/v1/laboratory/orders/:id/collect-sample`, which receives an HTTP 404 Not Found error because the backend only registered `@Patch`.
- **Why it is a problem**:
  Completely breaks the core diagnostic specimen workflow in the user interface, preventing staff from transitioning specimens to collection and processing.
- **Minimal Safe Fix**:
  Added `@Post("orders/:id/collect-sample")` and `@Post("orders/:id/process-sample")` decorators alongside the existing `@Patch` routes in `LaboratoryController` to support both verbs idempotently.
- **Verification Test**: Test 48 in `backend/test/phase6-complete.test.ts`.

---

### Finding 2: Missing Individual Medicine Batch Quarantine Endpoint
- **Severity**: **High**
- **Location**:
  - [pharmacy.controller.ts](../../backend/src/pharmacy/pharmacy.controller.ts#L80-L95)
  - [frontend/app/pharmacy/page.tsx](../../frontend/app/pharmacy/page.tsx#L112)
- **Reproduction Scenario**:
  A pharmacist discovers damaged or contaminated medication packaging and clicks "Quarantine" on a specific batch row in the Pharmacy inventory screen. The frontend dispatches `POST /api/v1/pharmacy/batches/:id/quarantine`, which returned HTTP 404 Not Found because only a bulk `quarantine-expired` endpoint existed.
- **Why it is a problem**:
  Compromised or recalled medication batches could not be isolated ad-hoc by pharmacy staff, risking contaminated stock being selected by the FIFO dispensing engine.
- **Minimal Safe Fix**:
  Implemented `quarantineBatch(batchId, user)` in `PharmacyService` with tenant verification and `StockMovementType.QUARANTINED` audit recording. Exposed `@Post("batches/:id/quarantine")` in `PharmacyController`.
- **Verification Test**: Test 49 in `backend/test/phase6-complete.test.ts`.

---

### Finding 3: Dispensing DTO Validation Schema Blocking Full Automated Fulfillment
- **Severity**: **High**
- **Location**:
  - [dispense-prescription.dto.ts](../../backend/src/pharmacy/dto/dispense-prescription.dto.ts#L18-L30)
  - [pharmacy.service.ts](../../backend/src/pharmacy/pharmacy.service.ts#L225-L270)
- **Reproduction Scenario**:
  A pharmacist clicks the one-click "Dispense (FIFO Allocation)" button on a prescription modal without manually constructing line-by-line item arrays. The request body `{ notes: "Full fulfillment" }` was rejected by NestJS `ValidationPipe` with HTTP 400 Bad Request because `items` was decorated with `@IsNotEmpty()`.
- **Why it is a problem**:
  Prevented standard automated FIFO fulfillment of pending prescription items from the UI modal.
- **Minimal Safe Fix**:
  Made `items` optional (`@IsOptional()`) in `DispensePrescriptionDto`. In `PharmacyService.dispensePrescription`, if `items` is omitted or empty, the service automatically derives all remaining unfulfilled items from `rx.items` and fulfills them via FIFO.
- **Verification Test**: Test 50 in `backend/test/phase6-complete.test.ts`.

---

### Finding 4: Encounter Consolidation Route & Body Contract Mismatch
- **Severity**: **High**
- **Location**:
  - [billing.controller.ts](../../backend/src/billing/billing.controller.ts#L48-L58)
  - [frontend/app/billing/page.tsx](../../frontend/app/billing/page.tsx#L140)
- **Reproduction Scenario**:
  An accountant opens the "Consolidate Encounter Bill" modal, enters an appointment ID, and clicks "Generate Bill". The frontend calls `POST /api/v1/billing/invoices/consolidate-encounter` with JSON body `{ appointmentId: "..." }`, which failed with HTTP 404 because the backend only had `@Post("invoices/consolidate/:appointmentId")`.
- **Why it is a problem**:
  The encounter billing consolidation feature in the accountant interface failed to invoke the backend consolidation engine.
- **Minimal Safe Fix**:
  Created `ConsolidateEncounterDto` and added `@Post("invoices/consolidate-encounter")` accepting body `{ appointmentId }` in `BillingController`.
- **Verification Test**: Test 51 in `backend/test/phase6-complete.test.ts`.

---

### Finding 5: Online Payment Initiation DTO Field Mismatch (`gateway` vs `paymentMethod`)
- **Severity**: **High**
- **Location**:
  - [initiate-payment.dto.ts](../../backend/src/payments/dto/initiate-payment.dto.ts#L10-L25)
  - [payments.service.ts](../../backend/src/payments/payments.service.ts#L155-L165)
  - [frontend/app/billing/page.tsx](../../frontend/app/billing/page.tsx#L162)
- **Reproduction Scenario**:
  A patient or receptionist selects "Pay via Stripe" or "Pay via Razorpay" and clicks "Proceed to Checkout". The frontend payload `{ invoiceId, amount, gateway: "STRIPE" }` was rejected with HTTP 400 Bad Request because the backend DTO required `paymentMethod` and threw an error on `gateway`.
- **Why it is a problem**:
  Completely disabled online card/UPI payment initiation across both the Billing dashboard and the Patient Portal.
- **Minimal Safe Fix**:
  Added optional `gateway` field alongside `paymentMethod` in `InitiateOnlinePaymentDto`. Updated `PaymentsService.initiateOnlinePayment` to resolve `dto.paymentMethod || dto.gateway`.
- **Verification Test**: Test 53 in `backend/test/phase6-complete.test.ts`.

---

### Finding 6: Missing Notification Unread Count Route & Mark-All-Read Method Mismatch
- **Severity**: **Medium**
- **Location**:
  - [notifications.controller.ts](../../backend/src/notifications/notifications.controller.ts#L35-L58)
  - [notifications.service.ts](../../backend/src/notifications/notifications.service.ts#L105-L125)
  - [frontend/app/notifications/page.tsx](../../frontend/app/notifications/page.tsx#L68)
- **Reproduction Scenario**:
  The notification bell icon polls `GET /api/v1/notifications/unread-count` and displays an unhandled 404 in the browser console. Clicking "Mark all as read" sends a `POST` request, which also returned 404 because the route only accepted `PATCH`.
- **Why it is a problem**:
  Degrades notification user experience and prevents clearing notification badges.
- **Minimal Safe Fix**:
  Implemented `getUnreadCount(user)` in `NotificationsService`. Added `@Get("unread-count")` and `@Post("mark-all-read")` alongside `@Patch("mark-all-read")` in `NotificationsController`.
- **Verification Test**: Test 55 in `backend/test/phase6-complete.test.ts`.

---

### Finding 7: Webhook Signature Non-Constant-Time Comparison & Replay Vulnerability
- **Severity**: **Medium**
- **Location**:
  - [payments.service.ts](../../backend/src/payments/payments.service.ts#L220-L245)
- **Reproduction Scenario**:
  An adversary intercepts a valid historical Stripe webhook payload and replays it hours or days later. Furthermore, signature checks used standard JavaScript inequality (`!==`), which is susceptible to HMAC byte-by-byte timing side-channel analysis.
- **Why it is a problem**:
  Exposes the system to timing attacks on payment signatures and allows replay of intercepted webhook events if idempotency records are ever purged.
- **Minimal Safe Fix**:
  Replaced string inequality with `crypto.timingSafeEqual(expectedBuf, receivedBuf)`. Added Stripe signature timestamp parsing and enforced a strict 300-second maximum replay tolerance window (`Math.abs(nowSec - timestampSec) <= 300`).
- **Verification Test**: Test 54 in `backend/test/phase6-complete.test.ts`.

---

### Finding 8: Negative Tax and Discount Values Accepted on Invoices
- **Severity**: **Medium**
- **Location**:
  - [create-invoice.dto.ts](../../backend/src/billing/dto/create-invoice.dto.ts#L48-L57)
  - [billing.service.ts](../../backend/src/billing/billing.service.ts#L70-L80)
- **Reproduction Scenario**:
  A malicious client sends `POST /api/v1/billing/invoices` with `discountAmount: -500.0`. Since `discountAmount` lacked a lower bound constraint, the negative discount mathematically increased the total bill amount or caused inverted calculations.
- **Why it is a problem**:
  Financial calculation tampering, fraudulent invoice inflation, and ledger balance discrepancies.
- **Minimal Safe Fix**:
  Added `@Min(0)` constraints on both `taxAmount` and `discountAmount` in `CreateInvoiceDto`. Added explicit defensive validation in `BillingService.createInvoice` rejecting any negative tax or discount with HTTP 400 Bad Request.
- **Verification Test**: Test 52 in `backend/test/phase6-complete.test.ts`.

---

### Finding 9: Missing Security Sanitization on Diagnostic Attachment Metadata
- **Severity**: **Medium**
- **Location**:
  - [laboratory.service.ts](../../backend/src/laboratory/laboratory.service.ts#L265-L284)
- **Reproduction Scenario**:
  An attacker submits a lab result attachment with `filename: "../../../etc/shadow"` or `filename: "payload.exe"` with MIME type `application/x-msdownload` and an oversized 50MB file size payload. The backend persisted the metadata without validation.
- **Why it is a problem**:
  Path traversal attacks, stored malicious file reference injection, and storage denial of service.
- **Minimal Safe Fix**:
  Added strict validation in `LaboratoryService.uploadResults`:
  - Path traversal check: rejects any filename containing `..`, `/`, or `\`.
  - Whitelisted MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
  - Whitelisted file extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`.
  - File size bounds: strictly between 1 byte and 10MB (10,485,760 bytes).
- **Verification Test**: Test 47 in `backend/test/phase6-complete.test.ts`.

---

### Finding 10: Online Webhook Balance Reconciliation Race Condition
- **Severity**: **Low**
- **Location**:
  - [payments.service.ts](../../backend/src/payments/payments.service.ts#L368-L385)
- **Reproduction Scenario**:
  Two concurrent online payment webhooks arrive simultaneously for the same invoice. The invoice state was read outside the interactive transaction boundary, creating a race condition where stale `paidAmount` could cause over-crediting.
- **Why it is a problem**:
  Concurrent webhook deliveries could record excessive payments exceeding the total invoice amount.
- **Minimal Safe Fix**:
  Moved invoice retrieval and locking strictly inside `this.prisma.$transaction(async (tx) => ...)`. Added check preventing duplicate payments if `currentInvoice.status === PAID`, and clamped payment amounts to `outstandingBalance`.
- **Verification Test**: Test 32 and Test 54 in `backend/test/phase6-complete.test.ts`.

---

### Finding 11: Hardcoded Backend API URLs in Frontend Client Pages
- **Severity**: **Low**
- **Location**:
  - [frontend/app/prescriptions/page.tsx](../../frontend/app/prescriptions/page.tsx#L85)
  - [frontend/app/portal/page.tsx](../../frontend/app/portal/page.tsx#L70)
- **Reproduction Scenario**:
  Frontend PDF download links used hardcoded `http://localhost:3001/api/v1` instead of using the centralized `API_BASE` configuration.
- **Why it is a problem**:
  In staging or production environments running on custom ports, domains, or reverse proxies, PDF download links fail with connection errors.
- **Minimal Safe Fix**:
  Replaced hardcoded localhost strings with the dynamic `API_BASE` constant imported from `../lib/api`.
- **Verification Test**: Verified during production Next.js build.

---

## Summary of Findings by Severity

| Severity | Count | Status |
|:---|:---:|:---:|
| **Critical** | 0 | None Identified |
| **High** | 5 | All 5 Fixed & Verified |
| **Medium** | 4 | All 4 Fixed & Verified |
| **Low** | 2 | All 2 Fixed & Verified |
| **Total** | **11** | **100% Remediated** |
