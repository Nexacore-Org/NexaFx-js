import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FxRateResult } from './providerA.service';

@Injectable()
export class ProviderBService {
  private readonly logger = new Logger(ProviderBService.name);
  readonly name = 'providerB';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchRates(base: string): Promise<FxRateResult> {
    const url = this.configService.get<string>('PROVIDER_B_URL');
    const apiKey = this.configService.get<string>('PROVIDER_B_API_KEY');

    this.logger.debug(`Fetching rates from Provider B: ${url}`);

    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: { app_id: apiKey, base },
        timeout: 5000,
      }),
    );

    const data = response.data;

    // Normalize: openexchangerates returns { base, rates: { EUR: 0.9 }, timestamp: unix }
    const rates: Record<string, number> = data.rates ?? {};

    return {
      provider: this.name,
      base: (data.base ?? base).toUpperCase(),
      rates,
      timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
    };
  }
}
