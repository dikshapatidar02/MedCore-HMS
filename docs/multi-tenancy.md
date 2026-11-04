# Multi-Tenant Architecture & Isolation Strategy

## 1. Multi-Tenancy Models Overview

In software-as-a-service (SaaS) healthcare architectures, there are three primary multi-tenancy paradigms:

| Architecture | Description | Advantages | Trade-offs |
| :--- | :--- | :--- | :--- |
| **Database-per-Tenant** | Each hospital has a dedicated physical/logical PostgreSQL database instance. | Highest isolation; easy per-tenant backup & restore; independent database maintenance. | Highest operational cost; resource inefficiency for smaller hospitals; complex multi-database connection pooling and migration management. |
| **Schema-per-Tenant** | All hospitals share a single database, but each hospital has a dedicated PostgreSQL schema (`CREATE SCHEMA hospital_apex`). | Moderate isolation; clear logical separation; lighter resource footprint than database-per-tenant. | Complex migration pipelines running across hundreds of schemas; connection pool scaling issues; cross-tenant reporting is difficult. |
| **Row-Level Multi-Tenancy** | All hospitals share the same database and schema. Every table incorporates a discriminator column (`hospitalId`). | Lowest operational overhead; efficient connection pooling; unified migration pipeline; seamless platform-wide aggregation for Super Admin; dynamic scalability. | Requires strict application-layer and query-layer discipline; risk of cross-tenant data leakage if query filters are omitted. |

---

## 2. Why Row-Level Multi-Tenancy Was Selected for MedCore HMS

MedCore HMS utilizes **Row-Level Multi-Tenancy** for the following architectural and business reasons:
1. **Cost & Operational Scalability**: Hospital networks range from small community clinics to large multi-specialty research hospitals. Row-level multi-tenancy enables rapid onboarding of new hospital tenants without provisioning database servers or creating isolated schema DDLs.
2. **Unified Data Migrations**: Upgrades and schema evolutions are applied in a single transactional step via Prisma migrations (`prisma migrate deploy`), eliminating the failure risk of partially-migrated tenant schemas.
3. **Cross-Tenant Platform Analytics**: Platform Super Administrators can monitor system health, license utilization, and cross-hospital aggregate statistics seamlessly without orchestrating distributed joins or cross-database queries.
4. **Connection Pool Optimization**: With a single database connection pool managed by Prisma Client and NestJS, memory and connection limits in containerized environments (Docker/Kubernetes) remain predictable and performant.

---

## 3. Database-Level Multi-Tenancy Enforcement

The schema enforces multi-tenancy at the data layer through structural patterns:

1. **Mandatory Discriminator Column (`hospitalId`)**:
   - Every hospital-scoped entity (`Department`, `Room`, `Doctor`, `Patient`, `Appointment`, `MedicalRecord`, `Prescription`, `LabOrder`, `Invoice`, etc.) includes a non-nullable foreign key relationship to `Hospital(id)`.
   - The only exception is `User` where `hospitalId` is nullable **strictly** for `SUPER_ADMIN` accounts that manage platform configuration globally.

2. **Compound Unique Constraints**:
   - Business identifiers (such as Patient MRN, Doctor License Number, Room Number, Invoice Number, and Department Code) are scoped strictly per hospital:
     - `@@unique([hospitalId, mrn])` on `Patient`
     - `@@unique([hospitalId, licenseNumber])` on `Doctor`
     - `@@unique([hospitalId, roomNumber])` on `Room`
     - `@@unique([hospitalId, code])` on `Department`
     - `@@unique([hospitalId, invoiceNumber])` on `Invoice`
   - This permits different hospital tenants to share common numbering conventions without collision, while completely preventing duplicate records within the same tenant.

3. **Tenant-Scoped Indexes**:
   - All tenant tables feature single-column or composite indexes beginning with `hospitalId` (e.g., `@@index([hospitalId])`, `@@index([hospitalId, status])`, `@@index([hospitalId, doctorId, appointmentDate])`).
   - This ensures PostgreSQL query planners leverage index scans to filter by tenant immediately.

---

## 4. Application-Level Multi-Tenant Security (Phase 3 Implementation)

A database schema alone cannot prevent data leakage if queries accept unsanitized identifiers. Phase 3 implements complete, multi-layered tenant isolation across the application stack:

