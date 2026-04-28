import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from './guards/jwt.guard';
import { TotpService } from './services/totp.service';
import { UserEntity } from '../users/entities/user.entity';
import * as crypto from 'crypto';

class VerifyOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;
}

class DisableTwoFactorDto {
  @ApiProperty({ example: '123456', description: 'Current OTP to confirm disable' })
  @IsString()
  otp: string;
}

class LoginWithOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!' })
  @IsString()
  password: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;
}

class RecoverWithBackupCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'ABCDE12345' })
  @IsString()
  backupCode: string;
}

@ApiTags('2FA')
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly totpService: TotpService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  @Post('enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate TOTP secret and QR code URI to enable 2FA' })
  @ApiResponse({ status: 200, description: 'TOTP secret and QR URI returned' })
  async enable(@Request() req) {
    const userId = req.user.sub;
    const user = await this.userRepository.findOneOrFail({ where: { id: userId } });

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    const secret = this.totpService.generateSecret();
    // Store secret temporarily (not yet activated until verify)
    await this.userRepository.update(userId, { twoFactorSecret: secret });

    const qrUri = this.totpService.buildQrUri(secret, user.email);
    return { secret, qrUri };
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and activate 2FA; returns 10 backup codes' })
  @ApiResponse({ status: 200, description: '2FA activated, backup codes returned' })
  async verify(@Request() req, @Body() dto: VerifyOtpDto) {
    const userId = req.user.sub;
    const user = await this.userRepository.findOneOrFail({ where: { id: userId } });

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/enable first');
    }

    if (!this.totpService.verify(user.twoFactorSecret, dto.otp)) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const rawCodes = this.totpService.generateBackupCodes();
    const hashedCodes = rawCodes.map(c => this.totpService.hashBackupCode(c));

    await this.userRepository.update(userId, {
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedCodes,
    });

    return { message: '2FA enabled', backupCodes: rawCodes };
  }

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA (requires current OTP)' })
  @ApiResponse({ status: 200, description: '2FA disabled' })
  async disable(@Request() req, @Body() dto: DisableTwoFactorDto) {
    const userId = req.user.sub;
    const user = await this.userRepository.findOneOrFail({ where: { id: userId } });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled');
    }

    if (!this.totpService.verify(user.twoFactorSecret, dto.otp)) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.userRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: undefined,
      twoFactorBackupCodes: undefined,
    });

    return { message: '2FA disabled' };
  }

  @Post('backup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate 10 backup codes (requires current OTP)' })
  @ApiResponse({ status: 200, description: 'New backup codes returned' })
  async regenerateBackupCodes(@Request() req, @Body() dto: VerifyOtpDto) {
    const userId = req.user.sub;
    const user = await this.userRepository.findOneOrFail({ where: { id: userId } });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled');
    }

    if (!this.totpService.verify(user.twoFactorSecret, dto.otp)) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const rawCodes = this.totpService.generateBackupCodes();
    const hashedCodes = rawCodes.map(c => this.totpService.hashBackupCode(c));

    await this.userRepository.update(userId, { twoFactorBackupCodes: hashedCodes });

    return { backupCodes: rawCodes };
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login using a backup code (recovery flow)' })
  @ApiResponse({ status: 200, description: 'Logged in via backup code' })
  async recover(@Body() dto: RecoverWithBackupCodeDto) {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
      throw new BadRequestException('No backup codes available');
    }

    const updatedCodes = this.totpService.consumeBackupCode(dto.backupCode, user.twoFactorBackupCodes);
    if (!updatedCodes) {
      throw new UnauthorizedException('Invalid backup code');
    }

    // Consume the backup code
    await this.userRepository.update(user.id, { twoFactorBackupCodes: updatedCodes });

    return { message: 'Recovery successful. Please re-enable 2FA with a new authenticator.' };
  }
}
