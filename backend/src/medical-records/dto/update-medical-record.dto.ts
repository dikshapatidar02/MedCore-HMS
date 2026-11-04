import { IsString, IsOptional } from "class-validator";

export class UpdateMedicalRecordDto {
  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  presentIllness?: string;

  @IsString()
  @IsOptional()
  pastMedicalHistory?: string;

  @IsString()
  @IsOptional()
  physicalExamination?: string;

  @IsString()
  @IsOptional()
  assessment?: string;

  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @IsString()
  @IsOptional()
  followUpInstructions?: string;
}
