import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { IdempotencyKey } from './idempotency.entity';
import * as crypto from 'crypto';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private idempotencyRepo: Repository<IdempotencyKey>,
    private readonly configService: ConfigService,
  ) {}

  hashRequest(method: string, url: string, body: any): string {
    const content = JSON.stringify({ method, url, body });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async findByKey(key: string): Promise<IdempotencyKey | null> {
    return this.idempotencyRepo.findOne({ where: { key } });
  }

  async store(
    key: string,
    requestHash: string,
    response: any,
    statusCode: number,
    ttlHours?: number,
  ): Promise<void> {
    const hours =
      ttlHours ?? this.configService.get<number>('idempotency.ttlHours', 24);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    await this.idempotencyRepo.save({
      key,
      requestHash,
      response,
      statusCode,
      expiresAt,
    });
  }

  async cleanup(): Promise<number> {
    const result = await this.idempotencyRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}
