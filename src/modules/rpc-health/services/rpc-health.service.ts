import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { RpcHealthLogEntity } from '../entities/rpc-health-log.entity';

@Injectable()
export class RpcHealthService {
  private readonly logger = new Logger(RpcHealthService.name);

  constructor(
    @InjectRepository(RpcHealthLogEntity)
    private readonly rpcHealthRepository: Repository<RpcHealthLogEntity>,
  ) {}

  async checkProviderHealth(
    network: string,
    url: string,
  ): Promise<{ status: 'up' | 'down' | 'degraded'; latencyMs: number }> {
    const start = Date.now();
    try {
      // Simple JSON-RPC call to check health (eth_blockNumber is standard for EVM)
      // We can make this more generic if needed, but this is a good default.
      await axios.post(
        url,
        {
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        },
        { timeout: 5000 },
      );
      const latencyMs = Date.now() - start;

      let status: 'up' | 'down' | 'degraded' = 'up';
      if (latencyMs > 1000) {
        status = 'degraded';
      }

      return { status, latencyMs };
    } catch (error) {
      this.logger.error(`Failed to check health for ${url}: ${error.message}`);
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  async logHealth(
    network: string,
    providerUrl: string,
    status: 'up' | 'down' | 'degraded',
    latencyMs: number,
  ): Promise<RpcHealthLogEntity> {
    const log = this.rpcHealthRepository.create({
      network,
      providerUrl,
      status,
      latencyMs,
    });
    return this.rpcHealthRepository.save(log);
  }

  async getHealthLogs(limit: number = 100): Promise<RpcHealthLogEntity[]> {
    return this.rpcHealthRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
