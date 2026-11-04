import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateMedicineBatchDto {
  @IsUUID()
  @IsNotEmpty()
  medicineId: string;

  @IsString()
  @IsNotEmpty()
  batchNumber: string;

  @IsOptional()
  @IsDateString()
  manufacturingDate?: string;

  @IsDateString()
  @IsNotEmpty()
  expiryDate: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  mrp: number;

  @IsOptional()
  @IsString()
  supplier?: string;
}
