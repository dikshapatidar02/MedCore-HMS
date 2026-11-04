import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Put,
  UseGuards,
  forwardRef,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { ReminderQueueService } from "./reminder-queue.service";
import { UpdateNotificationPreferenceDto } from "./dto/update-preference.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { NotificationType } from "@prisma/client";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ReminderQueueService))
    private readonly reminderQueueService: ReminderQueueService
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("readStatus") readStatus?: string,
    @Query("type") type?: NotificationType,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.notificationsService.findAllForUser(user, {
      readStatus,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("unread-count")
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user);
  }

  @Get("queue-status")
  async getQueueStatus() {
    return this.reminderQueueService.getQueueStatus();
  }

  @Patch(":id/read")
  async markAsRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.notificationsService.markAsRead(id, user);
  }

  @Patch("mark-all-read")
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Post("mark-all-read")
  async markAllAsReadPost(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Delete(":id")
  async deleteNotification(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.notificationsService.deleteNotification(id, user);
  }

  @Get("preferences")
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user);
  }

  @Put("preferences")
  async updatePreferences(
    @Body() dto: UpdateNotificationPreferenceDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.notificationsService.updatePreferences(dto, user);
  }
}
