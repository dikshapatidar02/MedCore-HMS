import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PatientMedicationHistoryController } from "./patient-medication-history.controller";
import { PatientMedicationHistoryService } from "./patient-medication-history.service";

@Module({
  imports: [PrismaModule],
  controllers: [PatientMedicationHistoryController],
  providers: [PatientMedicationHistoryService],
  exports: [PatientMedicationHistoryService],
})
export class PatientMedicationHistoryModule {}
