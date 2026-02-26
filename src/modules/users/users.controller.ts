import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getUserId(req: any): string {
    // In a real app, the guard/strategy populates req.user
    // If not present (due to placeholder guard), we might check headers or throw
    const user = req.user;
    if (user && user.id) {
      return user.id;
    }
    
    // Fallback for development/testing if user object isn't fully populated by the placeholder guard
    // but typically the guard ensures authentication.
    // Let's assume the client might send a mock header for now if the guard is loose.
    const mockId = req.headers['x-user-id'];
    if (mockId) {
      return mockId;
    }

    // If we can't identify the user, we can't get their preferences
    throw new UnauthorizedException('User ID could not be determined from request');
  }

  @Get('preferences')
  @SkipAudit()
  async getPreferences(@Request() req) {
    const userId = this.getUserId(req);
    return this.usersService.getPreferences(userId);
  }

  @Patch('preferences')
  @AuditLog({
    action: 'UPDATE_USER_PREFERENCES',
    entity: 'UserPreferences',
    description: 'User updated their preferences',
  })
  async updatePreferences(
    @Request() req,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    const userId = this.getUserId(req);
    return this.usersService.updatePreferences(userId, dto);
  }
}
