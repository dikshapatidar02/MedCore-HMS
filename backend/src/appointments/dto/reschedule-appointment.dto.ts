import {
  IsString,
  IsNotEmpty,
  IsDateString,
  Matches,
  IsOptional,
} from "class-validator";

export class RescheduleAppointmentDto {
  @IsDateString()
  @IsNotEmpty()
  appointmentDate!: string; // YYYY-MM-DD

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format (e.g. 09:30)",
  })
  startTime!: string;

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format (e.g. 10:00)",
  })
  endTime!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