```
+-----------------------------------------------------------------------------------------+
|                              Multi-Tenant Request Lifecycle                             |
+-----------------------------------------------------------------------------------------+
       Incoming Request (e.g. GET /api/v1/hospitals/:hospitalId/patients)
                                    |
                                    v
     [JwtAuthGuard] ------------> Verifies cryptographic JWT signature & extracts { role, hospitalId }
                                    |
                                    v
     [RolesGuard] --------------> Verifies user role has permission to access the endpoint
                                    |
                                    v
     [TenantGuard] -------------> Compares URL/Body :hospitalId with user.hospitalId
                                  - If user is SUPER_ADMIN: Bypass (authorized cross-tenant)
                                  - If hospitalId matches: Proceed
                                  - If mismatch / client forgery: HTTP 403 Forbidden
                                    |
                                    v
     [Service Query Scoping] ---> Every database query includes mandatory WHERE clause:
                                  where: { id: entityId, hospitalId: user.hospitalId }
                                    |
                                    v
     [Relationship Validator] --> Before inserting relationships (e.g. Appointment),
                                  verifies Patient.hospitalId === Doctor.hospitalId === caller.hospitalId
```

### 1. `TenantGuard` Implementation
The `TenantGuard` inspects route parameters (`:hospitalId`), query string, or request body. If a non-Super Admin caller specifies an explicit `hospitalId` that does not match their authenticated token's `hospitalId`, access is immediately denied:

```typescript
// backend/src/auth/guards/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Super Admin has explicitly permitted cross-tenant access
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    const targetHospitalId =
      request.params?.hospitalId ||
      request.query?.hospitalId ||
      request.body?.hospitalId;

    if (targetHospitalId && targetHospitalId !== user.hospitalId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Access denied: You are not authorized to access records from another hospital.',
      });
    }

    return true;
  }
}
```

### 2. Service-Level Query Scoping & Relationship Enforcement
A guard is never the sole defense. All service operations enforce tenant scoping directly in Prisma query criteria:

```typescript
// backend/src/hospitals/hospitals.service.ts
async findOneInvoice(invoiceId: string, currentUser: AuthenticatedUser) {
  // Query includes hospitalId filter in WHERE criteria
  const invoice = await this.prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(currentUser.role !== Role.SUPER_ADMIN ? { hospitalId: currentUser.hospitalId! } : {}),
    },
  });

  if (!invoice) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Access denied: Invoice not found or belongs to another hospital.',
    });
  }

  // Patient privacy: Patients may only access their own invoices
  if (currentUser.role === Role.PATIENT && currentUser.patientProfile) {
    if (invoice.patientId !== currentUser.patientProfile.id) {
      throw new ForbiddenException('Access denied: You are not authorized to view another patient\'s invoice.');
    }
  }

  return invoice;
}
```

### 3. Cross-Tenant Relationship Boundary Validation
Cross-hospital connections between patients, doctors, and appointments are strictly prevented:

```typescript
async createAppointment(data: { patientId: string; doctorId: string; appointmentDate: Date }, currentUser: AuthenticatedUser) {
  const patient = await this.prisma.patient.findUnique({ where: { id: data.patientId } });
  const doctor = await this.prisma.doctor.findUnique({ where: { id: data.doctorId } });

  // Cross-tenant boundary check
  if (patient.hospitalId !== doctor.hospitalId) {
    throw new BadRequestException({
      code: 'CROSS_TENANT_RELATIONSHIP_REJECTED',
      message: 'Cross-hospital appointment relationships are forbidden. Patient and Doctor must belong to the same hospital.',
    });
  }

  // Tenant authorization check
  if (currentUser.role !== Role.SUPER_ADMIN && patient.hospitalId !== currentUser.hospitalId) {
    throw new ForbiddenException('Access denied: You cannot schedule appointments outside your hospital.');
  }

  return this.prisma.appointment.create({ ... });
}
```

---

## 5. Verified Multi-Tenant Security Tests

The automated test suite (`pnpm --filter @medcore/backend test:auth`) explicitly validates all 8 tenant isolation scenarios:
- **Test 15**: Hospital A administrator cannot access Hospital B data (Returns `403 Forbidden`).
- **Test 16**: Hospital A doctor cannot access Hospital B patients (Returns `403 Forbidden`).
- **Test 17**: Hospital A doctor cannot access Hospital B appointments (Tenant-segregated).
- **Test 18**: Patient cannot access another patient's medical records (Returns `403 Forbidden`).
- **Test 19**: Patient cannot modify another patient's profile (Returns `403 Forbidden`).
- **Test 20**: Cross-hospital appointment relationships are rejected (Patient from Hospital A linked with Doctor from Hospital B returns error).
- **Test 21**: Cross-hospital invoice access is rejected (Apex Accountant querying CityCare invoice returns `403 Forbidden`).
- **Test 22**: Client-supplied `hospitalId` in query/body cannot bypass tenant isolation (Returns `403 Forbidden`).
