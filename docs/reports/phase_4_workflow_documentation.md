# MedCore HMS — Phase 4 Workflow Documentation

This document explains the end-to-end clinical workflows implemented in Phase 4.

---

## 1. Patient Registration & Onboarding Lifecycle

```
[Patient Arrival / Portal]
           │
           ▼
[Staff / Reception Desk]
   ├── Enter Demographics (Name, DOB, Gender, Blood Group)
   ├── Enter Contact & Emergency Details
   └── Enter Residential Address
           │
           ▼
[Backend Registration Engine]
   ├── Extract Tenant Context from Authenticated Staff
   ├── Sequence Counter & Code Prefix Lookup
   ├── Auto-Generate Hospital MRN (e.g. APEX-MAIN-000017)
   ├── Persist Address Record
   ├── Persist Patient Record with Soft-Delete Anchor
   └── Emit CREATE AuditLog Entry
           │
           ▼
[Patient Active File Created]
```

### Self-Privacy Boundaries
- Patients can authenticate into the portal and view `/patients/me` (their demographics, blood group, emergency contact, and address).
- A patient attempting to list the hospital patient directory (`GET /patients`) is rejected with `403 Forbidden`.
- A patient attempting to access another patient's record by UUID (`GET /patients/:otherId`) is rejected with `403 Forbidden`.
- A patient cannot be viewed across hospital tenant boundaries by unauthorized users.

---

## 2. Doctor Availability & Scheduling Engine

```
[Doctor / Administrator]
           │
           ▼
[Define Weekly Hours]
   ├── Configure days of week (0=Sunday ... 6=Saturday)
   ├── Set startTime and endTime
   ├── Validate: startTime < endTime
   └── Validate: No overlapping time windows on same day
           │
           ▼
[Manage Calendar Exceptions]
   ├── Add specific leave dates (isAvailable = false)
   └── Add special extra hours (isAvailable = true)
           │
           ▼
[Live Slot Availability Calculation]
   ├── Input: Doctor ID + Target Date (YYYY-MM-DD)
   ├── Check full-day leave exceptions -> If true, 0 slots
   ├── Retrieve weekly availability for day-of-week
   ├── Slice window into slotDurationMinutes intervals
   ├── Exclude partial-day leave intervals
   ├── Query active bookings (status NOT IN [CANCELLED, NO_SHOW])
   └── Flag conflicting slots as booked (isAvailable = false)
```

---

## 3. Concurrency-Safe Appointment Booking & Lifecycle

```
[Booking Request Initiated]
  (Patient, Receptionist, or Doctor)
           │
           ▼
[Validation Phase]
   ├── Target date check: Cannot book in past
   ├── Doctor hospital == Patient hospital == Target Hospital
   ├── Working hours verification
   └── Doctor schedule leave check
           │
           ▼
[Prisma Interactive Transaction]
   ├── Lock / Check active doctor appointments in time window
   │     └── If conflict: ABORT with 409 Conflict (Double Booking)
   ├── Lock / Check active patient appointments in time window
   │     └── If conflict: ABORT with 409 Conflict (Patient Conflict)
   ├── Insert Appointment with status = PENDING
   └── Emit CREATE AuditLog Entry
```

---

## 4. Appointment Status State Machine

The platform enforces strict unidirectional status transitions:

```
            ┌──────────────┐
            │   PENDING    │
            └──────┬───────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
  ┌──────────────┐    ┌──────────────┐
  │  CONFIRMED   │    │  CANCELLED   │◄───┐
  └──────┬───────┘    └──────────────┘    │
         │                                │
   ┌─────┴─────┬──────────────────────────┤
   ▼           ▼                          │
┌───────────┐ ┌─────────┐                 │
│IN_PROGRESS│ │ NO_SHOW │                 │
└─────┬─────┘ └─────────┘                 │
      │                                   │
      ├───────────────────────────────────┘
      ▼
┌───────────┐
│ COMPLETED │ (Terminal)
└───────────┘
```

### State Transition Rules:
1. `PENDING` can transition to `CONFIRMED` or `CANCELLED`.
2. `CONFIRMED` can transition to `IN_PROGRESS`, `CANCELLED`, or `NO_SHOW`.
3. `IN_PROGRESS` can transition to `COMPLETED` or `CANCELLED`.
4. `COMPLETED`, `CANCELLED`, and `NO_SHOW` are terminal states:
   - No further status updates are permitted (`BadRequestException`).
   - Rescheduling is locked (`BadRequestException`).
   - Cancellation is locked (`BadRequestException`).
5. All status transitions, rescheduling events, and cancellations record before/after states in `AuditLog`.
