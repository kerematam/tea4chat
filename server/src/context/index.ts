// Define the context type with more properties for better type safety
import type { Context as HonoContext } from "hono";

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface Context extends Record<string, unknown> {
  requestId?: string;
  tracker?: {
    sessionId: string;
    ipAddress: string;
    userAgent: string;
  };
  user?: User; // Optional user for authenticated requests
  req: Request;
  res: Response;
  honoContext: HonoContext;
}
