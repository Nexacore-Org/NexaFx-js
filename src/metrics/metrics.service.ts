import { Injectable } from '@nestjs/common';

interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  sum: number;
  count: number;
  buckets: Map<number, number>;
  labels: Record<string, string>;
}

/**
 * Minimal in-process Prometheus metrics store.
 * Produces text/plain exposition format without external libraries.
 */
@Injectable()
export class MetricsService {
  // HTTP request counters keyed by "method|route|status"
  private readonly httpRequestCounters = new Map<string, Counter>();
  // HTTP latency histograms keyed by "method|route"
  private readonly httpLatencyHistograms = new Map<string, Histogram>();

  // Custom counters
  private stellarSuccessTotal = 0;
  private stellarFailureTotal = 0;
  private activeWsConnections = 0;
  private readonly bullQueueDepths = new Map<string, number>();

  private readonly latencyBuckets = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
  ];

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const labelKey = `${method}|${route}|${statusCode}`;
    const existing = this.httpRequestCounters.get(labelKey);
    if (existing) {
      existing.value += 1;
    } else {
      this.httpRequestCounters.set(labelKey, {
        value: 1,
        labels: { method, route, status_code: String(statusCode) },
      });
    }

    const latencyKey = `${method}|${route}`;
    const durationSeconds = durationMs / 1000;
    let hist = this.httpLatencyHistograms.get(latencyKey);
    if (!hist) {
      hist = {
        sum: 0,
        count: 0,
        buckets: new Map(this.latencyBuckets.map((b) => [b, 0])),
        labels: { method, route },
      };
      this.httpLatencyHistograms.set(latencyKey, hist);
    }
    hist.sum += durationSeconds;
    hist.count += 1;
    for (const bucket of this.latencyBuckets) {
      if (durationSeconds <= bucket) {
        hist.buckets.set(bucket, (hist.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  incrementStellarSuccess(): void {
    this.stellarSuccessTotal += 1;
  }
  incrementStellarFailure(): void {
    this.stellarFailureTotal += 1;
  }
  setActiveWsConnections(count: number): void {
    this.activeWsConnections = count;
  }
  setBullQueueDepth(queue: string, depth: number): void {
    this.bullQueueDepths.set(queue, depth);
  }

  // ---------------------------------------------------------------------------
  // Exposition
  // ---------------------------------------------------------------------------

  exposition(): string {
    const lines: string[] = [];

    // http_requests_total
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const counter of this.httpRequestCounters.values()) {
      lines.push(
        `http_requests_total{${formatLabels(counter.labels)}} ${counter.value}`,
      );
    }

    // http_request_duration_seconds
    lines.push(
      '# HELP http_request_duration_seconds HTTP request latency histogram',
    );
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const hist of this.httpLatencyHistograms.values()) {
      const l = formatLabels(hist.labels);
      for (const [le, count] of hist.buckets) {
        lines.push(
          `http_request_duration_seconds_bucket{${l},le="${le}"} ${count}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{${l},le="+Inf"} ${hist.count}`,
      );
      lines.push(`http_request_duration_seconds_sum{${l}} ${hist.sum}`);
      lines.push(`http_request_duration_seconds_count{${l}} ${hist.count}`);
    }

    // stellar_submission_total
    lines.push(
      '# HELP stellar_submission_total Stellar transaction submissions',
    );
    lines.push('# TYPE stellar_submission_total counter');
    lines.push(
      `stellar_submission_total{result="success"} ${this.stellarSuccessTotal}`,
    );
    lines.push(
      `stellar_submission_total{result="failure"} ${this.stellarFailureTotal}`,
    );

    // websocket_connections_active
    lines.push(
      '# HELP websocket_connections_active Active WebSocket connections',
    );
    lines.push('# TYPE websocket_connections_active gauge');
    lines.push(`websocket_connections_active ${this.activeWsConnections}`);

    // bull_queue_depth
    lines.push('# HELP bull_queue_depth Bull queue waiting job count');
    lines.push('# TYPE bull_queue_depth gauge');
    for (const [queue, depth] of this.bullQueueDepths) {
      lines.push(`bull_queue_depth{queue="${queue}"} ${depth}`);
    }

    return lines.join('\n') + '\n';
  }
}

function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}
