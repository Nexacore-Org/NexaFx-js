import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface FxRateResult {
  provider: string;
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

@Injectable()
export class ProviderAService {
  private readonly logger = new Logger(ProviderAService.name);
  readonly name = 'providerA';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchRates(base: string): Promise<FxRateResult> {
    const url = this.configService.get<string>('PROVIDER_A_URL');
    const apiKey = this.configService.get<string>('PROVIDER_A_API_KEY');

    this.logger.debug(`Fetching rates from Provider A: ${url}`);

    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: { base, access_key: apiKey },
        timeout: 5000,
      }),
    );

    const data = response.data;

    // Normalize: exchangerate.host returns { rates: { EUR: 0.9, ... } }
    const rates: Record<string, number> = data.rates ?? {};

    return {
      provider: this.name,
      base: (data.base ?? base).toUpperCase(),
      rates,
      timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
    };
  }
}
