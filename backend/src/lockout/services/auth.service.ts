import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { AccountLockoutService } from './account-lockout.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private accountLockoutService: AccountLockoutService,
  ) {}

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id);
    if (isLocked) {
      const lockoutInfo = await this.accountLockoutService.getLockoutInfo(user.id);
      throw new UnauthorizedException(
        `Account is locked until ${lockoutInfo.lockedUntil?.toISOString()}. Please try again later.`
      );
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      // Handle failed login
      const result = await this.accountLockoutService.handleFailedLogin(user.id);
      
      if (result.isLocked) {
        throw new UnauthorizedException('Account has been locked due to too many failed login attempts. Please try again later.');
      } else {
        throw new UnauthorizedException(
          `Invalid credentials. ${result.attemptsRemaining} attempts remaining before account lockout.`
        );
      }
    }

    // Handle successful login
    await this.accountLockoutService.handleSuccessfulLogin(user.id);

    // Generate JWT token
    const payload = { sub: user.id, email: user.email };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
