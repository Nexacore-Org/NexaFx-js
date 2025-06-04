import { Module } from '@nestjs/common';
import { SecurityHealthController } from './security-health.controller';
import { SecurityHealthService } from './security-health.service';

@Module({
  controllers: [SecurityHealthController],
  providers: [SecurityHealthService],
})
export class SecurityHealthModule {}
