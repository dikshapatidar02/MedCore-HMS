import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { AppointmentStatus } from "@prisma/client";

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  @IsNotEmpty()
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
