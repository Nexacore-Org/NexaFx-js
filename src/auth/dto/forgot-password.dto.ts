import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
