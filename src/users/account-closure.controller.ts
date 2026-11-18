import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { AccountClosureService } from './account-closure.service';
import { UserDataExportService } from './user-data-export.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CloseAccountDto } from './dto/close-account.dto';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class AccountClosureController {
  constructor(
    private readonly accountClosureService: AccountClosureService,
    private readonly dataExport: UserDataExportService,
  ) {}

  @Post('close-account')
  async closeAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: CloseAccountDto,
  ): Promise<{ closed: true; deletedAt: Date; piiPurgeAt: Date }> {
    // Identity comes from the global JWT guard, never from a re-parsed header.
    return this.accountClosureService.closeAccount(userId, dto.currentPassword);
  }

  /**
   * Request a copy of your own data (issue #1531). POST because it creates a file and sends mail;
   * limited to one request per hour. The response never carries the data itself, only a random
   * export id and a short-lived download link bound to this user.
   */
  @Throttle({ default: { limit: 1, ttl: 3_600_000 } })
  @Post('export-data')
  requestExport(@CurrentUser('id') userId: string) {
    return this.dataExport.request(userId);
  }

  @Get('export-data/:exportId/download')
  download(
    @CurrentUser('id') userId: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    res.download(this.dataExport.resolve(userId, exportId, token), `nexafx-data-export-${exportId}.json`);
  }
}
