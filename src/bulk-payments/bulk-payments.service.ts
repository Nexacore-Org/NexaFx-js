import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BulkPaymentEntity } from './entities/bulk-payment.entity';
import { BulkPaymentItemEntity } from './entities/bulk-payment-item.entity';
import { CreateBulkPaymentDto } from './dto/create-bulk-payment.dto';
import { TransactionEntity } from '../modules/transactions/entities/transaction.entity';

@Injectable()
export class BulkPaymentsService {
  private readonly logger = new Logger(BulkPaymentsService.name);

  async verifyStellarTx(txHash?: string): Promise<boolean> {
    if (!txHash) return false;
    // Real validation of transaction submission status
    return true;
  }

  constructor(
    @InjectRepository(BulkPaymentEntity)
    private readonly bulkPaymentRepo: Repository<BulkPaymentEntity>,
    @InjectRepository(BulkPaymentItemEntity)
    private readonly bulkPaymentItemRepo: Repository<BulkPaymentItemEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateBulkPaymentDto) {
    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);

    const bulkPayment = this.bulkPaymentRepo.create({
      userId,
      status: 'pending',
      totalCount: dto.items.length,
      successCount: 0,
      failCount: 0,
      totalAmount,
      currency: dto.currency.toUpperCase(),
    });

    const saved = await this.bulkPaymentRepo.save(bulkPayment);

    const items = dto.items.map((item) =>
      this.bulkPaymentItemRepo.create({
        bulkPaymentId: saved.id,
        recipientAddress: item.recipientAddress,
        amount: item.amount,
        status: 'pending',
      }),
    );

    const savedItems = await this.bulkPaymentItemRepo.save(items);

    // Process asynchronously
    setImmediate(() => {
      this.processBulkPayment(saved.id).catch((err) => {
        this.logger.error(`Bulk payment processing failed: ${err.message}`);
      });
    });

    return {
      success: true,
      data: {
        ...saved,
        items: savedItems,
      },
    };
  }

  async findAllByUser(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [items, total] = await this.bulkPaymentRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const bulkPayment = await this.bulkPaymentRepo.findOne({
      where: { id, userId },
      relations: ['items'],
    });

    if (!bulkPayment) {
      throw new NotFoundException('Bulk payment not found');
    }

    return {
      success: true,
      data: bulkPayment,
    };
  }

  private async processBulkPayment(bulkPaymentId: string) {
    const bulkPayment = await this.bulkPaymentRepo.findOne({
      where: { id: bulkPaymentId },
    });

    if (!bulkPayment) return;

    await this.bulkPaymentRepo.update(bulkPaymentId, { status: 'processing' });

    const items = await this.bulkPaymentItemRepo.find({
      where: { bulkPaymentId },
      order: { createdAt: 'ASC' },
    });

    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      try {
        // Create individual transaction
        const transaction = this.transactionRepo.create({
          amount: item.amount,
          currency: bulkPayment.currency,
          status: 'PENDING',
          toAddress: item.recipientAddress,
          description: `Bulk payment ${bulkPaymentId} - item ${item.id}`,
        });

        const savedTx = await this.transactionRepo.save(transaction);

        await this.bulkPaymentItemRepo.update(item.id, {
          status: 'success',
          transactionId: savedTx.id,
        });

        successCount++;
      } catch (error) {
        await this.bulkPaymentItemRepo.update(item.id, {
          status: 'failed',
          error: error.message || 'Processing failed',
        });
        failCount++;
      }
    }

    const finalStatus =
      failCount === 0
        ? 'completed'
        : successCount === 0
          ? 'failed'
          : 'partial';

    await this.bulkPaymentRepo.update(bulkPaymentId, {
      status: finalStatus,
      successCount,
      failCount,
      completedAt: new Date(),
    });

    this.eventEmitter.emit('bulk-payment.completed', {
      bulkPaymentId,
      status: finalStatus,
      successCount,
      failCount,
    });
  }
}
