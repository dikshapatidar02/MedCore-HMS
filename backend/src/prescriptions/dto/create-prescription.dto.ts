import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MedicineForm } from "@prisma/client";

export class PrescriptionItemDto {
  @IsUUID()
  @IsNotEmpty()
  medicineId: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsNotEmpty()
  frequency: string; // OD, BD, TDS, QID, SOS or custom

  @IsString()
  @IsNotEmpty()
  duration: string; // e.g., "5 days"

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsEnum(MedicineForm)
  form?: MedicineForm = MedicineForm.TABLET;
}

export class CreatePrescriptionDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsUUID()
  @IsNotEmpty()
  medicalRecordId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Prescription must contain at least one medicine item." })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
