import { redis } from "./redis";

type RateLimitConfig = {
  requests: number;
  window: number; // in seconds
};

// Free tier limits for users without API keys
const freeTierLimits: Record<string, RateLimitConfig> = {
  openai: { requests: 3, window: 60 }, // 20 requests per hour
  anthropic: { requests: 0, window: 60 * 60 }, // 20 requests per hour
};

/**
 * Check if user has exceeded free tier rate limit for a specific provider
 * @param userId - The user ID
 * @param provider - The AI provider (openai, anthropic)
 * @returns Promise<{isRateLimited: boolean, timeLeftSeconds?: number}> - rate limit status and time left
 */
export async function checkFreeTierRateLimit(
  userId: string,
  provider: string
): Promise<{isRateLimited: boolean, timeLeftSeconds?: number}> {
  const limit = freeTierLimits[provider];
  if (!limit) {
    // If provider not in free tier limits, allow request
    return { isRateLimited: false };
  }

  const key = `rate:freetier:${provider}:user:${userId}`;

  // Increment the counter
  const count = await redis.incr(key);

  // Set expiry on first increment
  if (count === 1) {
    await redis.expire(key, limit.window);
  }

  // Check if limit is exceeded
  if (count > limit.requests) {
    const ttl = await redis.ttl(key);
    return { 
      isRateLimited: true, 
      timeLeftSeconds: ttl > 0 ? ttl : undefined 
    };
  }

  return { isRateLimited: false };
}

/**
 * Get remaining requests for a user and provider
 * @param userId - The user ID
 * @param provider - The AI provider (openai, anthropic)
 * @returns Promise<{remaining: number, resetTime: number | null}> - remaining requests and reset time
 */
export async function getRemainingRequests(
  userId: string,
  provider: string
): Promise<{
  remaining: number;
  resetTime: number | null;
}> {
  const limit = freeTierLimits[provider];
  if (!limit) {
    return { remaining: -1, resetTime: null }; // Unlimited
  }

  const key = `rate:freetier:${provider}:user:${userId}`;
  const count = await redis.get(key);
  const currentCount = count ? parseInt(count) : 0;
  const remaining = Math.max(0, limit.requests - currentCount);

  let resetTime = null;
  if (currentCount > 0) {
    const ttl = await redis.ttl(key);
    resetTime = ttl > 0 ? Date.now() + ttl * 1000 : null;
  }

  return { remaining, resetTime };
}
