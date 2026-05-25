/**
 * SLA Benchmarks — #465
 * Validates p99 latency thresholds for critical endpoints under load.
 * Run with: k6 run test/performance/sla-benchmarks.js
 *
 * SLA thresholds (configurable via env):
 *   TRANSACTION_P99_MS   = 200
 *   BALANCE_P99_MS       = 50
 *   FX_RATE_P99_MS       = 100
 *   FX_CONVERT_P99_MS    = 300
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

const THRESHOLDS = {
  transaction_p99: parseInt(__ENV.TRANSACTION_P99_MS || '200'),
  balance_p99: parseInt(__ENV.BALANCE_P99_MS || '50'),
  fx_rate_p99: parseInt(__ENV.FX_RATE_P99_MS || '100'),
  fx_convert_p99: parseInt(__ENV.FX_CONVERT_P99_MS || '300'),
};

const transactionDuration = new Trend('transaction_creation_duration');
const balanceDuration = new Trend('balance_query_duration');
const fxRateDuration = new Trend('fx_rate_duration');
const fxConvertDuration = new Trend('fx_convert_duration');
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    transaction_creation: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'testTransactionCreation',
    },
    balance_query: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'testBalanceQuery',
      startTime: '35s',
    },
    fx_rate: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'testFxRate',
      startTime: '70s',
    },
  },
  thresholds: {
    transaction_creation_duration: [`p(99)<${THRESHOLDS.transaction_p99}`],
    balance_query_duration: [`p(99)<${THRESHOLDS.balance_p99}`],
    fx_rate_duration: [`p(99)<${THRESHOLDS.fx_rate_p99}`],
    error_rate: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

export function testTransactionCreation() {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/transactions`,
    JSON.stringify({ amount: 1, currency: 'USD', description: 'benchmark' }),
    { headers, tags: { name: 'transaction_creation' } },
  );
  transactionDuration.add(Date.now() - start);
  errorRate.add(res.status >= 500);
  check(res, { 'transaction status not 5xx': (r) => r.status < 500 });
  sleep(0.1);
}

export function testBalanceQuery() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/wallets/portfolio`, {
    headers,
    tags: { name: 'balance_query' },
  });
  balanceDuration.add(Date.now() - start);
  errorRate.add(res.status >= 500);
  check(res, { 'balance status not 5xx': (r) => r.status < 500 });
  sleep(0.05);
}

export function testFxRate() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/fx/convert/quote?fromCurrency=USD&toCurrency=EUR&fromAmount=100`, {
    headers,
    tags: { name: 'fx_rate' },
  });
  fxRateDuration.add(Date.now() - start);
  errorRate.add(res.status >= 500);
  check(res, { 'fx rate status not 5xx': (r) => r.status < 500 });
  sleep(0.1);
}

export function handleSummary(data) {
  return {
    'test/performance/results.json': JSON.stringify(data, null, 2),
    stdout: JSON.stringify({
      thresholds: THRESHOLDS,
      results: {
        transaction_p99: data.metrics?.transaction_creation_duration?.values?.['p(99)'],
        balance_p99: data.metrics?.balance_query_duration?.values?.['p(99)'],
        fx_rate_p99: data.metrics?.fx_rate_duration?.values?.['p(99)'],
      },
    }, null, 2),
  };
}
