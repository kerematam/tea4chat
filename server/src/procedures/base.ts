import { procedure } from "../trpc";
import { isAdmin } from "../middleware";
import { withRequestId } from "../middleware/requestId";
import { withTracker } from "../middleware/tracker";
import { withOwner } from "../middleware/owner";

// Base procedures with different middleware compositions
export const publicProcedure = procedure;
export const trackedProcedure = publicProcedure.use(withTracker);
export const requestIdProcedure = trackedProcedure.use(withRequestId);
export const withOwnerProcedure = requestIdProcedure.use(withOwner);
export const adminProcedure = requestIdProcedure.use(isAdmin);
