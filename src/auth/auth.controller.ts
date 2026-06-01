import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthTokenResponseDto } from './dto/auth-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  register(
    @Body() dto: RegisterDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(dto, { ip, userAgent });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and issue an access token' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  login(
    @Body() dto: LoginDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, { ip, userAgent });
  }
}
