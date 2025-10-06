import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IpBlockService } from '../services/ip-block.service';
import { AdminGuard } from '../../backup/guards/admin.guard';
import { BlockIPDto, WhitelistIPDto } from '../dto/block-ip.dto';

@Controller('security')
export class IpBlockController {
  constructor(private readonly ipBlockService: IpBlockService) {}

  @Get('blocked-ips')
  @UseGuards(AdminGuard)
  async getBlockedIPs() {
    const blockedIPs = await this.ipBlockService.getBlockedIPs();
    return {
      success: true,
      count: blockedIPs.length,
      data: blockedIPs,
    };
  }

  @Post('admin/block-ip')
  @UseGuards(AdminGuard)
  async blockIP(@Body() dto: BlockIPDto) {
    await this.ipBlockService.blockIP(
      dto.ip,
      dto.reason,
      dto.ttl,
      dto.isAutomatic,
    );
    return {
      success: true,
      message: `IP ${dto.ip} has been blocked`,
    };
  }

  @Delete('admin/unblock-ip/:ip')
  @UseGuards(AdminGuard)
  async unblockIP(@Param('ip') ip: string) {
    await this.ipBlockService.unblockIP(ip);
    return {
      success: true,
      message: `IP ${ip} has been unblocked`,
    };
  }

  @Post('admin/whitelist-ip')
  @UseGuards(AdminGuard)
  async whitelistIP(@Body() dto: WhitelistIPDto) {
    await this.ipBlockService.whitelistIP(dto.ip, dto.description);
    return {
      success: true,
      message: `IP ${dto.ip} has been added to whitelist`,
    };
  }

  @Get('admin/whitelist-ips')
  @UseGuards(AdminGuard)
  async getWhitelistedIPs() {
    const whitelistedIPs = await this.ipBlockService.getWhitelistedIPs();
    return {
      success: true,
      count: whitelistedIPs.length,
      data: whitelistedIPs,
    };
  }

  @Delete('admin/whitelist-ip/:ip')
  @UseGuards(AdminGuard)
  async removeFromWhitelist(@Param('ip') ip: string) {
    await this.ipBlockService.removeFromWhitelist(ip);
    return {
      success: true,
      message: `IP ${ip} has been removed from whitelist`,
    };
  }
}
