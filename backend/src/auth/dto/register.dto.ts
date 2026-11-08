import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters.' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required.' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters.' })
  lastName: string;

  @IsString()
  @IsNotEmpty({ message: 'Username is required.' })
  @MinLength(3, { message: 'Username must be at least 3 characters.' })
  @MaxLength(30, { message: 'Username must not exceed 30 characters.' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username may only contain letters, numbers, dots, underscores, or hyphens.',
  })
  username: string;

  @IsEmail({}, { message: 'A valid email address is required.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])/, {
    message: 'Password must contain at least one uppercase letter and one number.',
  })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Hospital name is required.' })
  @MaxLength(100, { message: 'Hospital name must not exceed 100 characters.' })
  hospitalName: string;
}

