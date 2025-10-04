import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { SessionSecurityService } from '../services/session-security.service';
import { AdminGuard } from '../../backup/guards/admin.guard';

@Controller('security/session')
export class SessionController {
  constructor(
    private readonly sessionSecurityService: SessionSecurityService,
  ) {}

  @Get(':userId/devices')
  @UseGuards(AdminGuard)
  async getUserDevices(@Param('userId') userId: string) {
    const sessions = await this.sessionSecurityService.getUserSessions(userId);

    return {
      success: true,
      count: sessions.length,
      data: sessions,
    };
  }

  @Post(':sessionId/revoke')
  @UseGuards(AdminGuard)
  async revokeSession(@Param('sessionId') sessionId: string) {
    await this.sessionSecurityService.revokeSession(sessionId);

    return {
      success: true,
      message: `Session ${sessionId} has been revoked`,
    };
  }
}
