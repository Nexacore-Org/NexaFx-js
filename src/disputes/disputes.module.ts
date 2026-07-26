import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DisputeEntity } from './entities/dispute.entity';
import { DisputeMessageEntity } from './entities/dispute-message.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisputeEntity, DisputeMessageEntity]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
