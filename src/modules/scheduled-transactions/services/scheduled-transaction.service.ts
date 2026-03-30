import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ScheduledTransactionEntity,
  ScheduleFrequency,
} from '../entities/scheduled-transaction.entity';
import {
  CreateScheduledTransactionDto,
  UpdateScheduledTransactionDto,
} from '../dto/scheduled-transaction.dto';

@Injectable()
export class ScheduledTransactionService {
  constructor(
    @InjectRepository(ScheduledTransactionEntity)
    private readonly repo: Repository<ScheduledTransactionEntity>,
  ) {}

  async create(userId: string, dto: CreateScheduledTransactionDto): Promise<ScheduledTransactionEntity> {
    return this.repo.save(
      this.repo.create({
        userId,
        amount: dto.amount,
        currency: dto.currency,
        targetCurrency: dto.targetCurrency,
        description: dto.description,
        frequency: dto.frequency,
        status: 'ACTIVE',
        nextRunAt: this.calcNextRun(new Date(), dto.frequency),
        executionHistory: [],
      }),
    );
  }

  async findAll(userId: string): Promise<ScheduledTransactionEntity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, userId: string): Promise<ScheduledTransactionEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Scheduled transaction ${id} not found`);
    if (entity.userId !== userId) throw new ForbiddenException();
    return entity;
  }

  async update(id: string, userId: string, dto: UpdateScheduledTransactionDto): Promise<ScheduledTransactionEntity> {
    const entity = await this.findOne(id, userId);
    if (dto.amount !== undefined) entity.amount = dto.amount;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.frequency !== undefined) {
      entity.frequency = dto.frequency;
      entity.nextRunAt = this.calcNextRun(new Date(), dto.frequency);
    }
    return this.repo.save(entity);
  }

  async pause(id: string, userId: string): Promise<ScheduledTransactionEntity> {
    const entity = await this.findOne(id, userId);
    entity.status = 'PAUSED';
    return this.repo.save(entity);
  }

  async resume(id: string, userId: string): Promise<ScheduledTransactionEntity> {
    const entity = await this.findOne(id, userId);
    entity.status = 'ACTIVE';
    entity.nextRunAt = this.calcNextRun(new Date(), entity.frequency);
    return this.repo.save(entity);
  }

  async remove(id: string, userId: string): Promise<void> {
    const entity = await this.findOne(id, userId);
    entity.status = 'CANCELLED';
    await this.repo.save(entity);
  }

  async findAllAdmin(): Promise<ScheduledTransactionEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  calcNextRun(from: Date, frequency: ScheduleFrequency): Date {
    const next = new Date(from);
    if (frequency === 'DAILY') next.setDate(next.getDate() + 1);
    else if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    return next;
  }
}
