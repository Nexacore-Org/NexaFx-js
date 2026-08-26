import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt.guard';
import { RefreshTokensService } from '../../../tokens/refresh-tokens.service';

interface AuthenticatedRequest {
  user: { sub: string };
}

@Controller('api/v1/auth/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly refreshTokensService: RefreshTokensService) {}

  @Get()
  async listSessions(@Request() req: AuthenticatedRequest) {
    const devices = await this.refreshTokensService.findActiveDevices(req.user.sub);
    return {
      sessions: devices.map((d, i) => ({
        tokenId: d.tokenId,
        deviceName: d.deviceName ?? 'Unknown device',
        deviceOs: d.deviceOs ?? 'Unknown OS',
        lastUsedAt: d.lastUsedAt,
        ipAddress: d.ipAddress,
        createdAt: d.createdAt,
        isCurrent: i === 0,
      })),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const revoked = await this.refreshTokensService.revokeToken(req.user.sub, id);
    if (!revoked) {
      throw new NotFoundException('Session not found or already revoked');
    }
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@Request() req: AuthenticatedRequest) {
    const devices = await this.refreshTokensService.findActiveDevices(req.user.sub);
    if (devices.length > 0) {
      await this.refreshTokensService.revokeAllExcept(req.user.sub, devices[0].tokenId);
    }
  }
}
