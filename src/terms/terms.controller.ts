import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

type AuthenticatedRequest = {
  user?: {
    sub?: string;
    id?: string;
  };
  ip?: string;
  headers?: Record<string, string | undefined>;
};

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsAcceptanceService) {}

  /** Public: lets clients discover which terms version they must display. */
  @Public()
  @Get('current')
  current() {
    return { version: this.termsService.currentVersion() };
  }

  /** The caller's acceptance state for the current version. */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  status(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    return this.termsService.getStatus(userId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('accept')
  accept(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    return this.termsService.accept({
      userId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers?.['user-agent'] ?? null,
    });
  }
}
