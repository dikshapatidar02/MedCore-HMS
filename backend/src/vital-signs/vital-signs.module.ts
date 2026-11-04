import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { VitalSignsController } from "./vital-signs.controller";
import { VitalSignsService } from "./vital-signs.service";

@Module({
  imports: [PrismaModule],
  controllers: [VitalSignsController],
  providers: [VitalSignsService],
  exports: [VitalSignsService],
})
export class VitalSignsModule {}
