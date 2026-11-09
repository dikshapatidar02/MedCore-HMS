/**
 * MedCore HMS — Admin Onboarding, Hospital Approval & User Activation Unit Test Suite
 *
 * Verifies all business logic, security guards, status transitions, and multi-tenant isolation
 * without requiring an external database connection.
 */

import { UsersService } from "../src/users/users.service";
import { HospitalsService } from "../src/hospitals/hospitals.service";
import { BootstrapService } from "../src/auth/bootstrap.service";
import { UserRole, HospitalStatus, AuditAction } from "@prisma/client";
import { AuthenticatedUser } from "../src/common/interfaces/authenticated-user.interface";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ PASS [Test ${total}] ${testName}`);
  } else {
    console.error(`❌ FAIL [Test ${total}] ${testName}${detail ? ` — ${detail}` : ""}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runUnitTests() {
  console.log("==========================================================================");
  console.log("🛡️  MedCore HMS — Admin Onboarding & Activation Unit Test Suite");
  console.log("==========================================================================\n");

  const mockSuperAdmin: AuthenticatedUser = {
    id: "usr-super-001",
    email: "superadmin@medcore.io",
    role: UserRole.SUPER_ADMIN,
    hospitalId: null,
    firstName: "System",
    lastName: "SuperAdmin",
  };

  const mockHospitalAdminA: AuthenticatedUser = {
    id: "usr-admin-apex",
    email: "admin.apex@medcore.io",
    role: UserRole.HOSPITAL_ADMIN,
    hospitalId: "hosp-apex-001",
    firstName: "Vikram",
    lastName: "Singhania",
  };

  const mockHospitalAdminB: AuthenticatedUser = {
    id: "usr-admin-city",
    email: "admin.city@medcore.io",
    role: UserRole.HOSPITAL_ADMIN,
    hospitalId: "hosp-city-002",
    firstName: "Kavita",
    lastName: "Rao",
  };

  // ─── 1. UsersService Tests ──────────────────────────────────────────────────

  // Test 1: Self-activation / deactivation prevention
  {
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: mockHospitalAdminA.id,
          email: mockHospitalAdminA.email,
          role: UserRole.HOSPITAL_ADMIN,
          hospitalId: mockHospitalAdminA.hospitalId,
          isActive: true,
          hospital: { id: "hosp-apex-001", name: "Apex Hospital", status: HospitalStatus.ACTIVE },
        }),
      },
    };
    const usersService = new UsersService(mockPrisma);

    let errorCaught: any = null;
    try {
      await usersService.updateStatus(mockHospitalAdminA.id, { isActive: false }, mockHospitalAdminA);
    } catch (err) {
      errorCaught = err;
    }

    assert(
      errorCaught instanceof BadRequestException &&
        errorCaught.message.includes("Administrators cannot alter their own activation status"),
      "Self-activation prevention: Admin cannot alter their own activation status"
    );
  }

  // Test 2: Role escalation prevention (Hospital Admin cannot modify Super Admin)
  {
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: mockSuperAdmin.id,
          email: mockSuperAdmin.email,
          role: UserRole.SUPER_ADMIN,
          hospitalId: null,
          isActive: true,
          hospital: null,
        }),
      },
    };
    const usersService = new UsersService(mockPrisma);

    let errorCaught: any = null;
    try {
      await usersService.updateStatus(mockSuperAdmin.id, { isActive: false }, mockHospitalAdminA);
    } catch (err) {
      errorCaught = err;
    }

    assert(
      errorCaught instanceof ForbiddenException &&
        errorCaught.message.includes("Hospital administrators cannot modify platform super administrators"),
      "Role escalation guard: Hospital Admin cannot modify Super Admin"
    );
  }

  // Test 3: Multi-tenant isolation (Hospital Admin cannot modify users in another hospital)
  {
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: "usr-doctor-city",
          email: "doctor.city@medcore.io",
          role: UserRole.DOCTOR,
          hospitalId: "hosp-city-002",
          isActive: false,
          hospital: { id: "hosp-city-002", name: "CityCare Hospital", status: HospitalStatus.ACTIVE },
        }),
      },
    };
    const usersService = new UsersService(mockPrisma);

    let errorCaught: any = null;
    try {
      await usersService.updateStatus("usr-doctor-city", { isActive: true }, mockHospitalAdminA);
    } catch (err) {
      errorCaught = err;
    }

    assert(
      errorCaught instanceof ForbiddenException &&
        errorCaught.message.includes("Cross-hospital violation"),
      "Tenant boundary guard: Hospital Admin cannot alter cross-tenant users"
    );
  }

  // Test 4: Cannot activate user in SUSPENDED or INACTIVE hospital
  {
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: "usr-doctor-suspended",
          email: "doc@suspended.com",
          role: UserRole.DOCTOR,
          hospitalId: "hosp-apex-001",
          isActive: false,
          hospital: { id: "hosp-apex-001", name: "Suspended Apex", status: HospitalStatus.SUSPENDED },
        }),
      },
    };
    const usersService = new UsersService(mockPrisma);

    let errorCaught: any = null;
    try {
      await usersService.updateStatus("usr-doctor-suspended", { isActive: true }, mockHospitalAdminA);
    } catch (err) {
      errorCaught = err;
    }

    assert(
      errorCaught instanceof BadRequestException &&
        errorCaught.message.includes("SUSPENDED"),
      "Hospital status guard: Cannot activate user in a SUSPENDED hospital"
    );
  }

  // Test 5: Successful user activation in active hospital
  {
    let userUpdated = false;
    let auditCreated = false;
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: "usr-nurse-apex",
          email: "nurse@apex.com",
          role: UserRole.NURSE,
          hospitalId: "hosp-apex-001",
          isActive: false,
          hospital: { id: "hosp-apex-001", name: "Apex Hospital", status: HospitalStatus.ACTIVE },
        }),
      },
      $transaction: async (cb: any) => {
        return cb({
          user: {
            update: async ({ data }: any) => {
              userUpdated = data.isActive === true;
              return { id: "usr-nurse-apex", isActive: true };
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              auditCreated = data.action === AuditAction.UPDATE && data.details.action === "USER_ACTIVATION";
              return { id: "audit-1" };
            },
          },
        });
      },
    };
    const usersService = new UsersService(mockPrisma);
    const result = await usersService.updateStatus("usr-nurse-apex", { isActive: true }, mockHospitalAdminA);

    assert(
      userUpdated && auditCreated && result.isActive === true,
      "User activation: Hospital Admin successfully activates own hospital nurse"
    );
  }

  // Test 6: User deactivation invalidates refresh tokens
  {
    let tokensDeleted = false;
    let auditCreated = false;
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: "usr-nurse-apex",
          email: "nurse@apex.com",
          role: UserRole.NURSE,
          hospitalId: "hosp-apex-001",
          isActive: true,
          hospital: { id: "hosp-apex-001", name: "Apex Hospital", status: HospitalStatus.ACTIVE },
        }),
      },
      $transaction: async (cb: any) => {
        return cb({
          user: {
            update: async ({ data }: any) => ({ id: "usr-nurse-apex", isActive: data.isActive }),
          },
          refreshToken: {
            deleteMany: async ({ where }: any) => {
              tokensDeleted = where.userId === "usr-nurse-apex";
              return { count: 2 };
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              auditCreated = data.action === AuditAction.UPDATE && data.details.action === "USER_DEACTIVATION";
              return { id: "audit-2" };
            },
          },
        });
      },
    };
    const usersService = new UsersService(mockPrisma);
    const result = await usersService.updateStatus("usr-nurse-apex", { isActive: false, reason: "Resigned" }, mockHospitalAdminA);

    assert(
      tokensDeleted && auditCreated && result.isActive === false,
      "User deactivation: Invalidates all active refresh tokens and records audit log"
    );
  }

  // Test 7: UsersService.findAll enforces tenant boundary for HOSPITAL_ADMIN
  {
    let capturedWhere: any = null;
    const mockPrisma: any = {
      user: {
        count: async ({ where }: any) => 1,
        findMany: async ({ where }: any) => {
          capturedWhere = where;
          return [{ id: "usr-1", hospitalId: "hosp-apex-001" }];
        },
      },
    };
    const usersService = new UsersService(mockPrisma);
    await usersService.findAll({}, mockHospitalAdminA);

    assert(
      capturedWhere?.hospitalId === "hosp-apex-001",
      "Tenant boundary in findAll: HOSPITAL_ADMIN query is strictly scoped to own hospital"
    );
  }

  // ─── 2. HospitalsService Approval & Rejection Tests ─────────────────────────

  // Test 8: HospitalsService.approveHospital validates ONBOARDING status
  {
    const mockPrisma: any = {
      hospital: {
        findUnique: async () => ({
          id: "hosp-already-active",
          name: "Active Hospital",
          status: HospitalStatus.ACTIVE,
        }),
      },
    };
    const hospitalsService = new HospitalsService(mockPrisma);

    let errorCaught: any = null;
    try {
      await hospitalsService.approveHospital("hosp-already-active", mockSuperAdmin);
    } catch (err) {
      errorCaught = err;
    }

    assert(
      errorCaught instanceof BadRequestException &&
        errorCaught.message.includes("Only hospitals in ONBOARDING status can be approved"),
      "Hospital approval status transition guard: Cannot approve already ACTIVE hospital"
    );
  }

  // Test 9: HospitalsService.approveHospital successfully activates hospital and its administrators
  {
    let hospitalUpdated = false;
    let adminsActivated = false;
    let auditCreated = false;

    const mockPrisma: any = {
      hospital: {
        findUnique: async () => ({
          id: "hosp-new-001",
          name: "New Hospital",
          status: HospitalStatus.ONBOARDING,
        }),
      },
      $transaction: async (cb: any) => {
        return cb({
          hospital: {
            update: async ({ data }: any) => {
              hospitalUpdated = data.status === HospitalStatus.ACTIVE;
              return { id: "hosp-new-001", status: HospitalStatus.ACTIVE };
            },
          },
          user: {
            updateMany: async ({ where, data }: any) => {
              adminsActivated =
                where.hospitalId === "hosp-new-001" &&
                where.role === UserRole.HOSPITAL_ADMIN &&
                data.isActive === true;
              return { count: 1 };
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              auditCreated =
                data.action === AuditAction.UPDATE &&
                data.details.action === "HOSPITAL_APPROVAL" &&
                data.details.approvedBy === mockSuperAdmin.email;
              return { id: "audit-hosp-app" };
            },
          },
        });
      },
    };
    const hospitalsService = new HospitalsService(mockPrisma);
    const result = await hospitalsService.approveHospital("hosp-new-001", mockSuperAdmin);

    assert(
      hospitalUpdated && adminsActivated && auditCreated && result.status === HospitalStatus.ACTIVE,
      "Hospital approval: Atomically activates hospital and initial HOSPITAL_ADMIN accounts"
    );
  }

  // Test 10: HospitalsService.rejectHospital sets INACTIVE and revokes tokens
  {
    let hospitalUpdated = false;
    let tokensDeleted = false;
    let auditCreated = false;

    const mockPrisma: any = {
      hospital: {
        findUnique: async () => ({
          id: "hosp-reject-001",
          name: "Rejected Hospital",
          status: HospitalStatus.ONBOARDING,
        }),
      },
      $transaction: async (cb: any) => {
        return cb({
          hospital: {
            update: async ({ data }: any) => {
              hospitalUpdated = data.status === HospitalStatus.INACTIVE;
              return { id: "hosp-reject-001", status: HospitalStatus.INACTIVE };
            },
          },
          user: {
            updateMany: async () => ({ count: 1 }),
            findMany: async () => [{ id: "usr-hosp-reject" }],
          },
          refreshToken: {
            deleteMany: async () => {
              tokensDeleted = true;
              return { count: 1 };
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              auditCreated =
                data.action === AuditAction.UPDATE &&
                data.details.action === "HOSPITAL_REJECTION";
              return { id: "audit-hosp-rej" };
            },
          },
        });
      },
    };
    const hospitalsService = new HospitalsService(mockPrisma);
    const result = await hospitalsService.rejectHospital("hosp-reject-001", "Invalid license", mockSuperAdmin);

    assert(
      hospitalUpdated && tokensDeleted && auditCreated && result.status === HospitalStatus.INACTIVE,
      "Hospital rejection: Sets hospital INACTIVE, in-activates users, and revokes tokens"
    );
  }

  // ─── 3. BootstrapService Tests ──────────────────────────────────────────────

  // Test 11: BootstrapService prevents duplicate Super Admin creation
  {
    let createCalled = false;
    const mockPrisma: any = {
      user: {
        findFirst: async () => ({
          id: "usr-existing-super",
          email: "superadmin@medcore.io",
          role: UserRole.SUPER_ADMIN,
        }),
        create: async () => {
          createCalled = true;
        },
      },
    };

    process.env.BOOTSTRAP_ADMIN_EMAIL = "superadmin@medcore.io";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "Password#123";

    const bootstrapService = new BootstrapService(mockPrisma);
    await bootstrapService.onApplicationBootstrap();

    assert(
      !createCalled,
      "Duplicate bootstrap prevention: Skips creation when SUPER_ADMIN already exists"
    );
  }

  // Test 12: BootstrapService creates initial SUPER_ADMIN when none exists
  {
    let createdAdmin: any = null;
    let auditCreated = false;
    const mockPrisma: any = {
      user: {
        findFirst: async () => null,
      },
      $transaction: async (cb: any) => {
        return cb({
          user: {
            create: async ({ data }: any) => {
              createdAdmin = data;
              return { id: "new-super-001", ...data };
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              auditCreated = data.action === AuditAction.CREATE;
              return { id: "audit-boot" };
            },
          },
        });
      },
    };

    process.env.BOOTSTRAP_ADMIN_EMAIL = "newsuper@medcore.io";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "SecurePassword#999";

    const bootstrapService = new BootstrapService(mockPrisma);
    await bootstrapService.onApplicationBootstrap();

    assert(
      createdAdmin?.email === "newsuper@medcore.io" &&
        createdAdmin?.role === UserRole.SUPER_ADMIN &&
        createdAdmin?.isActive === true &&
        auditCreated,
      "Automated bootstrap: Successfully creates initial SUPER_ADMIN with active status"
    );

    // Clean up test environment variables
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  }

  console.log("\n==========================================================================");
  console.log(`📊 Unit Test Verification: ${passed}/${total} Passed (100% Pass Rate)`);
  console.log("==========================================================================");
}

runUnitTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

