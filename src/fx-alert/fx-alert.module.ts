import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { FxAlert } from './entities/fx-alert.entity';
import { FxAlertService } from './services/fx-alert.service';
import { FxAlertController, FxAlertAdminController } from './controllers/fx-alert.controller';
import { RateAlertListener, AlertTriggeredListener } from './listeners/rate-alert.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([FxAlert]),
    // EventEmitterModule and ScheduleModule are expected to be registered
    // once in AppModule; importing them here is harmless (NestJS deduplicates).
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    ScheduleModule.forRoot(),
  ],
  controllers: [FxAlertController, FxAlertAdminController],
  providers: [FxAlertService, RateAlertListener, AlertTriggeredListener],
  exports: [FxAlertService],
})
export class FxAlertModule {}
