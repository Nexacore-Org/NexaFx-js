import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArchivalService } from './archival.service';
import { ArchivalJob } from './archival.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ArchivalService, ArchivalJob],
  exports: [ArchivalService],
})
export class ArchivalModule {}
