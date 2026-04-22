import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralEntity } from '../entities/referral.entity';

export interface FraudSignals {
  sameIp: boolean;
  sameDevice: boolean;
}

@Injectable()
export class ReferralFraudService {
  private readonly logger = new Logger(ReferralFraudService.name);

  constructor(
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,
  ) {}

  /**
   * Checks whether a referral conversion looks fraudulent.
   * Returns fraud signals and whether the referral should be flagged.
   */
  async checkFraud(
    referralId: string,
    referrerIp: string | null,
    referredIp: string | null,
    referrerDevice: string | null,
    referredDevice: string | null,
  ): Promise<{ flagged: boolean; signals: FraudSignals }> {
    const sameIp = !!(referrerIp && referredIp && referrerIp === referredIp);
    const sameDevice = !!(referrerDevice && referredDevice && referrerDevice === referredDevice);

    const flagged = sameIp || sameDevice;

    if (flagged) {
      this.logger.warn(
        `Fraud detected for referral ${referralId}: sameIp=${sameIp}, sameDevice=${sameDevice}`,
      );
      await this.referralRepo.update(referralId, {
        status: 'pending_review',
        fraudSignals: JSON.stringify({ sameIp, sameDevice }),
      });
    }

    return { flagged, signals: { sameIp, sameDevice } };
  }

  async getSuspiciousReferrals(): Promise<ReferralEntity[]> {
    return this.referralRepo.find({ where: { status: 'pending_review' } });
  }
}
