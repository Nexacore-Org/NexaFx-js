import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from './entities/user.entity';
import { LoginDto, Enable2FADto, Disable2FADto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password, twoFactorCode } = loginDto;
    
    // Find user and validate password
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !await bcrypt.compare(password, user.password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if 2FA is required
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return {
          requiresTwoFactor: true,
          message: '2FA code required'
        };
      }

      // Verify 2FA code
      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2 // Allow 2 time windows (60 seconds before/after)
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    // Generate JWT token
    const payload = { 
      sub: user.id, 
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled 
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled
      }
    };
  }

  async generate2FASecret(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `MyApp (${user.email})`,
      issuer: 'MyApp'
    });

    // Save secret temporarily (not enabled yet)
    await this.userRepository.update(userId, {
      twoFactorSecret: secret.base32
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32
    };
  }

  async enable2FA(userId: number, enable2FADto: Enable2FADto) {
    const { code } = enable2FADto;
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Verify the provided code
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    // Enable 2FA
    await this.userRepository.update(userId, {
      twoFactorEnabled: true
    });

    return {
      message: '2FA has been successfully enabled',
      enabled: true
    };
  }

  async disable2FA(userId: number, disable2FADto: Disable2FADto) {
    const { code } = disable2FADto;
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Verify the provided code
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    // Disable 2FA and remove secret
    await this.userRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null
    });

    return {
      message: '2FA has been successfully disabled',
      enabled: false
    };
  }

  async get2FAStatus(userId: number) {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      select: ['id', 'email', 'twoFactorEnabled']
    });
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      twoFactorEnabled: user.twoFactorEnabled
    };
  }
}
