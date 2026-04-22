import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { IsNotEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';
import { PhoneVerificationService } from '../services/phone-verification.service';

class SendOtpDto {
  @IsNotEmpty()
  @IsPhoneNumber()
  phoneNumber: string;
}

class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}

@Controller('users/me/phone-verification')
export class PhoneVerificationController {
  constructor(private readonly phoneVerificationService: PhoneVerificationService) {}

  /**
   * POST /users/me/phone-verification/send
   * Send a 6-digit OTP to the provided phone number.
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Req() req: any, @Body() dto: SendOtpDto) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    await this.phoneVerificationService.sendOtp(userId, dto.phoneNumber);
    return { success: true, message: 'OTP sent successfully' };
  }

  /**
   * POST /users/me/phone-verification/verify
   * Verify the OTP submitted by the user.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Req() req: any, @Body() dto: VerifyOtpDto) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    this.phoneVerificationService.verifyOtp(userId, dto.code);
    return { success: true, message: 'Phone number verified successfully' };
  }
}
