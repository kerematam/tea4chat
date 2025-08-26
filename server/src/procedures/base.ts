import { isAdmin } from "../middleware";
import { withOwner } from "../middleware/owner";
import { withRequestId } from "../middleware/requestId";
import { withStreamingHeaders } from "../middleware/streaming";
import { withTracker } from "../middleware/tracker";
import { procedure } from "../trpc";

// Base procedures with different middleware compositions
export const publicProcedure = procedure;
export const trackedProcedure = publicProcedure.use(withTracker);
export const requestIdProcedure = trackedProcedure.use(withRequestId);
export const withOwnerProcedure = requestIdProcedure.use(withOwner);
export const adminProcedure = requestIdProcedure.use(isAdmin);
export const streamingProcedure = requestIdProcedure
  .use(withStreamingHeaders)
  .use(withOwner);
