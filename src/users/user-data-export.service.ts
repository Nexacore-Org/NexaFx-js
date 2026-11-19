import { ForbiddenException, GoneException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { AuditLog } from '../audit/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { Transaction } from '../transactions/transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { User } from './user.entity';

const EXPORT_DIR = join(process.env.EXPORTS_DIR || join(process.cwd(), 'tmp', 'exports'), 'user-data');
/** Link lifetime; the file is only useful while the link is valid. */
export const USER_EXPORT_LINK_TTL_SECONDS = 15 * 60;
const MAX_TRANSACTIONS = 5000;
const MAX_AUDIT_ROWS = 1000;

export const USER_EXPORT_SECTIONS = ['profile', 'wallets', 'transactions', 'audit_logs'] as const;

/**
 * Explicit allow-list of what a data-subject export may contain (issue #1531). The previous
 * `sanitize()` only stripped `passwordHash`, so a real export would also have carried security
 * counters (`tokenVersion`, `failedLoginAttempts`, `lockedUntil`, `require2fa`, `piiPurgeAt`,
 * `passwordChangedAt`).
 */
export function toPublicProfile(user: Partial<User>) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isEmailVerified: user.isEmailVerified,
    kycStatus: user.kycStatus,
    kycTier: user.kycTier,
    createdAt: user.createdAt,
  };
}

interface ExportToken {
  typ: 'user-data-export';
  exportId: string;
  userId: string;
}

/**
 * Builds and serves the caller's own data export: profile (allow-list), wallets, transactions and
 * the user's own audit entries. The export id is random (`crypto.randomUUID`), not derived from
 * the timestamp or user id, and the download link is bound to both the export and the user.
 */
@Injectable()
export class UserDataExportService {
  private readonly logger = new Logger(UserDataExportService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly wallets: WalletsService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {
    // Derived from, but distinct from, the access token secret: a download token can never verify
    // as an access token.
    this.secret = createHmac('sha256', config.get<string>('jwt.secret') ?? '').update('user-data-export').digest('hex');
  }

  async collect(userId: string) {
    const manager = this.users.manager;
    const user = await this.users.findOneOrFail({ where: { id: userId } });

    const [balances, transactions, auditRows] = await Promise.all([
      this.wallets.getBalancesForAccount(userId),
      manager.find(Transaction, {
        where: [{ senderId: userId }, { receiverId: userId }],
        order: { createdAt: 'DESC' },
        take: MAX_TRANSACTIONS,
      }),
      manager.find(AuditLog, { where: { userId }, order: { createdAt: 'DESC' }, take: MAX_AUDIT_ROWS }),
    ]);

    return {
      profile: toPublicProfile(user),
      wallets: balances.map((b: { currency: string; balance: number | string; isPrimary?: boolean }) => ({
        currency: b.currency,
        balance: b.balance,
        isPrimary: b.isPrimary,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        direction: t.senderId === userId ? 'sent' : 'received',
        amount: t.amount,
        currency: t.currency,
        fee: t.fee,
        status: t.status,
        reference: t.reference,
        receiptNumber: t.receiptNumber,
        createdAt: t.createdAt,
      })),
      audit_logs: auditRows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
      })),
    };
  }

  /** Create the export file and a time-limited download link. */
  async request(userId: string) {
    const data = await this.collect(userId);
    const exportId = randomUUID();

    if (!existsSync(EXPORT_DIR)) mkdirSync(EXPORT_DIR, { recursive: true });
    writeFileSync(
      join(EXPORT_DIR, `${exportId}.json`),
      JSON.stringify({ exportId, generatedAt: new Date().toISOString(), data }, null, 2),
      { mode: 0o600 },
    );

    const token = this.jwt.sign({ typ: 'user-data-export', exportId, userId } as ExportToken, {
      secret: this.secret,
      expiresIn: USER_EXPORT_LINK_TTL_SECONDS,
    });
    const expiresAt = new Date(Date.now() + USER_EXPORT_LINK_TTL_SECONDS * 1000);
    const downloadUrl = `/api/v1/users/me/export-data/${exportId}/download?token=${token}`;

    await this.audit.log({
      userId,
      action: 'user.data_export.requested',
      entityType: 'user',
      entityId: userId,
      after: { exportId, sections: [...USER_EXPORT_SECTIONS] },
    });
    try {
      const profile = data.profile;
      this.mail.notifyExportReady({ to: profile.email as string, downloadUrl, rowCount: data.transactions.length });
    } catch (err) {
      this.logger.warn(`Could not send export-ready notification: ${(err as Error).message}`);
    }

    return { exportId, status: 'ready' as const, sections: [...USER_EXPORT_SECTIONS], downloadUrl, expiresAt };
  }

  /** Verify a download link for this user and return the file path. */
  resolve(userId: string, exportId: string, token: string): string {
    let payload: ExportToken;
    try {
      payload = this.jwt.verify<ExportToken>(token, { secret: this.secret });
    } catch {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    if (payload.typ !== 'user-data-export' || payload.exportId !== exportId || payload.userId !== userId) {
      throw new ForbiddenException('Download link is invalid or has expired');
    }
    const path = join(EXPORT_DIR, `${exportId}.json`);
    if (!existsSync(path)) {
      throw new GoneException('This export has expired; request a new one');
    }
    return path;
  }
}
