import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

// Initialize tRPC with the enhanced context type
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

// Export the initialized tRPC pieces
export const router = t.router;
export const middleware = t.middleware;
export const procedure = t.procedure; 