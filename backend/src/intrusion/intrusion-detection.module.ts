import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { IntrusionDetectionService } from './intrusion-detection.service';
import { IntrusionDetectionController } from './intrusion-detection.controller';
import { IntrusionDetectionGuard } from './intrusion-detection.guard';
import { SuspiciousActivity } from './suspicious-activity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuspiciousActivity]),
    ScheduleModule.forRoot(),
  ],
  providers: [IntrusionDetectionService, IntrusionDetectionGuard],
  controllers: [IntrusionDetectionController],
  exports: [IntrusionDetectionService, IntrusionDetectionGuard],
})
export class IntrusionDetectionModule {}