import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FxRateResult } from './providerA.service';

@Injectable()
export class ProviderCService {
  private readonly logger = new Logger(ProviderCService.name);
  readonly name = 'providerC';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchRates(base: string): Promise<FxRateResult> {
    const url = this.configService.get<string>('PROVIDER_C_URL');
    const apiKey = this.configService.get<string>('PROVIDER_C_API_KEY');

    this.logger.debug(`Fetching rates from Provider C: ${url}`);

    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: { base, access_key: apiKey },
        timeout: 5000,
      }),
    );

    const data = response.data;

    // Normalize: fixer.io returns { base, rates: { USD: 1.08, ... }, timestamp: unix }
    const rates: Record<string, number> = data.rates ?? {};

    return {
      provider: this.name,
      base: (data.base ?? base).toUpperCase(),
      rates,
      timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
    };
  }
}
