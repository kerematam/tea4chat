import { pinoLogger as origLogger } from "hono-pino";
import pino from "pino";
import pretty from "pino-pretty";
import type { Context, MiddlewareHandler } from 'hono';

export function pinoLogger(): MiddlewareHandler {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const logger = origLogger({
    pino: pino({
      level: process.env.LOG_LEVEL || "info",
    }, isDevelopment ? pretty() : undefined),
  });

  return async (c, next) => {
    // Add request ID to log context
    c.set('logContext', { requestId: c.get('requestId') });

    // return next();
    return logger(c, next);
  };
} 