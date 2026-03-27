import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SanctionsEntry } from '../entities/sanctions-entry.entity';
import { ComplianceCaseService } from '../../compliance-evidence/services/compliance-case.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SanctionsService {
  constructor(
    @InjectRepository(SanctionsEntry)
    private sanctionsRepo: Repository<SanctionsEntry>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private caseService: ComplianceCaseService,
    private eventEmitter: EventEmitter2,
  ) {}

  async isSanctioned(identifier: string): Promise<boolean> {
    const cacheKey = `sanctions:${identifier}`;
    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    // Check full address match or name substring match
    const match = await this.sanctionsRepo.createQueryBuilder('entry')
      .where('entry.target = :id', { id: identifier })
      .orWhere(':id ILIKE CONCAT(\'%\', entry.target, \'%\')', { id: identifier })
      .getOne();

    const isBlocked = !!match;
    await this.cacheManager.set(cacheKey, isBlocked, 300000); // 5min TTL
    return isBlocked;
  }

  async addToBlocklist(target: string, reason: string) {
    const entry = this.sanctionsRepo.create({ target, reason });
    await this.sanctionsRepo.save(entry);
    await this.cacheManager.del(`sanctions:${target}`); // Invalidate cache
    return entry;
  }

  async handleSanctionsMatch(identifier: string, context: string) {
    // 1. Auto-create Compliance Case
    await this.caseService.appendEvent('SYSTEM_AUTO', 'SANCTIONS_MATCH', { identifier, context });
    
    // 2. Emit WebSocket Event
    this.eventEmitter.emit('compliance.sanctionsMatch', {
      identifier,
      timestamp: new Date(),
      type: 'BLOCK_TRIGGERED'
    });

    throw new ForbiddenException({
      statusCode: 403,
      message: 'Transaction blocked',
      reason: 'SANCTIONS_MATCH'
    });
  }
}