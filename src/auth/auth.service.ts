import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { Role } from './enums/role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(password, 12);
    const otp = this.generateOtp();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    const user = this.userRepo.create({
      email,
      password: hashed,
      role: Role.USER,
      emailVerificationOtp: otp,
      emailVerificationOtpExpiry: expiry,
    });
    await this.userRepo.save(user);
    await this.mailService.sendVerificationOtp(email, otp);

    return { message: 'Registration successful. Check your email for the OTP.' };
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 10);
    await this.userRepo.update(user.id, { refreshToken: hashedRefresh });

    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  async verifyEmail(email: string, otp: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');

    if (
      !user.emailVerificationOtp ||
      user.emailVerificationOtp !== otp ||
      !user.emailVerificationOtpExpiry ||
      user.emailVerificationOtpExpiry < new Date()
    ) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.userRepo.update(user.id, {
      isEmailVerified: true,
      emailVerificationOtp: null,
      emailVerificationOtpExpiry: null,
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');

    const now = new Date();
    const windowStart = user.resendWindowStart;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const count =
      windowStart && windowStart > oneHourAgo ? user.resendCount : 0;

    if (count >= 3) {
      throw new BadRequestException('Resend limit reached. Try again in an hour.');
    }

    const otp = this.generateOtp();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await this.userRepo.update(user.id, {
      emailVerificationOtp: otp,
      emailVerificationOtpExpiry: expiry,
      resendCount: count + 1,
      resendWindowStart: count === 0 ? now : user.resendWindowStart,
    });

    await this.mailService.sendVerificationOtp(email, otp);
    return { message: 'Verification email resent' };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async issueTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: parseInt(process.env.JWT_EXPIRY || '3600', 10),
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.REFRESH_TOKEN_SECRET,
        expiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRY || '604800', 10),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
