import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type AuthenticatedRequest = {
  user?: {
    sub?: string;
    id?: string;
  };
  ip?: string;
  headers?: Record<string, string | undefined>;
};

@Controller('api/v1/terms')
export class TermsController {
  constructor(private readonly termsService: TermsAcceptanceService) {}

  @UseGuards(JwtAuthGuard)
  @Post('accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Body() body: { version?: string },
  ) {
    const userId = request.user?.sub ?? request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    return this.termsService.accept({
      userId,
      version: body.version,
      ipAddress: request.ip ?? null,
      userAgent: request.headers?.['user-agent'] ?? null,
    });
  }
}
