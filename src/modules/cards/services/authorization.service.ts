import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { VirtualCard, CardStatus } from '../entities/virtual-card.entity';
import {
  CardAuthorization,
  AuthorizationStatus,
  DeclineReason,
} from '../entities/card-authorization.entity';
import { ThreeDsService } from './three-ds.service';

export interface AuthorizationRequest {
  cardId: string;
  amount: number;
  currency: string;
  merchantName?: string;
  networkRequestId: string;
  hmacSignature: string;
  hmacPayload: string;
}

export interface AuthorizationResponse {
  status: AuthorizationStatus;
  declineReason?: DeclineReason;
  threeDsRedirectUrl?: string;
  authorizationId: string;
}

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);
  private readonly hmacSecret = process.env.CARD_NETWORK_HMAC_SECRET ?? 'change-me';

  constructor(
    @InjectRepository(VirtualCard)
    private readonly cardRepo: Repository<VirtualCard>,
    @InjectRepository(CardAuthorization)
    private readonly authRepo: Repository<CardAuthorization>,
    private readonly threeDsService: ThreeDsService,
  ) {}

  async authorize(req: AuthorizationRequest): Promise<AuthorizationResponse> {
    this.verifyHmac(req.hmacPayload, req.hmacSignature);

    const card = await this.cardRepo.findOne({ where: { id: req.cardId } });

    let status: AuthorizationStatus;
    let declineReason: DeclineReason | null = null;
    let threeDsRedirectUrl: string | null = null;

    if (!card) {
      status = AuthorizationStatus.DECLINED;
      declineReason = DeclineReason.SUSPECTED_FRAUD;
    } else if (card.status === CardStatus.FROZEN || card.status === CardStatus.CANCELLED) {
      status = AuthorizationStatus.DECLINED;
      declineReason = DeclineReason.FROZEN_CARD;
    } else if (req.amount > Number(card.perTransactionLimit)) {
      status = AuthorizationStatus.DECLINED;
      declineReason = DeclineReason.LIMIT_EXCEEDED;
    } else if (Number(card.currentMonthSpend) + req.amount > Number(card.monthlySpendLimit)) {
      status = AuthorizationStatus.DECLINED;
      declineReason = DeclineReason.INSUFFICIENT_FUNDS;
    } else if (this.threeDsService.requiresChallenge(req.amount)) {
      status = AuthorizationStatus.CHALLENGE_REQUIRED;
      threeDsRedirectUrl = this.threeDsService.generateRedirectUrl(req.cardId, req.networkRequestId);
    } else {
      status = AuthorizationStatus.APPROVED;
      // Update spend
      card.currentMonthSpend = Number(card.currentMonthSpend) + req.amount;
      await this.cardRepo.save(card);
    }

    const record = await this.authRepo.save(
      this.authRepo.create({
        cardId: req.cardId,
        amount: req.amount,
        currency: req.currency,
        merchantName: req.merchantName,
        status,
        declineReason,
        threeDsRedirectUrl,
        networkRequestId: req.networkRequestId,
      }),
    );

    this.logger.log(`Authorization ${record.id}: ${status} for card ${req.cardId}`);
    return { status, declineReason: declineReason ?? undefined, threeDsRedirectUrl: threeDsRedirectUrl ?? undefined, authorizationId: record.id };
  }

  async getAuthorizationLog(cardId: string): Promise<CardAuthorization[]> {
    return this.authRepo.find({ where: { cardId }, order: { createdAt: 'DESC' } });
  }

  private verifyHmac(payload: string, signature: string): void {
    const expected = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(payload)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }
  }
}
