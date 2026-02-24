import { Injectable, Logger } from "@nestjs/common";
import { DeviceAwarenessService } from "../../auth/device-awareness.service";

@Injectable()
export class HighRiskTransactionService {
  private readonly logger = new Logger(HighRiskTransactionService.name);

  constructor(private readonly deviceService: DeviceAwarenessService) {}

  isHighRisk(userId: string, deviceId: string, amount: number): boolean {
    // Example: flag if new device and large amount
    if (this.deviceService.isNewDevice(userId, deviceId) && amount > 5000) {
      this.logger.warn(`High-risk transaction detected: user ${userId}, device ${deviceId}, amount ${amount}`);
      return true;
    }
    return false;
  }
}
