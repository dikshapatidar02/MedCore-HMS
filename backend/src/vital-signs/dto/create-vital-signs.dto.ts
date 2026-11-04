import {
  IsUUID,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsString,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateVitalSignsDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  medicalRecordId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(50, { message: "bloodPressureSystolic must be at least 50 mmHg" })
  @Max(250, { message: "bloodPressureSystolic must not exceed 250 mmHg" })
  @IsOptional()
  bloodPressureSystolic?: number;

  @Type(() => Number)
  @IsInt()
  @Min(50, { message: "systolicBp must be at least 50 mmHg" })
  @Max(250, { message: "systolicBp must not exceed 250 mmHg" })
  @IsOptional()
  systolicBp?: number;

  @Type(() => Number)
  @IsInt()
  @Min(30, { message: "bloodPressureDiastolic must be at least 30 mmHg" })
  @Max(150, { message: "bloodPressureDiastolic must not exceed 150 mmHg" })
  @IsOptional()
  bloodPressureDiastolic?: number;

  @Type(() => Number)
  @IsInt()
  @Min(30, { message: "diastolicBp must be at least 30 mmHg" })
  @Max(150, { message: "diastolicBp must not exceed 150 mmHg" })
  @IsOptional()
  diastolicBp?: number;

  @Type(() => Number)
  @IsInt()
  @Min(30, { message: "heartRate must be between 30 and 250 bpm" })
  @Max(250, { message: "heartRate must be between 30 and 250 bpm" })
  @IsOptional()
  heartRate?: number;

  @Type(() => Number)
  @IsInt()
  @Min(5, { message: "respiratoryRate must be between 5 and 80 breaths/min" })
  @Max(80, { message: "respiratoryRate must be between 5 and 80 breaths/min" })
  @IsOptional()
  respiratoryRate?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(30, { message: "temperature must be plausible (at least 30°C)" })
  @Max(45, { message: "temperature must be plausible (at most 45°C)" })
  @IsOptional()
  temperature?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(50, { message: "oxygenSaturation (SpO2) must be between 50% and 100%" })
  @Max(100, { message: "oxygenSaturation (SpO2) must be between 50% and 100%" })
  @IsOptional()
  oxygenSaturation?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(20, { message: "heightCm must be between 20 cm and 300 cm" })
  @Max(300, { message: "heightCm must be between 20 cm and 300 cm" })
  @IsOptional()
  heightCm?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: "weightKg must be between 1 kg and 500 kg" })
  @Max(500, { message: "weightKg must be between 1 kg and 500 kg" })
  @IsOptional()
  weightKg?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
