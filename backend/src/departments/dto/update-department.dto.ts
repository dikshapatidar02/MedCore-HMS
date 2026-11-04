import { IsOptional, IsString, Length } from "class-validator";

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  headOfDepartmentId?: string;
}
