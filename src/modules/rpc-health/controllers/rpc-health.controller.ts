import { Controller, Get, Query } from '@nestjs/common';
import { RpcHealthService } from '../services/rpc-health.service';
import { RpcHealthLogEntity } from '../entities/rpc-health-log.entity';

@Controller('admin/rpc-health')
export class RpcHealthController {
  constructor(private readonly rpcHealthService: RpcHealthService) {}

  @Get()
  async getHealthLogs(
    @Query('limit') limit?: number,
  ): Promise<RpcHealthLogEntity[]> {
    return this.rpcHealthService.getHealthLogs(limit || 100);
  }
}
