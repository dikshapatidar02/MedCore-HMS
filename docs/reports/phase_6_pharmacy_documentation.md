# MedCore HMS — Phase 6 Pharmacy & FIFO Inventory Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Hospital Pharmacy, Batch Tracking, FIFO Dispensing & Concurrency  
**Status:** Complete & Production Ready  

---

### 1. Architectural Principles

The MedCore HMS Pharmacy module manages hospital-specific medicine formularies and pharmaceutical batch inventories with strict compliance with healthcare inventory regulations:

1. **Strict Tenant Isolation**: Inventories, medicines, batches, and dispensing histories are scoped to the authenticated user's `hospitalId`.
2. **First-In, First-Out (FIFO) Dispensing**: Medicines are dispensed strictly by earliest expiry date and earliest manufacturing date (`expiryDate ASC, manufacturingDate ASC`).
3. **Expired Stock Quarantine**: Batches whose `expiryDate` is in the past cannot be dispensed and are flagged with `BatchStatus.QUARANTINED` or `EXPIRED`.
4. **Non-Negative Stock Invariant**: Inventory quantities can never drop below zero. If available unexpired stock is insufficient to fulfill a prescription, the transaction is rejected with `400 Bad Request`.
5. **High-Concurrency Serialization**: To eliminate race conditions where two pharmacists concurrently dispense the same batch, the dispensing operation acquires a PostgreSQL transaction advisory lock:
   ```sql
   SELECT pg_advisory_xact_lock(hashtext('dispense_' || medicineId));
   ```
   This serializes requests at the database engine level, guaranteeing that stock cannot oversell even under parallel load.
6. **Full Traceability**: Every unit dispensed produces an immutable `DispensingRecord` recording the exact `MedicineBatch` UUID consumed, plus a `StockMovement` entry for accounting audit trails.

---

### 2. Batch Lifecycle & States

```
[STOCK INGRESS] ──> ACTIVE ──> [FIFO CONSUMPTION] ──> DEPLETED (Qty = 0)
                      │
                      ├──> [PAST EXPIRY] ──> QUARANTINED / EXPIRED
                      │
                      └──> [MANUAL AUDIT] ──> QUARANTINED (Recalled / Damaged)
```

- `ACTIVE`: Available for FIFO consumption.
- `QUARANTINED`: Isolated from dispensing (expired, recalled, damaged).
- `EXPIRED`: System or scheduled background job flagged batch as past its valid shelf life.
- `DEPLETED`: Current quantity reached 0.

---

### 3. API Endpoints

#### `GET /api/v1/pharmacy/medicines` & `POST /api/v1/pharmacy/medicines`
- **Authorized Roles:** Read: All staff; Create/Update: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Fields:** `name`, `genericName`, `brand`, `manufacturer`, `strength`, `form`, `unit`, `reorderLevel`, `unitPrice`

#### `GET /api/v1/pharmacy/batches` & `POST /api/v1/pharmacy/batches`
- **Authorized Roles:** `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Fields:** `medicineId`, `batchNumber`, `manufacturingDate`, `expiryDate`, `initialQuantity`, `purchasePrice`, `mrp`, `supplierName`

#### `POST /api/v1/pharmacy/batches/:id/quarantine`
- **Authorized Roles:** `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Behavior:** Transitions batch status to `QUARANTINED`, instantly removing it from active FIFO consideration.

#### `POST /api/v1/pharmacy/dispense/:prescriptionId`
- **Authorized Roles:** `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Behavior:**
  - Evaluates prescription items.
  - Acquires advisory transaction lock per medicine.
  - Queries active, non-expired batches ordered by `expiryDate ASC`.
  - Deducts quantities sequentially across batches until line item requirement is satisfied.
  - Records batch-level `DispensingRecord` and `StockMovement`.
  - Updates prescription status to `DISPENSED` (or `PARTIALLY_DISPENSED`).
  - Dispatches `PRESCRIPTION_READY` event to the notification queue.

#### `GET /api/v1/pharmacy/alerts`
- **Authorized Roles:** `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Returns:**
  - `expiringBatches30Days`: Batches expiring within the next 30 days.
  - `expiredBatches`: Active batches whose expiry date has passed.
  - `lowStockMedicines`: Medicines whose total available active stock is at or below `reorderLevel`.

---

### 4. Scheduled Expiry Monitor (BullMQ)

Implemented in [ExpiryMonitorService](../../backend/src/pharmacy/expiry-monitor.service.ts):
- Runs a scheduled background job on the `pharmacy-expiry` queue.
- Automatically flags expired batches as `QUARANTINED`.
- Dispatches alert events to hospital pharmacy personnel.
- Employs Redis-based idempotency keys (`expiry_alert_checked_<hospitalId>_<date>`) to avoid spamming duplicate notifications.
