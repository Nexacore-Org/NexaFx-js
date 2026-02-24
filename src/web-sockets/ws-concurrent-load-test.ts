/**
 * WebSocket Concurrent Connection Load Test
 *
 * Usage:
 *   JWT_SECRET=your-secret npx ts-node ws-concurrent-load-test.ts
 *
 * Requires: npm install -D socket.io-client @types/socket.io-client jsonwebtoken
 */

import { io, Socket } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';

const BASE_URL = process.env.WS_URL ?? 'http://localhost:3000';
const NAMESPACE = '/notifications';
const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '100', 10);
const DURATION_MS = parseInt(process.env.DURATION_MS ?? '30000', 10);

interface TestMetrics {
  connected: number;
  disconnected: number;
  errors: number;
  eventsReceived: number;
  latencies: number[];
  connectTimes: number[];
}

function generateToken(userId: string, roles: string[] = ['user']): string {
  return jwt.sign({ sub: userId, email: `${userId}@test.com`, roles }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function connectUser(userId: string, metrics: TestMetrics): Promise<Socket> {
  const token = generateToken(userId);
  const connectStart = Date.now();

  return new Promise((resolve, reject) => {
    const socket = io(`${BASE_URL}${NAMESPACE}`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      timeout: 5000,
    });

    socket.on('connect', () => {
      metrics.connected++;
      metrics.connectTimes.push(Date.now() - connectStart);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      metrics.errors++;
      reject(err);
    });

    socket.on('disconnect', () => {
      metrics.disconnected++;
    });

    socket.on('transaction.confirmed', () => metrics.eventsReceived++);
    socket.on('approval.granted', () => metrics.eventsReceived++);
    socket.on('fraud.alert', () => metrics.eventsReceived++);
    socket.on('connection.heartbeat', () => metrics.eventsReceived++);
    socket.on('connection.missed_events', () => metrics.eventsReceived++);
  });
}

async function runLoadTest(): Promise<void> {
  console.log(`\n🚀 WebSocket Load Test`);
  console.log(`   Target : ${BASE_URL}${NAMESPACE}`);
  console.log(`   Users  : ${CONCURRENCY}`);
  console.log(`   Duration: ${DURATION_MS / 1000}s\n`);

  const metrics: TestMetrics = {
    connected: 0,
    disconnected: 0,
    errors: 0,
    eventsReceived: 0,
    latencies: [],
    connectTimes: [],
  };

  const sockets: Socket[] = [];

  // Phase 1: ramp up connections
  console.log('📶 Phase 1: Connecting users...');
  const connectPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
    connectUser(`load-test-user-${i}`, metrics).catch((err) => {
      metrics.errors++;
      return null;
    }),
  );

  const results = await Promise.allSettled(connectPromises);
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) sockets.push(r.value);
  });

  console.log(`   ✅ Connected: ${metrics.connected}/${CONCURRENCY}`);
  console.log(`   ❌ Failed   : ${metrics.errors}`);

  // Phase 2: sustained activity
  console.log(`\n📡 Phase 2: Sustaining connections for ${DURATION_MS / 1000}s...`);
  const sustainStart = Date.now();

  const activityInterval = setInterval(() => {
    sockets.forEach((socket, i) => {
      if (socket.connected) {
        const pingStart = Date.now();
        socket.emit('ping', {}, () => {
          metrics.latencies.push(Date.now() - pingStart);
        });

        // Some users request missed events
        if (i % 10 === 0) {
          socket.emit('request_missed_events', {
            since: new Date(Date.now() - 3600_000).toISOString(),
            limit: 10,
          });
        }
      }
    });
  }, 2000);

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));
  clearInterval(activityInterval);

  // Phase 3: disconnect
  console.log('\n🔌 Phase 3: Disconnecting...');
  sockets.forEach((s) => s.disconnect());
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTS');
  console.log('='.repeat(50));
  console.log(`Connected          : ${metrics.connected}`);
  console.log(`Disconnected       : ${metrics.disconnected}`);
  console.log(`Errors             : ${metrics.errors}`);
  console.log(`Events received    : ${metrics.eventsReceived}`);
  console.log(`\nConnect time:`);
  console.log(`  Avg   : ${Math.round(metrics.connectTimes.reduce((a, b) => a + b, 0) / (metrics.connectTimes.length || 1))}ms`);
  console.log(`  P95   : ${percentile(metrics.connectTimes, 95)}ms`);
  console.log(`  Max   : ${Math.max(...metrics.connectTimes, 0)}ms`);

  if (metrics.latencies.length) {
    console.log(`\nPing latency:`);
    console.log(`  Avg   : ${Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)}ms`);
    console.log(`  P95   : ${percentile(metrics.latencies, 95)}ms`);
    console.log(`  P99   : ${percentile(metrics.latencies, 99)}ms`);
    console.log(`  Max   : ${Math.max(...metrics.latencies)}ms`);
  }

  const successRate = ((metrics.connected / CONCURRENCY) * 100).toFixed(1);
  console.log(`\nSuccess rate: ${successRate}%`);

  const passed =
    metrics.errors / CONCURRENCY < 0.01 &&
    percentile(metrics.latencies, 95) < 500;

  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'} (error rate < 1%, p95 latency < 500ms)`);
  console.log('='.repeat(50) + '\n');

  process.exit(passed ? 0 : 1);
}

runLoadTest().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
