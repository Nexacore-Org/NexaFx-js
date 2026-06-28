import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanaryController } from './canary.controller';
import { CanaryService } from './canary.service';
import { CanaryToken } from './entities/canary-token.entity';
import { AbuseEvent } from './entities/abuse-event.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CanaryToken, AbuseEvent])],
  controllers: [CanaryController],
  providers: [CanaryService],
  exports: [CanaryService],
})
export class CanaryModule {}