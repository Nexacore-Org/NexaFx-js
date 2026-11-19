import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountFreezeService } from '../services/account-freeze.service';
import { FreezeAccountDto } from '../dto/freeze-account.dto';
import { UnfreezeAccountDto } from '../dto/unfreeze-account.dto';
import { FreezeHistoryQueryDto } from '../dto/freeze-history-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminRoleGuard } from '../../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

/** A freeze or unfreeze without a real, authenticated actor is refused (no 'system' fallback). */
function requireAdminId(adminId?: string): string {
  if (!adminId) {
    throw new UnauthorizedException('An authenticated admin is required');
  }
  return adminId;
}

@ApiTags('Account Freeze')
@ApiBearerAuth('access-token')
@Controller('admin/account-freeze')
@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
export class AccountFreezeController {
  constructor(private readonly freezeService: AccountFreezeService) {}

  @Post()
  @ApiOperation({ summary: 'Freeze a user account' })
  async freeze(@Body() dto: FreezeAccountDto, @CurrentUser('id') adminId: string) {
    const freeze = await this.freezeService.freezeAccount(
      dto.userId,
      dto.reason,
      requireAdminId(adminId),
      dto.notes,
      { confirmAdminFreeze: dto.confirmAdminFreeze },
    );
    return { success: true, data: freeze };
  }

  @Post(':userId/unfreeze')
  @ApiOperation({ summary: 'Unfreeze a user account' })
  async unfreeze(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UnfreezeAccountDto,
    @CurrentUser('id') adminId: string,
  ) {
    const freeze = await this.freezeService.unfreezeAccount(userId, requireAdminId(adminId), dto.notes);
    return { success: true, data: freeze };
  }

  @Get(':userId/history')
  @ApiOperation({ summary: 'Get freeze history for a user (paginated)' })
  async history(@Param('userId', new ParseUUIDPipe()) userId: string, @Query() query: FreezeHistoryQueryDto) {
    const history = await this.freezeService.getFreezeHistory(userId, query.page, query.limit);
    return { success: true, ...history };
  }
}
