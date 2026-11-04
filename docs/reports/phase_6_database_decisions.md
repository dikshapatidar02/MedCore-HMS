# MedCore HMS — Phase 6 Database Decisions & Schema Evolution

**Location:** `MedCore-HMS-Phase-1`  
**Focus:** Prisma Schema Additions, Indexing Strategy, Concurrency Locks & Data Integrity  
**Status:** Complete & Fully Migrated  

---

### 1. Schema Design Philosophy

Phase 6 extensions strictly adhere to MedCore HMS database engineering rules established in Phase 2:
1. **Additive Migrations Only**: Existing tables (`hospitals`, `users`, `patients`, `doctors`, `appointments`, `medical_records`, `audit_logs`) were preserved without schema drops, deletions, or data resets.
2. **Tenant Scoping on Every Operational Entity**: Every newly introduced or extended entity includes a mandatory `hospitalId` foreign key with compound tenant-scoped indexes (e.g. `@@index([hospitalId, status])`).
3. **Decimal Safety**: All currency values use `@db.Decimal(12, 2)` to eliminate floating-point representation errors.
4. **Lot & Batch Traceability**: Dispensing operations maintain full traceability down to the individual manufacturing lot (`MedicineBatch`).

---

### 2. Models Created & Extended

#### A. New Models Introduced

```prisma
model MedicineBatch {
  id                String       @id @default(uuid())
  hospitalId        String
  medicineId        String
  batchNumber       String
  manufacturingDate DateTime
  expiryDate        DateTime
  initialQuantity   Int
  currentQuantity   Int
  purchasePrice     Decimal      @db.Decimal(12, 2)
  mrp               Decimal      @db.Decimal(12, 2)
  supplierName      String?
  status            BatchStatus  @default(ACTIVE)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  hospital          Hospital     @relation(fields: [hospitalId], references: [id])
  medicine          Medicine     @relation(fields: [medicineId], references: [id])
  stockMovements    StockMovement[]
  dispensingRecords DispensingRecord[]

  @@unique([hospitalId, medicineId, batchNumber])
  @@index([hospitalId, status])
  @@index([medicineId, expiryDate])
}

model StockMovement {
  id              String             @id @default(uuid())
  hospitalId      String
  medicineId      String
  batchId         String?
  movementType    StockMovementType
  quantity        Int
  previousStock   Int
  newStock        Int
  referenceType   String?
  referenceId     String?
  notes           String?
  createdById     String
  createdAt       DateTime           @default(now())

  hospital        Hospital           @relation(fields: [hospitalId], references: [id])
  medicine        Medicine           @relation(fields: [medicineId], references: [id])
  batch           MedicineBatch?     @relation(fields: [batchId], references: [id])
  createdBy       User               @relation(fields: [createdById], references: [id])

  @@index([hospitalId, medicineId])
  @@index([batchId])
}

model DispensingRecord {
  id                  String           @id @default(uuid())
  hospitalId          String
  prescriptionId      String
  prescriptionItemId  String
  batchId             String
  quantity            Int
  dispensedById       String
  createdAt           DateTime         @default(now())

  hospital            Hospital         @relation(fields: [hospitalId], references: [id])
  prescription        Prescription     @relation(fields: [prescriptionId], references: [id])
  prescriptionItem    PrescriptionItem @relation(fields: [prescriptionItemId], references: [id])
  batch               MedicineBatch    @relation(fields: [batchId], references: [id])
  dispensedBy         User             @relation(fields: [dispensedById], references: [id])

  @@index([hospitalId, prescriptionId])
  @@index([batchId])
}

model PaymentWebhookEvent {
  id              String       @id @default(uuid())
  gateway         String       // "STRIPE" | "RAZORPAY"
  eventId         String       @unique
  eventType       String
  payload         Json
  status          String       @default("PROCESSED")
  createdAt       DateTime     @default(now())

  @@index([gateway, eventId])
}

model NotificationPreference {
  id              String       @id @default(uuid())
  userId          String       @unique
  emailEnabled    Boolean      @default(true)
  smsEnabled      Boolean      @default(true)
  inAppEnabled    Boolean      @default(true)
  updatedAt       DateTime     @updatedAt

  user            User         @relation(fields: [userId], references: [id])
}
```

#### B. Extended Models & Enums
- **`Medicine`**: Added `reorderLevel`, `unitPrice`, and relation to `MedicineBatch` and `StockMovement`.
- **`PrescriptionItem`**: Added `dispensedQuantity`, `form`, and relation to `DispensingRecord`.
- **`LabOrder`**: Added `sampleBarcode`, `sampleCollectedAt`, `resultsEnteredAt`, `approvedAt`, `technicianId`, `reviewerId`, `reviewNotes`, and updated status to support the full pathology lifecycle (`ORDERED`, `SAMPLE_COLLECTED`, `PROCESSING`, `RESULT_UPLOADED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`).
- **`LabResult`**: Added `flag` (`NORMAL`, `ABNORMAL`, `CRITICAL_HIGH`, `CRITICAL_LOW`), `numericValue`, `textValue`, `unit`, `referenceRange`, `notes`.
- **`Invoice`**: Added `dueDate`, `subtotal`, `taxAmount`, `discountAmount`, `paidAmount`, `outstandingBalance`.
- **`InvoiceItem`**: Added `unitPrice`, `taxRate`, `discountAmount`, `itemType` (`CONSULTATION`, `LAB_TEST`, `MEDICINE`, `PROCEDURE`, `ROOM_CHARGE`, `OTHER`).
- **`Payment`**: Added `receiptNumber`, `notes`, `metadata`, and updated `method` and `status` enums.
- **`Notification`**: Added `channel` (`IN_APP`, `EMAIL`, `SMS`), `actionUrl`.

---

### 3. Concurrency Protection & Locking Strategy

To ensure zero stock discrepancies in the pharmacy under concurrent dispensing requests:
1. Dispensing operations are executed inside a Prisma interactive transaction (`prisma.$transaction`).
2. Prior to stock reading or deduction, an advisory transaction lock is acquired on the PostgreSQL connection:
   ```ts
   await tx.$executeRawUnsafe(
     `SELECT pg_advisory_xact_lock(hashtext('dispense_' || $1))`,
     medicineId
   );
   ```
3. PostgreSQL advisory transaction locks automatically release when the enclosing transaction commits or rolls back, ensuring deadlock-free, high-throughput serialization.
4. Stock validation verifies that `batch.currentQuantity >= deductionQuantity` and that `batch.expiryDate > new Date()`. If stock is depleted, the transaction immediately rolls back and raises `400 Bad Request`.

---

### 4. Migration Execution

The migration was applied to the live PostgreSQL instance:
- Migration path: `backend/prisma/migrations/20261102161935_add_phase6_models/migration.sql`
- Status: Applied with 0 rollbacks.
- Verified by: `test:db` Test 2 (`Found 4 applied migration(s)`).
