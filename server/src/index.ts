import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from "./context";
import { appRouter } from "./router";

import { pinoLogger } from './middleware/pino-logger';
import authRoutes from './router/authRoutes';

const app = new Hono();
const port = process.env.PORT || 3000;
const isNonProd = ["development", "test"].includes(process.env.NODE_ENV || "");
const reusePort = process.env.REUSE_PORT === "true";

if (isNonProd) {
  const corsConfig = {
    origin: ["http://localhost:5173", "http://localhost"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    exposeHeaders: ["Content-Length", "X-CSRF-Token"],
    credentials: true,
    maxAge: 600,
  };

  // Apply CORS with appropriate config
  app.use("*", cors(corsConfig));
}

// app.use('*', requestId());
app.use('*', pinoLogger());
app.route("/api/auth", authRoutes);
// app.use('*', (c, next) => {
//   return next();
// });

// tRPC handler with Hono
app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext: async (opts, context) => {
    const headerRequestId = context.req.raw.headers.get('x-request-id') || undefined;
    const ctx: Context = {
      requestId: headerRequestId,
      req: { ...context.req, ...opts.req },
      res: context.res,
      honoContext: context
    };

    return ctx;
  }
}));

// Start server
// console.log(`Server starting at http://localhost:${port}`);

export default {
  port,
  reusePort,
  fetch: app.fetch,
  idleTimeout: 255, // Maximum allowed by Bun (255 seconds = ~4.25 minutes)
  maxRequestBodySize: 1024 * 1024 * 10, // 10MB max request body
};

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Server closed");
  process.exit(0);
});
