import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DeviceEntity, DeviceTrustLevel } from '../entities/device.entity';
import { AdminAuditService } from '../../admin-audit/admin-audit.service';
import { ActorType } from '../../admin-audit/entities/admin-audit-log.entity';

export interface RegisterDeviceDto {
  userId: string;
  deviceKey: string;
  deviceName?: string;
  userAgent?: string;
  platform?: string;
  browser?: string;
  lastIp?: string;
  lastCountry?: string;
  lastCity?: string;
}

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    private readonly auditService: AdminAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async listUserDevices(userId: string): Promise<DeviceEntity[]> {
    return this.deviceRepo.find({
      where: { userId },
      order: { lastLoginAt: 'DESC' },
    });
  }

  async registerOrUpdateDevice(dto: RegisterDeviceDto): Promise<DeviceEntity> {
    let device = await this.deviceRepo.findOne({
      where: { userId: dto.userId, deviceKey: dto.deviceKey },
    });

    if (device) {
      if (device.trustLevel === 'risky') {
        throw new ForbiddenException('Device is banned');
      }
      device.lastIp = dto.lastIp ?? device.lastIp;
      device.lastCountry = dto.lastCountry ?? device.lastCountry;
      device.lastCity = dto.lastCity ?? device.lastCity;
      device.userAgent = dto.userAgent ?? device.userAgent;
      device.lastLoginAt = new Date();
      return this.deviceRepo.save(device);
    }

    device = this.deviceRepo.create({
      ...dto,
      trustLevel: 'neutral',
      trustScore: 50,
      lastLoginAt: new Date(),
    });
    return this.deviceRepo.save(device);
  }

  async updateTrust(
    deviceId: string,
    userId: string,
    trustLevel: DeviceTrustLevel,
    actorIp?: string,
    userAgent?: string,
  ): Promise<DeviceEntity> {
    return this.dataSource.transaction(async (manager) => {
      const device = await manager.findOne(DeviceEntity, {
        where: { id: deviceId, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!device) {
        throw new NotFoundException('Device not found');
      }

      const before = { trustLevel: device.trustLevel, trustScore: device.trustScore };

      device.trustLevel = trustLevel;
      device.manuallyTrusted = trustLevel === 'trusted';
      device.manuallyRisky = trustLevel === 'risky';
      device.trustScore =
        trustLevel === 'trusted' ? 90 : trustLevel === 'risky' ? 10 : 50;

      const updated = await manager.save(DeviceEntity, device);

      await this.auditService.logAction({
        actorId: userId,
        actorType: ActorType.USER,
        action: 'UPDATE_DEVICE_TRUST',
        entity: 'Device',
        entityId: deviceId,
        beforeSnapshot: before,
        afterSnapshot: { trustLevel: updated.trustLevel, trustScore: updated.trustScore },
        ip: actorIp,
        userAgent,
        description: `Device trust updated to ${trustLevel}`,
      });

      return updated;
    });
  }

  async isDeviceBanned(userId: string, deviceKey: string): Promise<boolean> {
    const device = await this.deviceRepo.findOne({
      where: { userId, deviceKey },
      select: ['trustLevel'],
    });
    return device?.trustLevel === 'risky';
  }
}
