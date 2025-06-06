import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
} from "@nestjs/common"
import type { AdminIpService } from "./admin-ip.service"
import type {
  CreateAdminIpWhitelistDto,
  UpdateAdminIpWhitelistDto,
  BulkAddIpsDto,
  IpAccessTestDto,
} from "./dto/admin-ip.dto"
import type { AdminIpWhitelistQueryDto, AdminIpAccessLogQueryDto } from "./dto/admin-ip-query.dto"
import { AdminGuard } from "../auth/guards/admin.guard"
import { AdminIpGuard } from "./guards/admin-ip.guard"

@Controller("admin/ip-whitelist")
@UseGuards(AdminGuard, AdminIpGuard)
export class AdminIpController {
  private readonly logger = new Logger(AdminIpController.name)

  constructor(private readonly adminIpService: AdminIpService) {}

  @Get("config")
  @HttpCode(HttpStatus.OK)
  getConfig() {
    return this.adminIpService.getConfig()
  }

  @Get("stats")
  @HttpCode(HttpStatus.OK)
  async getStats() {
    return this.adminIpService.getWhitelistStats()
  }

  @Get("entries")
  @HttpCode(HttpStatus.OK)
  async getWhitelistEntries(@Query() query: AdminIpWhitelistQueryDto) {
    return this.adminIpService.getWhitelistEntries(query)
  }

  @Get("entries/:id")
  @HttpCode(HttpStatus.OK)
  async getWhitelistEntry(@Param("id") id: string) {
    return this.adminIpService.getWhitelistEntryById(id)
  }

  @Post("entries")
  @HttpCode(HttpStatus.CREATED)
  async addIpToWhitelist(@Body() createDto: CreateAdminIpWhitelistDto, @Request() req) {
    return this.adminIpService.addIpToWhitelist(createDto, req.user?.id)
  }

  @Post("entries/bulk")
  @HttpCode(HttpStatus.CREATED)
  async bulkAddIps(@Body() bulkDto: BulkAddIpsDto, @Request() req) {
    return this.adminIpService.bulkAddIps(bulkDto, req.user?.id)
  }

  @Patch("entries/:id")
  @HttpCode(HttpStatus.OK)
  async updateWhitelistEntry(@Param("id") id: string, @Body() updateDto: UpdateAdminIpWhitelistDto, @Request() req) {
    return this.adminIpService.updateWhitelistEntry(id, updateDto, req.user?.id)
  }

  @Delete("entries/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWhitelistEntry(@Param("id") id: string) {
    return this.adminIpService.deleteWhitelistEntry(id)
  }

  @Get("access-logs")
  @HttpCode(HttpStatus.OK)
  async getAccessLogs(@Query() query: AdminIpAccessLogQueryDto) {
    return this.adminIpService.getAccessLogs(query)
  }

  @Post("test-access")
  @HttpCode(HttpStatus.OK)
  async testIpAccess(@Body() testDto: IpAccessTestDto) {
    return this.adminIpService.testIpAccess(
      testDto.ipAddress,
      testDto.requestPath || "/admin",
      testDto.userAgent,
    )
  }

  @Get("blocked-ips")
  @HttpCode(HttpStatus.OK)
  async getBlockedIps() {
    return this.adminIpService.getBlockedIps()
  }

  @Post("blocked-ips/clear")
  @HttpCode(HttpStatus.OK)
  async clearBlockedIps() {
    const count = await this.adminIpService.clearBlockedIps()
    return { message: `Cleared ${count} blocked IPs`, count }
  }

  @Post("blocked-ips/:ip/unblock")
  @HttpCode(HttpStatus.OK)
  async unblockIp(@Param("ip") ipAddress: string) {
    const wasBlocked = await this.adminIpService.unblockIp(ipAddress)
    return {
      message: wasBlocked ? `IP ${ipAddress} has been unblocked` : `IP ${ipAddress} was not blocked`,
      wasBlocked,
    }
  }
}
