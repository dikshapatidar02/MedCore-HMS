import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsBoolean,
} from "class-validator";
import { AllergySeverity } from "@prisma/client";

export class CreatePatientAllergyDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsString()
  @IsNotEmpty()
  allergen!: string;

  @IsString()
  @IsOptional()
  reaction?: string;

  @IsEnum(AllergySeverity)
  @IsOptional()
  severity?: AllergySeverity = AllergySeverity.MODERATE;

  @IsDateString()
  @IsOptional()
  diagnosedDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePatientAllergyDto {
  @IsString()
  @IsOptional()
  allergen?: string;

  @IsString()
  @IsOptional()
  reaction?: string;

  @IsEnum(AllergySeverity)
  @IsOptional()
  severity?: AllergySeverity;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}
