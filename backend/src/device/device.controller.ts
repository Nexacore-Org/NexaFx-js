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
import type { DeviceService } from "./device.service"
import type { CreateDeviceFingerprintDto, CreateSessionDto, UpdateDeviceDto } from "./dto/device.dto"
import type { DeviceQueryDto, SessionQueryDto, AnomalyQueryDto } from "./dto/device-query.dto"
import { AdminGuard } from "../auth/guards/admin.guard"
import { AuthGuard } from "../auth/guards/auth.guard"

@Controller("security/devices")
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name)

  constructor(private readonly deviceService: DeviceService) {}

  @Post("register")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @Body("fingerprint") fingerprintData: CreateDeviceFingerprintDto,
    @Body("session") sessionData: CreateSessionDto,
    @Request() req,
  ) {
    const userId = req.user.id
    this.logger.debug(`Registering device for user ${userId}`)
    return this.deviceService.registerDevice(userId, fingerprintData, sessionData)
  }

  @Get()
  @UseGuards(AdminGuard)
  async getDevices(@Query() query: DeviceQueryDto) {
    return this.deviceService.getDevices(query)
  }

  @Get("my-devices")
  @UseGuards(AuthGuard)
  async getMyDevices(@Request() req, @Query() query: DeviceQueryDto) {
    query.userId = req.user.id
    return this.deviceService.getDevices(query)
  }

  @Get("stats")
  @UseGuards(AdminGuard)
  async getDeviceStats() {
    return this.deviceService.getDeviceStats()
  }

  @Get("user/:userId/summary")
  @UseGuards(AdminGuard)
  async getUserDeviceSummary(@Param("userId") userId: string) {
    return this.deviceService.getUserDeviceSummary(userId)
  }

  @Get("my-summary")
  @UseGuards(AuthGuard)
  async getMyDeviceSummary(@Request() req) {
    return this.deviceService.getUserDeviceSummary(req.user.id)
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  async getDeviceById(@Param("id") id: string, @Request() req) {
    const device = await this.deviceService.getDeviceById(id)

    // Users can only view their own devices, admins can view any device
    if (!req.user.isAdmin && device.userId !== req.user.id) {
      throw new Error("Access denied")
    }

    return device
  }

  @Patch(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateDevice(@Param("id") id: string, @Body() updateData: UpdateDeviceDto, @Request() req) {
    const device = await this.deviceService.getDeviceById(id)

    // Users can only update their own devices, admins can update any device
    if (!req.user.isAdmin && device.userId !== req.user.id) {
      throw new Error("Access denied")
    }

    return this.deviceService.updateDevice(id, updateData)
  }

  @Post(":id/trust")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async trustDevice(@Param("id") id: string, @Request() req) {
    const device = await this.deviceService.getDeviceById(id)

    // Users can only trust their own devices, admins can trust any device
    if (!req.user.isAdmin && device.userId !== req.user.id) {
      throw new Error("Access denied")
    }

    return this.deviceService.trustDevice(id)
  }

  @Post(":id/block")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async blockDevice(@Param("id") id: string, @Body("reason") reason?: string) {
    return this.deviceService.blockDevice(id, reason)
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDevice(@Param("id") id: string, @Request() req) {
    const device = await this.deviceService.getDeviceById(id)

    // Users can only delete their own devices, admins can delete any device
    if (!req.user.isAdmin && device.userId !== req.user.id) {
      throw new Error("Access denied")
    }

    return this.deviceService.deleteDevice(id)
  }

  @Get("sessions/list")
  @UseGuards(AdminGuard)
  async getSessions(@Query() query: SessionQueryDto) {
    return this.deviceService.getSessions(query)
  }

  @Get("sessions/my-sessions")
  @UseGuards(AuthGuard)
  async getMySessions(@Request() req, @Query() query: SessionQueryDto) {
    query.userId = req.user.id
    return this.deviceService.getSessions(query)
  }

  @Post("sessions/:sessionId/terminate")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async terminateSession(@Param("sessionId") sessionId: string, @Request() req) {
    // In a real application, you would check if the user owns the session
    return this.deviceService.terminateSession(sessionId)
  }

  @Get("anomalies/list")
  @UseGuards(AdminGuard)
  async getAnomalies(@Query() query: AnomalyQueryDto) {
    return this.deviceService.getAnomalies(query)
  }

  @Get("anomalies/my-anomalies")
  @UseGuards(AuthGuard)
  async getMyAnomalies(@Request() req, @Query() query: AnomalyQueryDto) {
    query.userId = req.user.id
    return this.deviceService.getAnomalies(query)
  }

  @Post("anomalies/:id/resolve")
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async resolveAnomaly(@Param("id") id: string, @Body("resolutionNotes") resolutionNotes: string) {
    return this.deviceService.resolveAnomaly(id, resolutionNotes)
  }
}
