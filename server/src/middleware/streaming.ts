import { middleware } from "../trpc";

export const withStreamingHeaders = middleware(async ({ ctx, next }) => {
  // Prevent intermediaries from altering/buffering streaming responses
  ctx.honoContext.header("Cache-Control", "no-transform");
  // If running behind Nginx, this disables proxy buffering per response
  ctx.honoContext.header("X-Accel-Buffering", "no");
  return next();
});


