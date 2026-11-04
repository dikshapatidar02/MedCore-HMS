import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  appointmentAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  billingAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  labAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  prescriptionAlerts?: boolean;
}
