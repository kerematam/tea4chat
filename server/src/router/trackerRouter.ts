import { router } from "../trpc";
import { trackedProcedure, requestIdProcedure } from "../procedures";
import { updateTracker } from "../services/tracker.service";
import { z } from "zod";

// This router demonstrates how to use the tracker middleware
export const trackerRouter = router({
  // Get the current session information (requires tracker middleware)
  getSession: trackedProcedure.query(({ ctx }) => {
    return {
      sessionId: ctx.tracker?.sessionId,
      ipAddress: ctx.tracker?.ipAddress,
      userAgent: ctx.tracker?.userAgent,
    };
  }),
  
  // Update user ID for the current session
  updateUserId: requestIdProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tracker) {
        throw new Error("Tracker context is missing");
      }
      
      // Update the tracker with user ID
      await updateTracker({
        ...ctx.tracker,
        userId: input.userId,
      });
      
      return { success: true };
    }),
    
  // Update anonymous user ID for the current session
  updateAnonUserId: requestIdProcedure
    .input(z.object({ anonUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tracker) {
        throw new Error("Tracker context is missing");
      }
      
      // Update the tracker with anonymous user ID
      await updateTracker({
        ...ctx.tracker,
        anonUserId: input.anonUserId,
      });
      
      return { success: true };
    }),
}); 