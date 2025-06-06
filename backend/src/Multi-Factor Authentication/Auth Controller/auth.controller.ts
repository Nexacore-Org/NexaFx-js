import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, Enable2FADto, Disable2FADto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('2fa/generate')
  @UseGuards(AuthGuard('jwt'))
  async generate2FA(@Request() req) {
    return this.authService.generate2FASecret(req.user.sub);
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard('jwt'))
  async enable2FA(@Request() req, @Body() enable2FADto: Enable2FADto) {
    return this.authService.enable2FA(req.user.sub, enable2FADto);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  async disable2FA(@Request() req, @Body() disable2FADto: Disable2FADto) {
    return this.authService.disable2FA(req.user.sub, disable2FADto);
  }

  @Get('2fa/status')
  @UseGuards(AuthGuard('jwt'))
  async get2FAStatus(@Request() req) {
    return this.authService.get2FAStatus(req.user.sub);
  }
}