import {
  Controller,
  Get,
  Post,
  Delete,
  All,
  Req,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common"
import type { Request } from "express"
import type { HoneypotService } from "./honeypot.service"
import type { HoneypotQueryDto } from "./dto/honeypot-query.dto"
import { AdminGuard } from "../auth/guards/admin.guard"

@Controller()
export class HoneypotController {
  private readonly logger = new Logger(HoneypotController.name)

  constructor(private readonly honeypotService: HoneypotService) {}

  // Honeypot routes - these should trigger alerts when accessed
  @All("admin/secret")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminSecret(@Req() req: Request) {
    await this.logHoneypotAccess(req);
    throw new ForbiddenException("Access denied");
  }

  @All("admin/config")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminConfig(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/users")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminUsers(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/database")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminDatabase(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/logs")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminLogs(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/backup")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminBackup(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/system")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminSystem(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/debug")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminDebug(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin/test")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminTest(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("wp-admin")
  @HttpCode(HttpStatus.FORBIDDEN)
  async wpAdmin(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("phpmyadmin")
  @HttpCode(HttpStatus.FORBIDDEN)
  async phpMyAdmin(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("admin.php")
  @HttpCode(HttpStatus.FORBIDDEN)
  async adminPhp(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("administrator")
  @HttpCode(HttpStatus.FORBIDDEN)
  async administrator(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("manager")
  @HttpCode(HttpStatus.FORBIDDEN)
  async manager(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  @All("console")
  @HttpCode(HttpStatus.FORBIDDEN)
  async console(@Req() req: Request) {
    await this.logHoneypotAccess(req)
    throw new ForbiddenException("Access denied")
  }

  // Admin endpoints for monitoring honeypot activity
  @Get("security/honeypot/logs")
  @UseGuards(AdminGuard)
  async getHoneypotLogs(@Query() query: HoneypotQueryDto) {
    return this.honeypotService.getAccessLogs(query)
  }

  @Get("security/honeypot/stats")
  @UseGuards(AdminGuard)
  async getHoneypotStats() {
    return this.honeypotService.getHoneypotStats()
  }

  @Post("security/honeypot/block/:ip")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async blockIP(@Param("ip") ipAddress: string) {
    await this.honeypotService.blockIP(ipAddress)
    return { message: `IP ${ipAddress} has been blocked` }
  }

  @Delete("security/honeypot/block/:ip")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async unblockIP(@Param("ip") ipAddress: string) {
    await this.honeypotService.unblockIP(ipAddress)
    return { message: `IP ${ipAddress} has been unblocked` }
  }

  @Get("security/honeypot/check/:ip")
  @UseGuards(AdminGuard)
  async checkIPStatus(@Param("ip") ipAddress: string) {
    const isBlocked = this.honeypotService.isIPBlocked(ipAddress)
    return { ipAddress, isBlocked }
  }

  private async logHoneypotAccess(req: Request): Promise<void> {
    const ipAddress = this.getClientIP(req)
    const route = req.route?.path || req.path
    const method = req.method
    const headers = req.headers as Record<string, string>
    const queryParams = req.query
    const body = req.body

    await this.honeypotService.logAccess(route, method, ipAddress, headers, queryParams, body)
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown"
    )
  }
}
