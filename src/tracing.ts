/**
 * OpenTelemetry tracing initialisation.
 * Must be imported at the very top of main.ts before any other module.
 *
 * Auto-instruments HTTP (incoming + outgoing), TypeORM, and Bull queues.
 * Exports spans to OTEL_EXPORTER_OTLP_ENDPOINT (defaults to no-op when unset).
 * Propagates W3C traceparent headers.
 * The active trace ID is available via the helper exported below for log injection.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { context, trace } from '@opentelemetry/api';

const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nexafx-api',
  }),
  traceExporter: exporterUrl ? new OTLPTraceExporter({ url: exporterUrl }) : undefined,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

/**
 * Returns the current W3C trace ID or an empty string when no active span exists.
 * Use this to inject trace IDs into structured log entries.
 */
export function getTraceId(): string {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId ?? '';
}

export { sdk as otelSdk };
