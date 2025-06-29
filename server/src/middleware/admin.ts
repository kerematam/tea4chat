import { TRPCError } from "@trpc/server";
import { middleware } from "../trpc";

// Create admin middleware that checks for admin permissions
export const isAdmin = middleware(async ({ ctx, next }) => {
  // Type safety is demonstrated here - TypeScript knows ctx.user might be undefined
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be an administrator to access this resource",
    });
  }
  
  // The middleware can also enhance the context for procedures that use it
  return next({
    ctx: {
      // Original context is preserved
      ...ctx,
      // Additional admin-specific context data can be added
      admin: {
        permissions: ["read", "write", "delete"],
        lastAccess: new Date(),
      },
    },
  });
}); 