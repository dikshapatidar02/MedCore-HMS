import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DiagnosesController } from "./diagnoses.controller";
import { DiagnosesService } from "./diagnoses.service";

@Module({
  imports: [PrismaModule],
  controllers: [DiagnosesController],
  providers: [DiagnosesService],
  exports: [DiagnosesService],
})
export class DiagnosesModule {}
