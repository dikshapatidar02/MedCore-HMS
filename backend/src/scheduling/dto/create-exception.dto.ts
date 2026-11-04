import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  Matches,
  IsBoolean,
} from "class-validator";

export class CreateScheduleExceptionDto {
  @IsDateString()
  @IsNotEmpty()
  date!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "startTime must be in HH:mm format (e.g. 09:00)",
  })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "endTime must be in HH:mm format (e.g. 17:00)",
  })
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean; // false = leave/off, true = extra hours

  @IsOptional()
  @IsString()
  reason?: string;
}
