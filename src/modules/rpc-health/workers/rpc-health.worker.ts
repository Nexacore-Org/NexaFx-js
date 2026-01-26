import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RpcHealthService } from '../services/rpc-health.service';

@Injectable()
export class RpcHealthWorker {
    private readonly logger = new Logger(RpcHealthWorker.name);

    // Hardcoded list of providers for now. 
    // In a real app, this might come from a config or DB.
    private readonly providers = [
        { network: 'ethereum', url: 'https://cloudflare-eth.com' },
        { network: 'ethereum', url: 'https://rpc.ankr.com/eth' },
        { network: 'polygon', url: 'https://polygon-rpc.com' },
    ];

    constructor(private readonly rpcHealthService: RpcHealthService) { }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async monitorRpcProviders() {
        this.logger.log('Starting RPC provider health check...');

        for (const provider of this.providers) {
            try {
                const { status, latencyMs } = await this.rpcHealthService.checkProviderHealth(
                    provider.network,
                    provider.url,
                );

                await this.rpcHealthService.logHealth(
                    provider.network,
                    provider.url,
                    status,
                    latencyMs,
                );

                this.logger.log(
                    `Checked ${provider.network} (${provider.url}): ${status} (${latencyMs}ms)`,
                );
            } catch (error) {
                this.logger.error(
                    `Error checking ${provider.network} (${provider.url})`,
                    error,
                );
            }
        }
    }
}
