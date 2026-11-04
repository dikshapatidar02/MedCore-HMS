import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { LabPriority } from "@prisma/client";

export class CreateLabOrderDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string; // Permits hospital admin to order on behalf of doctor

  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @IsOptional()
  @IsEnum(LabPriority)
  priority?: LabPriority = LabPriority.ROUTINE;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Lab order must include at least one diagnostic test." })
  @IsUUID("4", { each: true })
  @IsNotEmpty()
  testIds: string[];
}
