import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ReviewLabOrderDto {
  @IsBoolean()
  @IsNotEmpty()
  approve: boolean; // true = APPROVED, false = REJECTED

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
