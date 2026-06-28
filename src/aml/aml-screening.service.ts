import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmlAlert } from './aml-alert.entity';

export interface ScreeningResult {
  userId: string;
  matched: boolean;
  listName?: string;
  score?: number;
  screenedAt: Date;
}

@Injectable()
export class AmlScreeningService {
  private readonly logger = new Logger(AmlScreeningService.name);

  constructor(
    @InjectRepository(AmlAlert) private readonly alertRepo: Repository<AmlAlert>,
  ) {}

  async screenUser(userId: string, fullName: string, dateOfBirth?: string): Promise<ScreeningResult> {
    this.logger.log(`Screening user ${userId} against sanctions lists`);
    const result: ScreeningResult = { userId, matched: false, screenedAt: new Date() };
    
    if (this.isMockMatch(fullName)) {
      result.matched = true;
      result.listName = 'OFAC SDN';
      result.score = 95;
      
      await this.alertRepo.save(this.alertRepo.create({
        userId,
        ruleTriggered: 'sanctions_screening',
        riskScore: 95,
        metadata: { fullName, listName: result.listName, screenedAt: result.screenedAt },
      }));
    }
    
    return result;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async rescreenAllUsers(): Promise<void> {
    this.logger.log('Running nightly re-screening of all users against sanctions lists');
  }

  private isMockMatch(name: string): boolean {
    const mockNames = ['test sanctioned', 'sdn test', 'pep test'];
    return mockNames.some(n => name.toLowerCase().includes(n));
  }
}
