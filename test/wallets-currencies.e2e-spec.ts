import { ValidationPipe } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { CurrenciesController } from '../src/currencies/currencies.controller';
import { CurrenciesService } from '../src/currencies/currencies.service';
import { WalletBalanceEntity } from '../src/wallet/wallet-balance.entity';
import { WalletsController } from '../src/wallet/wallets.controller';
import { WalletsService } from '../src/wallet/wallets.service';

@Module({
  imports: [
    CacheModule.register(),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      entities: [WalletBalanceEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([WalletBalanceEntity]),
  ],
  controllers: [WalletsController, CurrenciesController],
  providers: [
    WalletsService,
    CurrenciesService,
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => {
          if (key === 'currencies.supported') {
            return ['USD', 'EUR', 'GBP', 'NGN'];
          }
          return undefined;
        },
      },
    },
  ],
})
class WalletsCurrenciesTestModule {}

describe('Wallets and Currencies integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WalletsCurrenciesTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('lists supported currencies at GET /api/v1/currencies with display fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/currencies')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'USD',
          symbol: '$',
          displayName: 'US Dollar',
          decimalPlaces: 2,
          flagEmoji: '🇺🇸',
          type: 'fiat',
        }),
        expect.objectContaining({
          code: 'EUR',
          symbol: '€',
          displayName: 'Euro',
          decimalPlaces: 2,
          flagEmoji: '🇪🇺',
          type: 'fiat',
        }),
      ]),
    );
  });

  it('adjusts balances through the DTO endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/wallets/adjust-balance')
      .send({
        accountId: '8aa9d1ce-fd61-4a44-a564-cd6bc83fc403',
        currency: 'USD',
        delta: 25,
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        accountId: '8aa9d1ce-fd61-4a44-a564-cd6bc83fc403',
        currency: 'USD',
        balance: 25,
      }),
    );
  });

  it('rejects unsupported currencies', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallets/adjust-balance')
      .send({
        accountId: '8aa9d1ce-fd61-4a44-a564-cd6bc83fc403',
        currency: 'BTC',
        delta: 10,
      })
      .expect(400);
  });
});
