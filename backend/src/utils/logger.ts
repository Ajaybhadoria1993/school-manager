/**
 * Minimal structured logger. Swap the body of `reportError` for a real
 * error-monitoring SDK (Sentry, Datadog, etc.) when a DSN/API key is
 * available — every unhandled error in the app already flows through here
 * via errorHandler.ts, so that's the only place that needs to change.
 */
export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: "info", message, ...meta, time: new Date().toISOString() }));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ level: "warn", message, ...meta, time: new Date().toISOString() }));
  },
  error(message: string, err?: unknown, meta?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
        ...meta,
        time: new Date().toISOString(),
      })
    );
  },
};

export function reportError(err: unknown, context?: Record<string, unknown>) {
  logger.error("unhandled_error", err, context);
  // TODO: forward to Sentry/Datadog once a DSN is configured, e.g.
  // if (env.sentryDsn) Sentry.captureException(err, { extra: context });
}
