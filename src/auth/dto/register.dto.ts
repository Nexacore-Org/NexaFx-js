import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'correcthorsebatterystaple' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  lastName!: string;
}
