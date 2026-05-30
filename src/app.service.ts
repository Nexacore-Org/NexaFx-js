import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { Queue } from 'bull';

@Injectable()
export class AppService implements OnApplicationShutdown {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @InjectQueue('default') private readonly defaultQueue?: Queue,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Shutdown started by ${signal ?? 'unknown signal'}`);
    const drainPromise = (async () => {
      if (this.defaultQueue) {
        await this.defaultQueue.pause(true);
        await this.defaultQueue.close();
        this.logger.log('Bull default queue drained and closed');
      }
      if (this.dataSource?.isInitialized) {
        await this.dataSource.destroy();
        this.logger.log('Database connection closed');
      }
    })();

    await Promise.race([
      drainPromise,
      new Promise((resolve) => setTimeout(resolve, 30000)),
    ]);
    this.logger.log('Shutdown completed');
  }
}
