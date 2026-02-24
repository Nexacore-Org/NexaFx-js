import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEntity } from '../../../sessions/entities/device.entity';
import {
  RiskCheckContext,
  RiskCheckResult,
} from '../../interfaces/risk-check.interface';

const NEW_DEVICE_SCORE = 25;
const RISKY_DEVICE_SCORE = 40;

@Injectable()
export class NewDeviceCheck {
  private readonly logger = new Logger(NewDeviceCheck.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
  ) {}

  async run(context: RiskCheckContext): Promise<RiskCheckResult> {
    if (!context.userId || !context.deviceKey) {
      return {
        checkName: 'NEW_DEVICE',
        triggered: false,
        score: 0,
        reason: 'No device information available',
      };
    }

    const device = await this.deviceRepo.findOne({
      where: { userId: context.userId, deviceKey: context.deviceKey },
    });

    if (!device) {
      this.logger.debug(
        `New/unknown device detected for user ${context.userId}: ${context.deviceKey}`,
      );
      return {
        checkName: 'NEW_DEVICE',
        triggered: true,
        score: NEW_DEVICE_SCORE,
        reason: `Transaction initiated from an unrecognized device (key: ${context.deviceKey})`,
      };
    }

    if (device.trustLevel === 'risky') {
      return {
        checkName: 'NEW_DEVICE',
        triggered: true,
        score: RISKY_DEVICE_SCORE,
        reason: `Transaction from a device marked as risky (device: ${device.deviceName ?? device.deviceKey}, trust score: ${device.trustScore})`,
      };
    }

    return {
      checkName: 'NEW_DEVICE',
      triggered: false,
      score: 0,
      reason: `Known ${device.trustLevel} device (trust score: ${device.trustScore})`,
    };
  }
}
