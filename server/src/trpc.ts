import { initTRPC } from "@trpc/server";
import type { Context } from "./context";

// Initialize tRPC with the enhanced context type
const t = initTRPC.context<Context>().create();

// Export the initialized tRPC pieces
export const router = t.router;
export const middleware = t.middleware;
export const procedure = t.procedure; 