import { adminProcedure, withOwnerProcedure } from "../procedures";
import { router } from "../trpc";
import { chatRouter } from "./chatRouter";
import { messageRouter } from "./messageRouter";
import { modelRouter } from "./modelRouter";
import { settingsRouter } from "./settingsRouter";
import { trackerRouter } from "./trackerRouter";

export const appRouter = router({
  tracker: trackerRouter,
  chat: chatRouter,
  message: messageRouter,
  model: modelRouter,
  settings: settingsRouter,
  // hello: withOwnerProcedure
  //   .input(z.object({ name: z.string().optional() }))
  //   .query(async ({ input, ctx }) => {
  //     // We can now use the requestId in our handlers
  //     // console.log(`[${ctx.requestId}] Processing hello query with input:`, input);
  //     const sessionId = getCookie(ctx.honoContext, "session_id");
  //     const session = await auth.api.getSession({ headers: ctx.honoContext.req.raw.headers });
  //     console.log("session inside hello router", session)

  //     return {
  //       greeting: `Hello ${input.name ?? "World"}!`,
  //       requestId: ctx.requestId,
  //       ipAddress: ctx.tracker?.ipAddress,
  //       userAgent: ctx.tracker?.userAgent,
  //       sessionId: sessionId,
  //       user: ctx.user
  //     };
  //   }),
  // // Mutations are the best place to do things like updating a database
  // goodbye: trackedProcedure.mutation(async (opts) => {
  //   const { ctx } = opts;
  //   console.log(`[${ctx.requestId}] Processing goodbye mutation`);
  //   // console.log(ctx.tracker.ipAddress);
  //   // This function doesn't exist in the context type, so we need to remove it or implement it
  //   // await ctx.signGuestBook();

  //   return {
  //     message: "goodbye!",
  //     requestId: ctx.requestId,
  //     ipAddress: ctx.tracker.ipAddress,
  //     userAgent: ctx.tracker.userAgent,
  //     sessionId: ctx.tracker.sessionId,
  //   };
  // }),
  // Optional auth endpoint - works with or without authentication
  profile: withOwnerProcedure.query(({ ctx }) => {
    if (ctx.user) {
      // User is authenticated
      return {
        authenticated: true,
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          name: ctx.user.name,
        },
        isAdmin: ctx.owner?.isAdmin,
        sessionId: ctx.tracker?.sessionId,
      };
    } else {
      // User is not authenticated
      return {
        authenticated: false,
        user: null,
        sessionId: ctx.tracker?.sessionId,
      };
    }
  }),
  // Admin-only procedure that demonstrates type safety with the context
  adminStats: adminProcedure.query(({ ctx }) => {
    // The isAdmin middleware ensures ctx.user exists and is an admin
    // TypeScript knows about the enhanced context with admin property
    console.log(`[${ctx.requestId}] Admin accessing stats`);

    // Since the context type in context/index.ts doesn't define user or admin properties, 
    // we need to update the Context type or cast here
    return {
      userId: (ctx as any).user?.id,
      role: (ctx as any).user?.role,
      permissions: (ctx as any).admin?.permissions,
      lastAccess: (ctx as any).admin?.lastAccess,
      requestId: ctx.requestId,
      message: "Admin-only data accessed successfully",
    };
  }),
});

export type AppRouter = typeof appRouter;
