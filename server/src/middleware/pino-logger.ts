import type { MiddlewareHandler } from 'hono';
import { pinoLogger as origLogger } from "hono-pino";
import pino from "pino";
import pretty from "pino-pretty";

export function pinoLogger(): MiddlewareHandler {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const logger = origLogger({
    pino: pino({
      level: process.env.LOG_LEVEL || "info",
      // Enhanced error logging for development
      ...(isDevelopment && {
        serializers: {
          err: pino.stdSerializers.err,
        },
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
      }),
    }, isDevelopment ? pretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      // Show full error details including stack traces
      errorLikeObjectKeys: ['err', 'error', 'exception'],
    }) : undefined),
  });

  return async (c, next) => {
    // Add request ID to log context
    c.set('logContext', { requestId: c.get('requestId') });

    try {
      await next();
    } catch (error) {
      // Log errors with full stack trace in development
      if (isDevelopment) {
        console.error('Request error:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          path: c.req.path,
          method: c.req.method,
          requestId: c.get('requestId'),
        });
      }
      throw error; // Re-throw to maintain error flow
    }

    // Skip request/response logging in development mode, but keep error logging
    if (process.env.NODE_ENV === 'development') {
      return;
    }
    
    return logger(c, next);
  };
} 