import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateUserStatusDto {
  @IsBoolean({ message: "isActive must be a boolean value (true or false)" })
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: "Reason must not exceed 255 characters" })
  reason?: string;
}

