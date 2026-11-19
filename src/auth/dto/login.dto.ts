import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No minimum: the password policy applies when a password is *set*. Accounts created under an
  // older, weaker policy must get a 401 for a wrong password, not a 400 that reveals the rule, and
  // must still be able to log in (issue #1528). The upper bound keeps hashing cost bounded.
  @ApiProperty({ maxLength: 128, example: 'correcthorsebatterystaple' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
