import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FeatureFlagEntity } from '../entities/feature-flag.entity';
import { CreateFeatureFlagDto } from '../dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from '../dto/update-feature-flag.dto';
import { FeatureFlagEvaluationService } from './feature-flag-evaluation.service';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlagEntity)
    private readonly repo: Repository<FeatureFlagEntity>,
    private readonly evaluationService: FeatureFlagEvaluationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  getAllFlags(): Promise<FeatureFlagEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  getFlagById(id: string): Promise<FeatureFlagEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  createFlag(dto: CreateFeatureFlagDto): Promise<FeatureFlagEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async updateFlag(id: string, dto: UpdateFeatureFlagDto): Promise<FeatureFlagEntity> {
    const flag = await this.repo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Feature flag ${id} not found`);
    Object.assign(flag, dto);
    const updated = await this.repo.save(flag);
    this.evaluationService.invalidateCacheForFlag(updated.name);
    this.eventEmitter.emit('flag.updated', { flagId: updated.id, flagName: updated.name });
    return updated;
  }

  async deleteFlag(id: string): Promise<void> {
    const flag = await this.repo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Feature flag ${id} not found`);
    this.evaluationService.invalidateCacheForFlag(flag.name);
    await this.repo.remove(flag);
  }
}
