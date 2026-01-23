import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DeviceEntity } from '../entities/device.entity';
import { DeviceTrustService } from './device-trust.service';

type UpsertDeviceInput = {
  userId: string;
  deviceKey: string;
  deviceName?: string;
  userAgent?: string;
  ip?: string;
  geo?: { country?: string; city?: string; lat?: number; lng?: number };
  loginSuccess: boolean;
};

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    private readonly trustService: DeviceTrustService,
  ) {}

  async upsertAndScore(input: UpsertDeviceInput) {
    let device = await this.deviceRepo.findOne({
      where: { userId: input.userId, deviceKey: input.deviceKey },
    });

    const isNewDevice = !device;

    if (!device) {
      device = this.deviceRepo.create({
        userId: input.userId,
        deviceKey: input.deviceKey,
        trustScore: 50,
        trustLevel: 'neutral',
        failedLoginCount: 0,
        manuallyTrusted: false,
        manuallyRisky: false,
      });
    }

    const { score, trustLevel } = this.trustService.computeTrust(device, {
      ip: input.ip,
      userAgent: input.userAgent,
      geo: input.geo,
      loginSuccess: input.loginSuccess,
    });

    device.trustScore = score;
    device.trustLevel = trustLevel;

    // update signals only on successful login
    if (input.loginSuccess) {
      device.lastIp = input.ip;
      device.userAgent = input.userAgent;
      device.lastCountry = input.geo?.country;
      device.lastCity = input.geo?.city;
      device.lastLat = input.geo?.lat;
      device.lastLng = input.geo?.lng;
      device.lastLoginAt = new Date();
    }

    device.trustSignals = {
      ...device.trustSignals,
      isNewDevice,
      lastComputedAt: new Date().toISOString(),
    };

    return this.deviceRepo.save(device);
  }

  async listUserDevices(userId: string) {
    return this.deviceRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async updateTrust(deviceId: string, payload: { trustLevel?: string; trustScore?: number }) {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!device) return null;

    if (payload.trustLevel === 'trusted') {
      device.manuallyTrusted = true;
      device.manuallyRisky = false;
      device.trustScore = Math.max(device.trustScore, 80);
      device.trustLevel = 'trusted';
    }

    if (payload.trustLevel === 'risky') {
      device.manuallyRisky = true;
      device.manuallyTrusted = false;
      device.trustScore = Math.min(device.trustScore, 30);
      device.trustLevel = 'risky';
    }

    return this.deviceRepo.save(device);
  }
}
