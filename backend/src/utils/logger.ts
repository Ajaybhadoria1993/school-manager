/**
 * Minimal logger. JSON lines in production, readable text otherwise, silent for
 * info/warn in tests. Never pass secrets, tokens or passwords to these functions.
 * Swap the body of `reportError` for an error-monitoring SDK later; every
 * unhandled error already flows through it via middleware/errorHandler.ts.
 */
const isTest = process.env.NODE_ENV === "test";
const isProd = process.env.NODE_ENV === "production";

function write(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  if (isTest && level !== "error") return;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (isProd) {
    sink(JSON.stringify({ level, message, ...meta, time: new Date().toISOString() }));
  } else {
    sink(`[${level}] ${message}${meta && Object.keys(meta).length ? " " + JSON.stringify(meta) : ""}`);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error(message: string, err?: unknown, meta?: Record<string, unknown>) {
    const error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
    write("error", message, { ...(error ? { error } : {}), ...meta });
  },
};

export function reportError(err: unknown, context?: Record<string, unknown>) {
  logger.error("unhandled_error", err, context);
}
