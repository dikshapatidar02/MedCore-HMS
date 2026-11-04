import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
} from "class-validator";

export class CreateMedicalRecordDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsUUID()
  @IsOptional()
  doctorId?: string; // Optional: defaults to authenticated doctor profile

  @IsUUID()
  @IsOptional()
  appointmentId?: string; // Optional: 1:1 encounter linkage

  @IsDateString()
  @IsOptional()
  visitDate?: string;

  @IsString()
  @IsNotEmpty()
  chiefComplaint!: string;

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
