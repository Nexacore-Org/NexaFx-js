import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountFreezeService } from '../services/account-freeze.service';
import { FreezeAccountDto } from '../dto/freeze-account.dto';
import { UnfreezeAccountDto } from '../dto/unfreeze-account.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Account Freeze')
@ApiBearerAuth('access-token')
@Controller('api/v1/admin/account-freeze')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AccountFreezeController {
  constructor(private readonly freezeService: AccountFreezeService) {}

  @Post()
  @ApiOperation({ summary: 'Freeze a user account' })
  async freeze(@Body() dto: FreezeAccountDto, @Request() req: any) {
    const adminId = req.user?.id || req.user?.sub || 'system';
    const freeze = await this.freezeService.freezeAccount(
      dto.userId,
      dto.reason,
      adminId,
      dto.notes,
    );
    return { success: true, data: freeze };
  }

  @Post(':userId/unfreeze')
  @ApiOperation({ summary: 'Unfreeze a user account' })
  async unfreeze(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UnfreezeAccountDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub || 'system';
    const freeze = await this.freezeService.unfreezeAccount(
      userId,
      adminId,
      dto.notes,
    );
    return { success: true, data: freeze };
  }

  @Get(':userId/history')
  @ApiOperation({ summary: 'Get freeze history for a user' })
  async history(@Param('userId', new ParseUUIDPipe()) userId: string) {
    const history = await this.freezeService.getFreezeHistory(userId);
    return { success: true, data: history };
  }
}
