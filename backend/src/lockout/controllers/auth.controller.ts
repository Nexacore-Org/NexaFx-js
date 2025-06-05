import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

export class LoginDto {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }
}

// 5. Account Lockout Guard (Optional - for additional protection)
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AccountLockoutService } from './account-lockout.service';

@Injectable()
export class AccountLockoutGuard implements CanActivate {
  constructor(private accountLockoutService: AccountLockoutService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      return true; // Let other guards handle authentication
    }

    const isLocked = await this.accountLockoutService.isAccountLocked(userId);
    
    if (isLocked) {
      throw new UnauthorizedException('Account is locked');
    }

    return true;
  }
}
