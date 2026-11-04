import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsGateway } from "./notifications.gateway";
import { ReminderQueueService } from "./reminder-queue.service";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";

@Global()
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "access_secret_medcore_hms",
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, ReminderQueueService],
  exports: [NotificationsService, NotificationsGateway, ReminderQueueService],
})
export class NotificationsModule {}
