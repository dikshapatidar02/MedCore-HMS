import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";
import { MedicineForm } from "@prisma/client";

export class CreateMedicineDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  genericName: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsEnum(MedicineForm)
  form: MedicineForm = MedicineForm.TABLET;

  @IsString()
  @IsNotEmpty()
  strength: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  reorderLevel?: number = 10;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
