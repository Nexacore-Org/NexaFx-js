import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
