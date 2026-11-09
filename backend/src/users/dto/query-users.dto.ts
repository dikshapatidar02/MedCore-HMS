import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min, Max } from "class-validator";
import { Type, Transform } from "class-transformer";
import { UserRole } from "@prisma/client";

export class QueryUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(UserRole, { message: "Invalid user role filter" })
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: "isActive must be a boolean (true or false)" })
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  hospitalId?: string;
}

