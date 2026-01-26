import { Injectable } from '@nestjs/common';
import { DeviceEntity, DeviceTrustLevel } from '../entities/device.entity';

interface TrustSignals {
  ipAddress?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  failedAttempts?: number;
}

@Injectable()
export class DeviceTrustService {
  calculateTrustScore(device: DeviceEntity, signals: TrustSignals): number {
    let score = 50;

    if (device.manuallyTrusted) {
      return 100;
    }

    if (device.manuallyRisky) {
      return 0;
    }

    if (device.failedLoginCount > 5) {
      score -= 30;
    } else if (device.failedLoginCount > 2) {
      score -= 15;
    }

    if (signals.country && device.lastCountry) {
      if (signals.country !== device.lastCountry) {
        score -= 20;
      }
    }

    if (device.lastLoginAt) {
      const daysSinceLastLogin =
        (Date.now() - device.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLogin < 7) {
        score += 10;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  determineTrustLevel(score: number): DeviceTrustLevel {
    if (score >= 70) {
      return 'trusted';
    }
    if (score <= 30) {
      return 'risky';
    }
    return 'neutral';
  }
}
