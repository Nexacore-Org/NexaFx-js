import { Injectable } from '@nestjs/common';
import { DeviceEntity, DeviceTrustLevel } from '../entities/device.entity';

type TrustSignalInput = {
  ip?: string;
  userAgent?: string;
  geo?: { country?: string; city?: string; lat?: number; lng?: number };
  loginSuccess: boolean;
};

@Injectable()
export class DeviceTrustService {
  computeTrust(device: DeviceEntity, input: TrustSignalInput) {
    let score = device.trustScore ?? 50;

    // manual overrides are respected strongly
    if (device.manuallyTrusted) score = Math.max(score, 80);
    if (device.manuallyRisky) score = Math.min(score, 30);

    // signal: failed login
    if (!input.loginSuccess) {
      score -= 10;
      device.failedLoginCount = (device.failedLoginCount ?? 0) + 1;
    }

    // signal: successful login
    if (input.loginSuccess) {
      score += 2;
      device.failedLoginCount = 0;
    }

    // signal: IP change
    if (input.ip && device.lastIp && input.ip !== device.lastIp) {
      score -= 5;
    }

    // signal: user-agent change
    if (input.userAgent && device.userAgent && input.userAgent !== device.userAgent) {
      score -= 3;
    }

    // signal: geo drift (simple distance check)
    if (
      typeof input.geo?.lat === 'number' &&
      typeof input.geo?.lng === 'number' &&
      typeof device.lastLat === 'number' &&
      typeof device.lastLng === 'number'
    ) {
      const distKm = this.haversineKm(device.lastLat, device.lastLng, input.geo.lat, input.geo.lng);

      if (distKm > 500) score -= 15; // big drift
      if (distKm > 50 && distKm <= 500) score -= 5; // moderate drift
    }

    // clamp score
    score = Math.max(0, Math.min(100, score));

    const trustLevel: DeviceTrustLevel =
      score >= 80 ? 'trusted' : score < 40 ? 'risky' : 'neutral';

    return { score, trustLevel };
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = this.degToRad(lat2 - lat1);
    const dLon = this.degToRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.degToRad(lat1)) *
        Math.cos(this.degToRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
  }

  private degToRad(x: number) {
    return (x * Math.PI) / 180;
  }
}
