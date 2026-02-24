import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class DeviceAwarenessService {
  private readonly logger = new Logger(DeviceAwarenessService.name);
  private userDevices: Map<string, Set<string>> = new Map();

  recordDevice(userId: string, deviceId: string) {
    let devices = this.userDevices.get(userId);
    if (!devices) {
      devices = new Set();
    }
    devices.add(deviceId);
    this.userDevices.set(userId, devices);
    this.logger.log(`Device recorded: ${deviceId} for user ${userId}`);
  }

  isNewDevice(userId: string, deviceId: string): boolean {
    const devices = this.userDevices.get(userId);
    if (!devices) return true;
    return !devices.has(deviceId);
  }
}
