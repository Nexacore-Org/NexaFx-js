import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarginCall, MarginCallStatus } from '../entities/margin-call.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  constructor(
    @InjectRepository(MarginCall)
    private marginCallRepo: Repository<MarginCall>,
    private eventEmitter: EventEmitter2,
  ) {}

  async calculateMarginUtilization(userId: string): Promise<number> {
    // Logic to fetch total equity vs used margin from positions/wallet
    // Placeholder: returning a simulated value for logic flow
    return 85.00; 
  }

  async evaluateRiskLevel(userId: string, utilization: number) {
    if (utilization > 95) {
      await this.triggerMarginCall(userId, utilization);
    } else if (utilization > 80) {
      this.eventEmitter.emit('notification.margin_warning', { userId, utilization });
    }
  }

  private async triggerMarginCall(userId: string, utilization: number) {
    const existing = await this.marginCallRepo.findOne({ 
      where: { userId, status: MarginCallStatus.PENDING } 
    });

    if (!existing) {
      const marginCall = this.marginCallRepo.create({
        userId,
        utilizationAtCreation: utilization,
        status: MarginCallStatus.NOTIFIED,
      });
      await this.marginCallRepo.save(marginCall);
      this.eventEmitter.emit('notification.margin_call', { userId, utilization });
      this.logger.warn(`Margin Call triggered for user ${userId} at ${utilization}%`);
    }
  }
}