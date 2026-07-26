import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ArchivalService } from './archival.service';

@Injectable()
export class ArchivalJob {
  private readonly logger = new Logger(ArchivalJob.name);

  constructor(
    private readonly archivalService: ArchivalService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 3 * * *', { name: 'archival' })
  async runArchival(): Promise<void> {
    const cron = this.config.get<string>('archive.cron');
    this.logger.log(`Running archival job (schedule: ${cron})`);
    try {
      await this.archivalService.archiveAll();
    } catch (err) {
      this.logger.error(`Archival job failed: ${(err as Error).message}`);
    }
  }
}
