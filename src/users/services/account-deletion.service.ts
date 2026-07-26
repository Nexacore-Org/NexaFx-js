import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserAccount } from '../user-account.entity';
import { Referral } from '../../referral/referral.entity';
import { AuditLog } from '../../audit/audit-log.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';
import { RateAlertEntity } from '../../rate-alerts/rate-alert.entity';

interface DeletionResult {
  deleted: true;
  deletedAt: Date;
  preservedRecords: string[];
}

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectRepository(UserAccount)
    private readonly userAccountRepo: Repository<UserAccount>,
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(RateAlertEntity)
    private readonly rateAlertRepo: Repository<RateAlertEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async deleteAccount(userId: string): Promise<DeletionResult> {
    const account = await this.userAccountRepo.findOne({ where: { id: userId } });
    if (!account) throw new UnauthorizedException('Account not found');

    return this.dataSource.transaction(async (manager) => {
      const now = new Date();

      await manager.update(RefreshToken, { userId }, { revokedAt: now });

      const referralRepo = manager.getRepository(Referral);
      await referralRepo.delete({ refereeId: userId });
      await referralRepo.delete({ referrerId: userId });

      const auditRepo = manager.getRepository(AuditLog);
      await auditRepo.update({ userId }, { userId: null, reason: 'account-deleted' });

      const rateAlertRepo = manager.getRepository(RateAlertEntity);
      await rateAlertRepo.delete({ userId });

      account.deletedAt = now;
      account.isActive = false;
      await manager.save(UserAccount, account);

      return {
        deleted: true,
        deletedAt: now,
        preservedRecords: ['audit_logs'],
      };
    });
  }
}
