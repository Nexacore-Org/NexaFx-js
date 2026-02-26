import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcHealthController } from './controllers/rpc-health.controller';
import { RpcHealthService } from './services/rpc-health.service';
import { RpcHealthWorker } from './workers/rpc-health.worker';
import { RpcHealthLogEntity } from './entities/rpc-health-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RpcHealthLogEntity])],
  controllers: [RpcHealthController],
  providers: [RpcHealthService, RpcHealthWorker],
  exports: [RpcHealthService],
})
export class RpcHealthModule {}
