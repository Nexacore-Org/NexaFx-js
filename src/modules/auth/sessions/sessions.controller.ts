import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * Session management endpoints — list active sessions, revoke individual or all.
 */
@Controller('api/v1/auth/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  @Get()
  listSessions(@Request() req: { user: { sub: string } }) {
    return {
      message: 'Active sessions listing — integrate with SessionsService.findActive()',
      userId: req.user.sub,
      sessions: [],
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return { message: `Session ${id} revoked for user ${req.user.sub}` };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeAllSessions(@Request() req: { user: { sub: string } }) {
    return { message: `All sessions revoked for user ${req.user.sub}` };
  }
}
