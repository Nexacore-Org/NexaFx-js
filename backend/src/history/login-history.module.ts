import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoginHistoryService } from './login-history.service';
import { LoginHistoryController } from './login-history.controller';
import { LoginHistory } from './login-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LoginHistory])],
  controllers: [LoginHistoryController],
  providers: [LoginHistoryService],
  exports: [LoginHistoryService],
})
export class LoginHistoryModule {}

// auth.service.ts (Integration example)
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginHistoryService } from '../login-history/login-history.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private loginHistoryService: LoginHistoryService,
  ) {}

  async login(email: string, password: string, req: any) {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    try {
      // Check for too many recent failed attempts
      const recentFailedAttempts = await this.loginHistoryService.getRecentFailedAttempts(email, 15);
      if (recentFailedAttempts >= 5) {
        await this.loginHistoryService.create({
          userId: 0, // Unknown user
          email,
          ipAddress,
          userAgent,
          isSuccessful: false,
          failureReason: 'Account temporarily locked due to too many failed attempts',
        });
        throw new UnauthorizedException('Account temporarily locked');
      }

      // Validate user credentials (implement your user validation logic)
      const user = await this.validateUser(email, password);
      
      if (!user) {
        await this.loginHistoryService.create({
          userId: 0, // Unknown user
          email,
          ipAddress,
          userAgent,
          isSuccessful: false,
          failureReason: 'Invalid credentials',
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      // Log successful login
      await this.loginHistoryService.create({
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        isSuccessful: true,
      });

      const payload = { email: user.email, sub: user.id };
      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Log unexpected errors
      await this.loginHistoryService.create({
        userId: 0,
        email,
        ipAddress,
        userAgent,
        isSuccessful: false,
        failureReason: 'System error during login',
      });
      
      throw new UnauthorizedException('Login failed');
    }
  }

  private async validateUser(email: string, password: string): Promise<any> {
    // Implement your user validation logic here
    // This is just a placeholder
    return null;
  }
}