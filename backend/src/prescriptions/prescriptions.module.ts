import { Module } from "@nestjs/common";
import { PrescriptionsController } from "./prescriptions.controller";
import { PrescriptionsService } from "./prescriptions.service";
import { PrescriptionsPdfService } from "./prescriptions-pdf.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionsPdfService],
  exports: [PrescriptionsService, PrescriptionsPdfService],
})
export class PrescriptionsModule {}
