import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
// import { DeviceService } from '../device-trust./device.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard'; // adjust to your project

@Controller('sessions/devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  // constructor(private readonly deviceService: DeviceService) {}

  @Get()
  async listMyDevices() {
    // ✅ Replace with your actual current user extraction
    // const userId = req.user.id
    const userId = 'TODO_FROM_AUTH_CONTEXT';
    // const devices = await this.deviceService.listUserDevices(userId);

    return { success: true, data: [] };
  }

  @Patch(':id/trust')
  async updateTrust(
    @Param('id') id: string,
    @Body() body: { trustLevel: 'trusted' | 'risky' },
  ) {
    // const updated = await this.deviceService.updateTrust(id, body);
    return { success: true, data: {} };
  }
}
