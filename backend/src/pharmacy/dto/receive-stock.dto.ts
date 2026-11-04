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

export class ReceiveStockDto {
  @IsUUID()
  @IsNotEmpty()
  medicineId: string;

  @IsString()
  @IsNotEmpty()
  batchNumber: string;

  @IsDateString()
  @IsNotEmpty()
  expiryDate: string;

  @IsOptional()
  @IsDateString()
  manufacturingDate?: string;

  @IsInt()
  @IsPositive({ message: "Received quantity must be a positive integer." })
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "Unit cost must be greater than zero." })
  unitCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "MRP must be greater than zero." })
  mrp: number;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  invoiceReference?: string;
}
