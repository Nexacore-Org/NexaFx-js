import { Module } from '@nestjs/common';
import { TracingShutdownService } from './tracing-shutdown.service';

@Module({
  providers: [TracingShutdownService],
})
export class ObservabilityModule {}
