import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEmail,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateDoctorDto {
  @IsOptional()
  @IsString()
  hospitalId?: string;

  // Either link an existing user
  @IsOptional()
  @IsString()
  userId?: string;

  // Or create a new user alongside the doctor
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Doctor specific fields
  @IsString()
  @IsNotEmpty()
  departmentId!: string;

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;

  @IsString()
  @IsNotEmpty()
  specialization!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceYears?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultationFee!: number;

  @IsOptional()
  @IsString()
  bio?: string;
}
