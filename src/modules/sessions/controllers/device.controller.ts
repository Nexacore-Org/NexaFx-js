import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { DeviceService } from '../services/device.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AuditLog } from '../../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import { DeviceTrustLevel } from '../entities/device.entity';

@Controller('sessions/devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @SkipAudit()
  async listMyDevices(@Req() req: Request & { user: { sub: string } }) {
    const devices = await this.deviceService.listUserDevices(req.user.sub);
    return { success: true, data: devices };
  }

  @Patch(':id/trust')
  @AuditLog({
    action: 'UPDATE_DEVICE_TRUST',
    entity: 'Device',
    entityIdParam: 'id',
    description: 'Updated device trust level',
  })
  async updateTrust(
    @Param('id') id: string,
    @Body() body: { trustLevel: DeviceTrustLevel },
    @Req() req: Request & { user: { sub: string } },
  ) {
    const updated = await this.deviceService.updateTrust(
      id,
      req.user.sub,
      body.trustLevel,
      req.ip,
      req.headers['user-agent'],
    );
    return { success: true, data: updated };
  }
}
