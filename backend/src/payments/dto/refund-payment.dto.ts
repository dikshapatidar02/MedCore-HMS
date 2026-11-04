import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";

export class RefundPaymentDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
