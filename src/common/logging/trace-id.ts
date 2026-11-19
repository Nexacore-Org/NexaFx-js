import { context, trace } from '@opentelemetry/api';

/**
 * Active W3C trace id, or '' when no span is active. Lives here rather than in
 * src/tracing.ts because importing tracing.ts starts the OpenTelemetry SDK as a
 * side effect, which must not happen when AppModule is merely imported.
 */
export function currentTraceId(): string {
  return trace.getSpan(context.active())?.spanContext().traceId ?? '';
}
