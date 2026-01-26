import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEntity, DeviceTrustLevel } from '../entities/device.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
  ) {}

  async listUserDevices(userId: string): Promise<DeviceEntity[]> {
    return this.deviceRepository.find({
      where: { userId },
      order: { lastLoginAt: 'DESC' },
    });
  }

  async updateTrust(
    deviceId: string,
    body: { trustLevel: 'trusted' | 'risky' },
  ): Promise<DeviceEntity> {
    const device = await this.deviceRepository.findOneBy({ id: deviceId });
    if (!device) {
      throw new Error('Device not found');
    }

    device.trustLevel = body.trustLevel;
    device.manuallyTrusted = body.trustLevel === 'trusted';
    device.manuallyRisky = body.trustLevel === 'risky';

    return this.deviceRepository.save(device);
  }

  async findByDeviceKey(
    userId: string,
    deviceKey: string,
  ): Promise<DeviceEntity | null> {
    return this.deviceRepository.findOne({
      where: { userId, deviceKey },
    });
  }
}
