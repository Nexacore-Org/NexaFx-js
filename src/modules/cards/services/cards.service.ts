import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { VirtualCard, CardStatus } from '../entities/virtual-card.entity';
import { CardNumberService } from './card-number.service';

@Injectable()
export class CardService {
  private readonly encryptionKey = process.env.CARD_ENCRYPTION_KEY; // 32 bytes

  constructor(
    @InjectRepository(VirtualCard)
    private cardRepo: Repository<VirtualCard>,
    private cardNumberService: CardNumberService,
  ) {}

  async createCard(userId: string, walletId: string, limits: { tx: number, monthly: number }) {
    const rawPan = this.cardNumberService.generateLuhnValidNumber();
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    
    const card = this.cardRepo.create({
      userId,
      walletId,
      maskedPan: `**** **** **** ${rawPan.slice(-4)}`,
      encryptedPan: this.encrypt(rawPan),
      hashedCvv: crypto.createHash('sha256').update(cvv).digest('hex'),
      expiryDate: '12/29',
      perTransactionLimit: limits.tx,
      monthlySpendLimit: limits.monthly,
    });

    return this.cardRepo.save(card);
  }

  async freezeCard(id: string, userId: string) {
    const card = await this.cardRepo.findOne({ where: { id, userId } });
    if (!card) throw new NotFoundException();
    if (card.status === CardStatus.CANCELLED) throw new BadRequestException('Cannot freeze cancelled card');
    
    card.status = CardStatus.FROZEN;
    return this.cardRepo.save(card);
  }

  async processTransaction(id: string, amount: number) {
    const card = await this.cardRepo.findOne({ where: { id } });
    if (!card || card.status !== CardStatus.ACTIVE) {
      throw new ForbiddenException('Card is not active');
    }

    // Spend Control Enforcement
    if (amount > card.perTransactionLimit) {
      throw new ForbiddenException('Transaction exceeds per-transaction limit');
    }
    if (Number(card.currentMonthSpend) + amount > card.monthlySpendLimit) {
      throw new ForbiddenException('Transaction exceeds monthly spend limit');
    }

    card.currentMonthSpend = Number(card.currentMonthSpend) + amount;
    await this.cardRepo.save(card);
    
    // Logic to trigger wallet debit goes here...
    return { success: true, newBalance: card.currentMonthSpend };
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }
}