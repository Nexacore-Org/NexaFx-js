import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentLink } from '../entities/payment-link.entity';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function generateBase62(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62[Math.floor(Math.random() * BASE62.length)];
  }
  return result;
}

@Injectable()
export class PaymentLinkService {
  constructor(
    @InjectRepository(PaymentLink)
    private readonly repo: Repository<PaymentLink>,
    private readonly config: ConfigService,
  ) {}

  async createPaymentLink(
    userId: string,
    dto: { amount?: number; currency?: string; description?: string; maxUses?: number; expiresAt?: Date },
  ) {
    const code = await this.generateUniqueCode();
    const link = this.repo.create({
      code,
      ownerId: userId,
      amount: dto.amount != null ? String(dto.amount) : null,
      currency: dto.currency ?? 'USD',
      description: dto.description,
      maxUses: dto.maxUses ?? null,
      expiresAt: dto.expiresAt ?? null,
    });
    await this.repo.save(link);
    const baseUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://nexafx.io';
    return { id: link.id, code, url: `${baseUrl}/pay/${code}` };
  }

  async getStatus(code: string) {
    const link = await this.repo.findOne({ where: { code } });
    if (!link || !link.isActive) throw new NotFoundException('Payment link not found');

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new GoneException('Payment link has expired');
    }
    if (link.maxUses != null && link.useCount >= link.maxUses) {
      throw new ConflictException('Payment link has reached its maximum uses');
    }

    // Increment view count (fire-and-forget)
    this.repo.increment({ code }, 'viewCount', 1).catch(() => {});

    return {
      code: link.code,
      amount: link.amount,
      currency: link.currency,
      description: link.description,
      expiresAt: link.expiresAt,
      usesRemaining: link.maxUses != null ? link.maxUses - link.useCount : null,
    };
  }

  async pay(code: string, payerId: string) {
    const link = await this.repo.findOne({ where: { code } });
    if (!link || !link.isActive) throw new NotFoundException('Payment link not found');

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new GoneException('Payment link has expired');
    }
    if (link.maxUses != null && link.useCount >= link.maxUses) {
      throw new ConflictException('Payment link has reached its maximum uses');
    }
    if (link.ownerId === payerId) {
      throw new ConflictException('Cannot pay your own payment link');
    }

    await this.repo.increment({ code }, 'useCount', 1);

    // TODO: trigger P2P transfer from payerId to link.ownerId
    // TODO: emit notification to link owner

    return { success: true, message: 'Payment processed', linkId: link.id };
  }

  async getAnalytics(linkId: string, userId: string) {
    const link = await this.repo.findOne({ where: { id: linkId, ownerId: userId } });
    if (!link) throw new NotFoundException('Payment link not found');

    return {
      views: link.viewCount,
      payments: link.useCount,
      totalCollected: link.amount != null ? parseFloat(link.amount) * link.useCount : null,
      currency: link.currency,
    };
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateBase62(8);
      const existing = await this.repo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique payment link code');
  }
}
