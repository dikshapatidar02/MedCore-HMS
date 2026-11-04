import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PatientAllergiesController } from "./patient-allergies.controller";
import { PatientAllergiesService } from "./patient-allergies.service";

@Module({
  imports: [PrismaModule],
  controllers: [PatientAllergiesController],
  providers: [PatientAllergiesService],
  exports: [PatientAllergiesService],
})
export class PatientAllergiesModule {}
