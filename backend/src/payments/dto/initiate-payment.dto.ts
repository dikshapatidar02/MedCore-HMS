import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class InitiateOnlinePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod; // STRIPE, RAZORPAY

  @IsOptional()
  @IsEnum(PaymentMethod)
  gateway?: PaymentMethod; // STRIPE, RAZORPAY
}
