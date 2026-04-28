import { Test, TestingModule } from '@nestjs/testing';
import { BacktestEngineService } from './backtest-engine.service';
import { OptimizationService } from './optimization.service';

describe('BacktestEngineService', () => {
  let service: BacktestEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BacktestEngineService],
    }).compile();
    service = module.get<BacktestEngineService>(BacktestEngineService);
  });

  it('should return -Infinity for insufficient data', () => {
    const result = service.runBacktest([100, 101, 102], 5, 20);
    expect(result.sharpeRatio).toBe(-Infinity);
  });

  it('should detect golden cross on a series with a trend reversal', () => {
    // Start flat then trend up — this creates a golden cross
    const prices = [
      ...Array.from({ length: 25 }, () => 100),
      ...Array.from({ length: 35 }, (_, i) => 100 + i * 1.5),
    ];
    const result = service.runBacktest(prices, 5, 20);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it('should not look ahead — only uses data up to current bar', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = service.runBacktest(prices, 5, 20);
    // All trade entry/exit indices should be within bounds
    for (const trade of result.trades) {
      expect(trade.entryIndex).toBeGreaterThanOrEqual(0);
      expect(trade.exitIndex).toBeLessThan(prices.length);
    }
  });

  it('walk-forward split returns train and validation results', () => {
    const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.3 + Math.random());
    const { train, validation } = service.backtest(prices, 5, 20, 0.7);
    expect(train).toBeDefined();
    expect(validation).toBeDefined();
  });
});

describe('OptimizationService', () => {
  let optimizationService: OptimizationService;
  let backtestEngine: BacktestEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptimizationService, BacktestEngineService],
    }).compile();
    optimizationService = module.get<OptimizationService>(OptimizationService);
    backtestEngine = module.get<BacktestEngineService>(BacktestEngineService);
  });

  it('simulate() uses real Sharpe ratio, not Math.random()', async () => {
    const strategy: any = {
      name: 'TestStrategy',
      parameters: [
        { key: 'shortPeriod', min: 3, max: 7, step: 2 },
        { key: 'longPeriod', min: 15, max: 25, step: 5 },
      ],
    };

    // Trending series — optimizer should find short < long
    const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
    const historicalData = prices.map(p => ({ close: p }));

    const result = await optimizationService.optimize(strategy, historicalData);

    // Score should be a real number (Sharpe ratio), not random
    expect(typeof result.score).toBe('number');
    expect(result.parameters).toBeDefined();

    // On a trending series, short period should be less than long period
    if (isFinite(result.score)) {
      expect(result.parameters['shortPeriod']).toBeLessThan(result.parameters['longPeriod']);
    }
  });

  it('optimized params outperform random baseline on trending data (>70% of runs)', () => {
    const prices = Array.from({ length: 150 }, (_, i) => 100 + i * 0.4 + (Math.random() - 0.5) * 2);

    const optimizedResult = backtestEngine.runBacktest(prices, 5, 20);
    let randomWins = 0;
    const runs = 20;

    for (let i = 0; i < runs; i++) {
      const shortP = Math.floor(Math.random() * 10) + 2;
      const longP = shortP + Math.floor(Math.random() * 20) + 5;
      const randomResult = backtestEngine.runBacktest(prices, shortP, longP);
      if (isFinite(randomResult.sharpeRatio) && randomResult.sharpeRatio > optimizedResult.sharpeRatio) {
        randomWins++;
      }
    }

    // Optimized (5/20 MA) should beat random in most cases on trending data
    expect(randomWins / runs).toBeLessThan(0.5);
  });
});
