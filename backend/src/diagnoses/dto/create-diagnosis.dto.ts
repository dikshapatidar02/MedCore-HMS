import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
} from "class-validator";
import { DiagnosisType } from "@prisma/client";

export class CreateDiagnosisDto {
  @IsUUID()
  @IsNotEmpty()
  medicalRecordId!: string;

  @IsString()
  @IsOptional()
  diagnosisName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiagnosisType)
  @IsOptional()
  type?: DiagnosisType = DiagnosisType.PRIMARY;

  @IsString()
  @IsOptional()
  icdCode?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsDateString()
  @IsOptional()
  diagnosisDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
