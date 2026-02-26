import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DataArchiveService } from './services/data-archive.service';
import { DataArchiveWorker } from './workers/data-archive.worker';
import { DataArchiveAdminController } from './controllers/data-archive-admin.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [DataArchiveService, DataArchiveWorker],
  controllers: [DataArchiveAdminController],
  exports: [DataArchiveService],
})
export class DataArchiveModule {}
