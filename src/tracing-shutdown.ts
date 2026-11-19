/**
 * Bounded OpenTelemetry shutdown (issue #1539).
 *
 * Kept free of SDK imports so it can be unit tested without starting the
 * tracing SDK. It never calls `process.exit`: Nest's own shutdown hooks decide
 * when the process ends.
 */

export const DEFAULT_TRACING_SHUTDOWN_TIMEOUT_MS = 5_000;

export interface ShutdownLogger {
  warn(message: string): void;
}

/**
 * Runs `shutdown` but never waits longer than `timeoutMs` for it, and never
 * rejects: an unreachable OTLP endpoint must not block or fail application
 * shutdown. Resolves to `true` when the SDK shut down in time, `false` when it
 * timed out or threw.
 */
export async function shutdownWithTimeout(
  shutdown: () => Promise<void>,
  timeoutMs: number = DEFAULT_TRACING_SHUTDOWN_TIMEOUT_MS,
  logger: ShutdownLogger = console,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
    // Do not keep the event loop alive just for this timer.
    timer.unref?.();
  });

  try {
    const outcome = await Promise.race([
      shutdown().then(() => 'done' as const),
      timeout,
    ]);
    if (outcome === 'timeout') {
      logger.warn(`Tracing shutdown did not finish within ${timeoutMs}ms; continuing`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`Tracing shutdown failed: ${(err as Error)?.message ?? String(err)}`);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
