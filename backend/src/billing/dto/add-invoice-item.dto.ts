import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from "class-validator";
import { InvoiceItemType } from "@prisma/client";

export class AddInvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @IsPositive()
  quantity: number = 1;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice: number;

  @IsEnum(InvoiceItemType)
  itemType: InvoiceItemType = InvoiceItemType.CONSULTATION;
}
