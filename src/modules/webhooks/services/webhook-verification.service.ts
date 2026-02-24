import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WebhookInboundLogEntity,
  WebhookRejectionReason,
} from '../entities/webhook-inbound-log.entity';
import { verifyWebhookSignature } from '../utils/webhook-signature';

// Max age of a webhook timestamp before it is considered stale (5 minutes)
const TIMESTAMP_TOLERANCE_SECONDS = 300;

export interface VerificationContext {
  signature: string;
  timestamp: string;
  deliveryId: string;
  rawBody: string;
  secret: string;
  ipAddress?: string;
  eventName?: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: WebhookRejectionReason;
}

@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);

  constructor(
    @InjectRepository(WebhookInboundLogEntity)
    private readonly logRepo: Repository<WebhookInboundLogEntity>,
  ) {}

  async verify(ctx: VerificationContext): Promise<VerificationResult> {
    // 1. Timestamp staleness check
    const tsSeconds = parseInt(ctx.timestamp, 10);
    if (isNaN(tsSeconds)) {
      await this.log(ctx, 'rejected', 'MISSING_HEADERS');
      return { valid: false, reason: 'MISSING_HEADERS' };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - tsSeconds;
    if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS || ageSeconds < -60) {
      this.logger.warn(
        `Webhook rejected — timestamp too old or too far in future: age=${ageSeconds}s deliveryId=${ctx.deliveryId}`,
      );
      await this.log(ctx, 'rejected', 'TIMESTAMP_TOO_OLD');
      return { valid: false, reason: 'TIMESTAMP_TOO_OLD' };
    }

    // 2. Replay detection — check if this delivery ID has been seen before
    const existing = await this.logRepo.findOne({
      where: { deliveryId: ctx.deliveryId, status: 'accepted' },
    });

    if (existing) {
      this.logger.warn(
        `Webhook rejected — replay detected for deliveryId=${ctx.deliveryId}`,
      );
      await this.log(ctx, 'rejected', 'REPLAY_DETECTED');
      return { valid: false, reason: 'REPLAY_DETECTED' };
    }

    // 3. HMAC signature verification
    const signatureValid = verifyWebhookSignature(
      ctx.secret,
      ctx.timestamp,
      ctx.rawBody,
      ctx.signature,
    );

    if (!signatureValid) {
      this.logger.warn(
        `Webhook rejected — invalid signature for deliveryId=${ctx.deliveryId} ip=${ctx.ipAddress}`,
      );
      await this.log(ctx, 'rejected', 'INVALID_SIGNATURE');
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    // All checks passed — log acceptance
    await this.log(ctx, 'accepted', null);
    return { valid: true };
  }

  private async log(
    ctx: VerificationContext,
    status: 'accepted' | 'rejected',
    reason: WebhookRejectionReason,
  ): Promise<void> {
    try {
      await this.logRepo.save(
        this.logRepo.create({
          deliveryId: ctx.deliveryId,
          ipAddress: ctx.ipAddress,
          eventName: ctx.eventName,
          status,
          rejectionReason: reason,
          receivedSignature: ctx.signature,
          timestamp: ctx.timestamp,
        }),
      );
    } catch (err) {
      this.logger.error('Failed to persist webhook inbound log', err);
    }
  }

  async getInboundLogs(
    page = 1,
    limit = 20,
    status?: 'accepted' | 'rejected',
  ): Promise<{ data: WebhookInboundLogEntity[]; total: number }> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC');

    if (status) {
      qb.where('log.status = :status', { status });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }
}
