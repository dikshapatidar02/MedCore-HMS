# MedCore HMS — Phase 6 Billing & Payment Integration Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Consolidated Billing, Invoicing, Gateway Integrations & Cash Counter  
**Status:** Complete & Production Ready  

---

### 1. Financial Integrity Principles

The Billing and Payments engine is designed with strict healthcare accounting safeguards:

1. **Server-Authoritative Totals**: All monetary calculations (line totals, subtotal, tax amounts, discounts, grand total, amount paid, and outstanding balance) are computed on the server using decimal-safe arithmetic (`@db.Decimal(12, 2)`). Client-supplied total amounts are explicitly ignored or rejected.
2. **Immutability of Finalized Invoices**: Invoices in `DRAFT` status can be edited by adding or removing line items. Once finalized by an authorized user (`ISSUED`), the line items and totals are permanently frozen against direct edits or deletions.
3. **Consolidated Encounter Aggregation**: Encounter billing automatically aggregates:
   - Doctor's consultation fee from the linked appointment/department.
   - All completed and approved laboratory tests from the encounter's lab orders.
   - All medicines dispensed by the pharmacy for the encounter's prescriptions.
4. **Idempotent Webhooks & Anti-Duplicate Payments**: Stripe and Razorpay webhook events are tracked in a dedicated `PaymentWebhookEvent` table. Duplicate webhook deliveries are acknowledged with `200 OK` while preventing double balance reduction.
5. **No Client-Side Payment Fabrications**: A frontend cannot directly mark an invoice as `PAID`. An invoice's balance is only updated through cryptographic webhook verification or authenticated cashier cash settlement.

---

### 2. Invoice State Machine

```
[ENCOUNTER / VISIT] ──> DRAFT (Editable Items)
                           │
                           ▼ (Finalize Action)
                         ISSUED (Locked, Payable)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      PARTIALLY_PAID                   PAID
  (Paid < Total, Balance > 0)    (Balance == 0)
```

---

### 3. API Endpoints

#### `POST /api/v1/billing/invoices`
- **Authorized Roles:** `ACCOUNTANT`, `RECEPTIONIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ patientId, appointmentId?, dueDate?, notes?, items: [{ description, itemType, quantity, unitPrice, taxRate, discountAmount }] }`
- **Behavior:** Calculates line-item totals and creates an invoice in `DRAFT` status.

#### `POST /api/v1/billing/invoices/consolidate-encounter`
- **Authorized Roles:** `ACCOUNTANT`, `RECEPTIONIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ appointmentId: string }`
- **Behavior:** Gathers doctor consultation fee, lab orders, and pharmacy dispensed items into an itemized `DRAFT` invoice.

#### `POST /api/v1/billing/invoices/:id/finalize`
- **Authorized Roles:** `ACCOUNTANT`, `RECEPTIONIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Behavior:** Transitions status `DRAFT -> ISSUED`. Locks items.

#### `POST /api/v1/payments/cash`
- **Authorized Roles:** `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ invoiceId, amount, notes }`
- **Behavior:** Records cash counter transaction, generates a formal receipt ID (`RCP-<HOSPITAL>-<YEAR>-<COUNTER>`), updates `paidAmount` and `outstandingBalance`, and adjusts status to `PARTIALLY_PAID` or `PAID`.

#### `POST /api/v1/payments/initiate`
- **Authorized Roles:** `PATIENT`, `RECEPTIONIST`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Body:** `{ invoiceId, gateway: "STRIPE" | "RAZORPAY", amount? }`
- **Behavior:** Creates gateway checkout intent/order. If gateway API keys are unconfigured, safely throws `503 Service Unavailable` with a clear explanation without simulating fake success.

#### `POST /api/v1/payments/webhook/stripe`
- **Behavior:** Verifies `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`. Checks `PaymentWebhookEvent` table for idempotency. Updates invoice balance upon `checkout.session.completed` or `payment_intent.succeeded`.

#### `POST /api/v1/payments/webhook/razorpay`
- **Behavior:** Verifies HMAC SHA256 signature using `RAZORPAY_KEY_SECRET`. Enforces idempotency and updates invoice balance upon `payment.captured`.

---

### 4. Patient IDOR Protection on Billing

When a patient interacts with billing endpoints:
- Invoices are queried via `/patients/me/invoices`, which filters strictly by `patient.userId === req.user.id`.
- Initiating payment for an invoice verifies that the invoice's patient ID matches the authenticated patient. Cross-patient payment hijacking attempts are rejected with `403 Forbidden`.
