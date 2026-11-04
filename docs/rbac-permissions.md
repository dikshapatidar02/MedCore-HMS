# MedCore HMS — Role-Based Access Control (RBAC) & Permission Matrix

## 1. Overview

MedCore HMS enforces a strict, defense-in-depth Role-Based Access Control (RBAC) system. Every authenticated request is authorized against the caller's assigned role and operational hospital context before any controller handler or database query executes.

Authorization operates at two complementary tiers:
1. **Endpoint Tier (`RolesGuard` & `@Roles` decorator)**: Evaluates whether the caller's role is granted access to the requested API route.
2. **Resource/Entity Tier (`TenantGuard` & Service-level checks)**: Validates that the specific entity being created, read, updated, or deleted belongs strictly to the user's hospital and matches their domain ownership (e.g., patient identity).

---

## 2. The Nine System Roles

The system strictly adheres to the nine roles defined in the database schema enum `Role`:

| Role Enum | Description | Scope |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | MedCore platform owner and SaaS administrator. | Global (Platform-wide across all hospitals). |
| **`HOSPITAL_ADMIN`** | Hospital operational administrator. | Tenant-scoped (Single hospital). |
| **`DOCTOR`** | Licensed physician or medical specialist. | Tenant-scoped (Clinical staff within hospital). |
| **`NURSE`** | Inpatient/outpatient care nurse. | Tenant-scoped (Clinical staff within hospital). |
| **`RECEPTIONIST`** | Front-desk admissions and appointment scheduler. | Tenant-scoped (Administrative staff within hospital). |
| **`LAB_TECHNICIAN`** | Pathology and diagnostic laboratory specialist. | Tenant-scoped (Diagnostic unit within hospital). |
| **`PHARMACIST`** | Hospital pharmacy dispenser and formulary manager. | Tenant-scoped (Pharmacy department within hospital). |
| **`ACCOUNTANT`** | Billing, insurance, and revenue cycle officer. | Tenant-scoped (Finance department within hospital). |
| **`PATIENT`** | Registered healthcare consumer / patient. | Self-scoped (Only access own personal and health records). |

---

## 3. Comprehensive Permission Matrix

The following matrix documents the authorized operations (Create = **C**, Read = **R**, Update = **U**, Delete = **D**, Self = **S** self-only) for each resource across all nine roles:

| Resource | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR | NURSE | RECEPTIONIST | LAB_TECHNICIAN | PHARMACIST | ACCOUNTANT | PATIENT |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Hospital** | C, R, U, D (All) | R, U (Own) | R (Own) | R (Own) | R (Own) | R (Own) | R (Own) | R (Own) | R (Own) |
| **Department** | C, R, U, D | C, R, U, D | R | R | R | R | R | R | R |
| **User / Staff** | C, R, U, D | C, R, U, D | R | R | R | R | R | R | - |
| **Doctor Profile** | C, R, U, D | C, R, U, D | R, U (Self) | R | R | R | R | R | R (Directory) |
| **Patient Profile** | R (Audit) | C, R, U | C, R, U | C, R, U | C, R, U | R | R | R | R (Self), U (Self contact) |
| **Appointment** | R (Audit) | C, R, U, D | C, R, U | R | C, R, U, D | - | - | - | R (Self), C (Self) |
| **Medical Record** | R (Audit) | R | C, R, U | R | - | - | - | - | R (Self) |
| **Prescription** | R (Audit) | R | C, R, U | R | - | - | R, U (Dispense) | - | R (Self) |
| **Lab Order / Test** | R (Audit) | R | C, R | R | - | C, R, U | - | - | R (Self) |
| **Invoice / Billing**| R (Audit) | C, R, U | R | - | R | - | - | C, R, U, D | R (Self) |
| **Medicine Catalog**| C, R, U, D | C, R, U | R | R | - | - | C, R, U, D | R | - |
| **Room / Bed** | C, R, U, D | C, R, U, D | R | R, U (Assign) | R | - | - | - | - |
| **Emergency Visit** | R (Audit) | C, R, U | C, R, U | C, R, U | C, R | - | - | - | - |
| **Ambulance** | C, R, U, D | C, R, U, D | - | - | C, R, U | - | - | - | - |
| **Reports** | Platform-wide | Hospital-wide| Dept-wide | - | - | Lab-wide | Pharmacy | Financial | - |
| **Audit Logs** | Global | Hospital-only | - | - | - | - | - | - | - |

---

## 4. Architectural Implementation

### 1. The `@Roles` Decorator
The `@Roles(...roles: Role[])` decorator applies metadata keys using NestJS's `SetMetadata`:

```typescript
// backend/src/auth/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

### 2. The `RolesGuard` Authorization Guard
The `RolesGuard` extracts role metadata defined on the route handler or class, cross-referencing it with the authenticated user's assigned role:

```typescript
// backend/src/auth/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No specific role required, open to all authenticated users
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Access denied: User identity missing or unauthenticated.',
      });
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Access denied: Role ${user.role} does not have required permissions.`,
      });
    }

    return true;
  }
}
```

---

## 5. Least Privilege Design Decisions

1. **Patient Privacy Protection**:
   - Patients can strictly read their own patient profile, clinical records, prescriptions, appointments, and billing invoices.
   - Any attempt by Patient A to read Patient B's data or modify Patient B's profile triggers an immediate HTTP `403 Forbidden` (`"Access denied: You are not authorized to view another patient's medical records."`).
2. **Clinician Safeguards**:
   - Doctors are permitted to create and update clinical consultations and prescribe medications, but they cannot delete medical records or tamper with hospital financial invoices.
3. **Nursing Scope**:
   - Nurses can view patient vitals, track bed assignments, and read prescriptions for administration, but cannot author prescriptions or alter billing line items.
4. **Pharmacy & Diagnostics**:
   - Lab Technicians can update lab results, but cannot view unrelated financial invoices or manage beds.
   - Pharmacists can view prescription orders and mark dispensations, but cannot author clinical diagnoses.
5. **Super Admin Scope**:
   - Super Administrators hold platform governance capabilities (create hospitals, configure global medicine categories, inspect system audit logs, monitor platform-wide KPIs).
   - Super Admins are exempt from tenant boundaries for system administration, but their actions are permanently recorded in audit logs.
