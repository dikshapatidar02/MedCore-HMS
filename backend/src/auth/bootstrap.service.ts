import { Injectable, Logger, OnApplicationBootstrap, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole, AuditAction } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { seedDemoData } from "./demo-seed";

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.bootstrapSuperAdmin();
    await this.bootstrapDemoHospital();
  }

  private async bootstrapSuperAdmin() {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    // Only attempt automated bootstrap if explicit credentials are provided in the environment
    if (!email || !password) {
      return;
    }

    try {
      const existingSuperAdmin = await this.prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN },
      });

      if (existingSuperAdmin) {
        this.logger.log(
          `Platform SUPER_ADMIN already present (${existingSuperAdmin.email}). Skipping automated bootstrap.`,
        );
        return;
      }

      const passwordHash = bcrypt.hashSync(password, 12);

      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: "Platform",
            lastName: "SuperAdmin",
            role: UserRole.SUPER_ADMIN,
            hospitalId: null,
            isActive: true,
          },
        });

        await tx.auditLog.create({
          data: {
            action: AuditAction.CREATE,
            entityName: "User",
            entityId: user.id,
            details: {
              action: "ENV_BOOTSTRAP_SUPER_ADMIN",
              email: user.email,
              role: user.role,
              timestamp: new Date().toISOString(),
            },
          },
        });
      });

      this.logger.log(`Initial platform SUPER_ADMIN (${email}) successfully bootstrapped.`);
    } catch (error: any) {
      this.logger.error("Automated SUPER_ADMIN bootstrap encountered an error:", error.message || error);
    }
  }

  private async bootstrapDemoHospital() {
    try {
      if (!this.prisma.address?.upsert || !this.prisma.hospital?.upsert) {
        return;
      }
      await seedDemoData(this.prisma, {
        log: (msg: string) => this.logger.log(msg),
        error: (msg: string, ...args: any[]) => this.logger.error(msg, ...args),
      });
    } catch (error: any) {
      this.logger.error("Automated Demo Hospital bootstrap encountered an error:", error.message || error);
    }
  }
}
