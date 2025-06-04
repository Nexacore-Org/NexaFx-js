import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RecoveryService } from './recovery.service';
import { RequestRecoveryDto } from './dto/request-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Password Recovery')
@Controller('recovery')
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset instructions sent' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async requestPasswordReset(@Body() requestRecoveryDto: RequestRecoveryDto) {
    return this.recoveryService.requestPasswordReset(requestRecoveryDto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.recoveryService.resetPassword(resetPasswordDto);
  }

  @Get('validate')
  @ApiOperation({ summary: 'Validate reset token' })
  @ApiResponse({ status: 200, description: 'Token validation result' })
  async validateToken(@Query('token') token: string) {
    return this.recoveryService.validateToken(token);
  }
}
