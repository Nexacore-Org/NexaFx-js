import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    UseGuards,
    Req,
    HttpCode,
    HttpStatus,
  } from '@nestjs/common';
  import { Request } from 'express';
  import { DeviceService } from './device.service';
  import { CreateDeviceDto } from './dto/create-device.dto';
  import { DeviceResponseDto } from './dto/device-response.dto';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Adjust import path as needed
  
  interface AuthenticatedRequest extends Request {
    user: {
      id: string;
      // other user properties
    };
  }
  
  @Controller('devices')
  @UseGuards(JwtAuthGuard)
  export class DeviceController {
    constructor(private readonly deviceService: DeviceService) {}
  
    @Post()
    async registerDevice(
      @Body() createDeviceDto: CreateDeviceDto,
      @Req() req: AuthenticatedRequest,
    ): Promise<DeviceResponseDto> {
      // Override userId from token to prevent tampering
      createDeviceDto.userId = req.user.id;
      return this.deviceService.createDevice(createDeviceDto);
    }
  
    @Post('login')
    async loginDevice(@Req() req: AuthenticatedRequest): Promise<DeviceResponseDto> {
      const userAgent = req.get('User-Agent') || 'Unknown';
      const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
  
      const createDeviceDto: CreateDeviceDto = {
        userId: req.user.id,
        userAgent,
        ipAddress,
      };
  
      return this.deviceService.createDevice(createDeviceDto);
    }
  
    @Get()
    async getUserDevices(@Req() req: AuthenticatedRequest): Promise<DeviceResponseDto[]> {
      return this.deviceService.getUserDevices(req.user.id);
    }
  
    @Delete(':deviceId')
    @HttpCode(HttpStatus.NO_CONTENT)
    async revokeDevice(
      @Param('deviceId') deviceId: string,
      @Req() req: AuthenticatedRequest,
    ): Promise<void> {
      await this.deviceService.revokeDevice(deviceId, req.user.id);
    }
  
    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    async revokeAllDevices(@Req() req: AuthenticatedRequest): Promise<void> {
      await this.deviceService.revokeAllDevices(req.user.id);
    }
  
    @Post('update-usage')
    @HttpCode(HttpStatus.OK)
    async updateUsage(@Req() req: AuthenticatedRequest): Promise<{ message: string }> {
      const userAgent = req.get('User-Agent') || 'Unknown';
      const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
  
      await this.deviceService.updateDeviceUsage(req.user.id, userAgent, ipAddress);
      return { message: 'Device usage updated' };
    }
  }
  