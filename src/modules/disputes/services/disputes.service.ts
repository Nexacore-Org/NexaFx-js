import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeEntity } from '../entities/dispute.entity';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(DisputeEntity)
    private readonly disputeRepository: Repository<DisputeEntity>,
  ) {}

  async createEscrowDispute(input: {
    escrowId: string;
    initiatorUserId: string;
    counterpartyUserId?: string | null;
    reason: string;
    metadata?: Record<string, any>;
  }): Promise<DisputeEntity> {
    const existingOpenDispute = await this.disputeRepository.findOne({
      where: {
        subjectType: 'ESCROW',
        subjectId: input.escrowId,
        status: 'OPEN',
      },
    });

    if (existingOpenDispute) {
      throw new ConflictException('An open dispute already exists for this escrow');
    }

    const dispute = this.disputeRepository.create({
      subjectType: 'ESCROW',
      subjectId: input.escrowId,
      initiatorUserId: input.initiatorUserId,
      counterpartyUserId: input.counterpartyUserId ?? null,
      status: 'OPEN',
      reason: input.reason,
      metadata: input.metadata ?? null,
    });

    return this.disputeRepository.save(dispute);
  }
}
