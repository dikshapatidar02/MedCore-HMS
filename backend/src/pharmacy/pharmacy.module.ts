import { Module } from "@nestjs/common";
import { PharmacyController } from "./pharmacy.controller";
import { PharmacyService } from "./pharmacy.service";
import { ExpiryMonitorService } from "./expiry-monitor.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PharmacyController],
  providers: [PharmacyService, ExpiryMonitorService],
  exports: [PharmacyService, ExpiryMonitorService],
})
export class PharmacyModule {}
