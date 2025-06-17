import { randomBytes } from "crypto";
import { middleware } from "../trpc";
import { updateTracker } from "../services/tracker.service";
import { getCookie, setCookie } from 'hono/cookie'

const SESSION_COOKIE_NAME = "session_id";
const SESSION_DURATION_DAYS = 30;

// Helper function to get the client IP address
function getClientIp(req: Request): string {
  if (!req) return "unknown";

  if (!req.headers.get("cf-ray")) {
    const ipAddress = req.headers?.get("x-real-ip") ||
      req.headers?.get("x-forwarded-for")?.split(",")[0] ||
      "unknown";

    return ipAddress;
  }

  const cfIp = req.headers?.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  // Then check forwarded headers
  const xForwardedFor = req.headers?.get("x-forwarded-for");


  if (xForwardedFor && xForwardedFor.length > 0 && typeof xForwardedFor === "string") return xForwardedFor.split(",")[0]!.trim();

  // Then check real IP header
  const xRealIp = req.headers?.get("x-real-ip");
  if (xRealIp) return xRealIp;

  return "unknown";
}


// Generate a random session ID
function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

// Create the tracker middleware
export const withTracker = middleware(async ({ ctx, next }) => {

  let sessionId = getCookie(ctx.honoContext, SESSION_COOKIE_NAME);
  if (!sessionId) {
    sessionId = generateSessionId();
    setCookie(ctx.honoContext, SESSION_COOKIE_NAME, sessionId);
  }

  try {
    // Get client information
    const ipAddress = getClientIp(ctx.honoContext.req.raw);
    const userAgent = ctx.honoContext.req.raw.headers.get("user-agent") || "unknown";

    const tracker = {
      sessionId,
      ipAddress,
      userAgent
    };

    const enhancedCtx = { ...ctx, tracker };

    updateTracker(tracker).catch(err =>
      console.error("Failed to update tracker:", err)
    );

    // Continue with the enhanced context
    return next({ ctx: enhancedCtx });
  } catch (error) {
    console.error("Error in tracker middleware:", error);
    // Continue with the original context if there's an error
    return next({ ctx });
  }
}); 