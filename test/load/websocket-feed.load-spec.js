/**
 * WebSocket feed load test — 1000 subscribers, price update latency < 500ms
 * Run with: k6 run test/load/websocket-feed.load-spec.js
 */
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.WS_URL || 'ws://localhost:3000/notifications';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const WS_LATENCY_THRESHOLD_MS = parseInt(__ENV.WS_LATENCY_MS || '500');

const updateLatency = new Trend('ws_price_update_latency');
const messagesReceived = new Counter('ws_messages_received');

export const options = {
  scenarios: {
    websocket_subscribers: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '60s',
    },
  },
  thresholds: {
    ws_price_update_latency: [`p(99)<${WS_LATENCY_THRESHOLD_MS}`],
  },
};

export default function () {
  const url = `${BASE_URL}?token=${AUTH_TOKEN}`;

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ event: 'subscribe_channel', data: { channel: `user:test-${__VU}` } }));
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.event === 'price.update' && msg.sentAt) {
          const latency = Date.now() - new Date(msg.sentAt).getTime();
          updateLatency.add(latency);
        }
        messagesReceived.add(1);
      } catch (_) {}
    });

    socket.on('error', () => {});
    socket.setTimeout(() => socket.close(), 55000);
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
  sleep(1);
}
