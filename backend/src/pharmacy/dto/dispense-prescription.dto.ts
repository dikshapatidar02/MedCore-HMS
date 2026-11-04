import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class DispensePrescriptionItemDto {
  @IsUUID()
  @IsNotEmpty()
  prescriptionItemId: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;
}

export class DispensePrescriptionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispensePrescriptionItemDto)
  items?: DispensePrescriptionItemDto[];

  @IsOptional()
  notes?: string;
}
