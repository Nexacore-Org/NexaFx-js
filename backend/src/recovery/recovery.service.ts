import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PasswordReset } from './entities/password-reset.entity';
import { RequestRecoveryDto } from './dto/request-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class RecoveryService {
  constructor(
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async requestPasswordReset(
    requestRecoveryDto: RequestRecoveryDto,
  ): Promise<{ message: string; token?: string }> {
    const { email } = requestRecoveryDto;

    // Check if user exists (you'll need to inject your User repository)
    // const user = await this.userRepository.findOne({ where: { email } });
    // if (!user) {
    //   // Don't reveal if email exists or not for security
    //   return { message: 'If the email exists, a reset link has been sent' };
    // }

    // Invalidate any existing tokens for this email
    await this.passwordResetRepository.update(
      { email, used: false },
      { used: true },
    );

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    // Save reset token
    const passwordReset = this.passwordResetRepository.create({
      email,
      token,
      expiresAt,
    });

    await this.passwordResetRepository.save(passwordReset);

    // In production, send email instead of returning token
    // await this.emailService.sendPasswordResetEmail(email, token);

    return {
      message: 'Password reset instructions sent to your email',
      token, // Remove this in production - only for testing
    };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    // Find valid, unused token
    const passwordReset = await this.passwordResetRepository.findOne({
      where: {
        token,
        used: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!passwordReset) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Mark token as used
    passwordReset.used = true;
    await this.passwordResetRepository.save(passwordReset);

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password (you'll need to inject your User repository)
    // await this.userRepository.update(
    //   { email: passwordReset.email },
    //   { password: hashedPassword }
    // );

    console.log(`Password reset successful for: ${passwordReset.email}`);
    console.log(`New hashed password: ${hashedPassword}`);

    return { message: 'Password reset successful' };
  }

  async validateToken(
    token: string,
  ): Promise<{ valid: boolean; email?: string }> {
    const passwordReset = await this.passwordResetRepository.findOne({
      where: {
        token,
        used: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!passwordReset) {
      return { valid: false };
    }

    return { valid: true, email: passwordReset.email };
  }

  // Cleanup expired tokens (run as cron job)
  async cleanupExpiredTokens(): Promise<void> {
    await this.passwordResetRepository.delete({
      expiresAt: MoreThan(new Date()),
    });
  }
}
