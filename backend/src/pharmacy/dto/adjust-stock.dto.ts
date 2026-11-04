import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { StockMovementType } from "@prisma/client";

export class AdjustStockDto {
  @IsUUID()
  @IsNotEmpty()
  medicineId: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsEnum(StockMovementType)
  @IsNotEmpty()
  type: StockMovementType; // ADJUSTMENT, EXPIRED_DISCARD, QUARANTINED, RETURNED

  @IsInt()
  @IsNotEmpty()
  quantityDelta: number; // Positive to add, negative to subtract

  @IsString()
  @IsNotEmpty({ message: "Mandatory justification reason is required for all stock adjustments." })
  @MinLength(3, { message: "Adjustment reason must be at least 3 characters." })
  reason: string;
}
