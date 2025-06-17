import { randomUUID } from "crypto";
import { middleware } from "../trpc";

// Create middleware that adds a unique requestId to the context
export const withRequestId = middleware(async ({ ctx, next }) => {
  // Generate a unique request ID for this request
  const requestId = randomUUID();
  
  // Log the start of request processing
  console.log(`[${requestId}] Request started`);
  
  // Measure request duration
  const start = Date.now();
  
  // Enhance the context with the requestId
  const result = await next({
    ctx: {
      ...ctx,
      requestId,
    },
  });
  
  // Log request completion with duration
  const durationMs = Date.now() - start;
  console.log(`[${requestId}] Request completed in ${durationMs}ms`);
  
  return result;
}); 