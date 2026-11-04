import { IsNotEmpty, IsOptional, IsString, Length } from "class-validator";

export class CreateDepartmentDto {
  @IsNotEmpty({ message: "Department code is required" })
  @IsString()
  @Length(2, 20, { message: "Department code must be between 2 and 20 characters" })
  code: string;

  @IsNotEmpty({ message: "Department name is required" })
  @IsString()
  @Length(2, 100, { message: "Department name must be between 2 and 100 characters" })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  headOfDepartmentId?: string;

  @IsOptional()
  @IsString()
  hospitalId?: string; // For Super Admin override
}
