import { middleware } from "../trpc";
import { auth } from "../auth";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_OWNER_SETTINGS } from "../constants/defaultOwnerSettings";

const prisma = new PrismaClient();

// Optional auth middleware - adds user to context if authenticated, otherwise continues
export const withOptionalAuth = middleware(async ({ ctx, next }) => {
  try {

    if (process.env.NODE_ENV === "test" && ctx.honoContext.req.header('by-pass-auth') === 'true') {
      return next({
        ctx: {
          ...ctx,
          user: {
            id: process.env.TEST_USER_ID,
            email: process.env.TEST_USER_EMAIL,
            name: process.env.TEST_USER_NAME,
            isAdmin: false,
          },
        },
      });
    }

    const session = await auth.api.getSession({ headers: ctx.honoContext.req.raw.headers });

    if (session) {
      // User is authenticated, add user to context

      return next({
        ctx: {
          ...ctx,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name || session.user.email,
            isAdmin: false, // You can implement admin logic here
          },
        },
      });
    } else {
      // User is not authenticated, continue without user in context
      return next({
        ctx: {
          ...ctx,
          // user is undefined/not added
        },
      });
    }
  } catch (error) {
    // If there's an error checking the session, continue without user
    console.warn("Error checking auth session:", error);
    return next({
      ctx: {
        ...ctx,
        // user is undefined/not added
      },
    });
  }
});

// Owner middleware - ensures owner exists and adds to context along with user/anonUser
export const withOwner = middleware(async ({ ctx, next }) => {
  try {
    let user = null;
    let anonUser = null;
    let owner = null;

    if (!ctx.tracker?.sessionId) {
      throw new Error("Session ID is required");
    }

    // First, handle authentication (similar to withOptionalAuth)
    if (process.env.NODE_ENV === "test" && ctx.honoContext.req.header('by-pass-auth') === 'true') {
      user = {
        id: process.env.TEST_USER_ID,
        email: process.env.TEST_USER_EMAIL,
        name: process.env.TEST_USER_NAME,
        isAdmin: false,
      };
    } else {
      const session = await auth.api.getSession({ headers: ctx.honoContext.req.raw.headers });
      if (session) {
        user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || session.user.email,
          isAdmin: false,
        };
      }
    }

    // Now handle owner creation/retrieval
    // TODO: NOT GOOD to create side effects here
    if (user) {
      // Authenticated user - find or create owner
      owner = await prisma.owner.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          settings: {
            create: DEFAULT_OWNER_SETTINGS,
          },
        },
        include: {
          user: true,
          anonUser: true,
          settings: true,
        }
      });
    } else {
      // Anonymous user - need session ID from tracker
      // Find or create anonymous user
      anonUser = await prisma.anonUser.upsert({
        where: { sessionId: ctx.tracker.sessionId },
        update: { lastSeenAt: new Date() },
        create: {
          sessionId: ctx.tracker.sessionId,
          lastSeenAt: new Date()
        },
      });

      // Find or create owner for anonymous user
      owner = await prisma.owner.upsert({
        where: { anonUserId: anonUser.id },
        update: {},
        create: {
          anonUserId: anonUser.id,
          settings: {
            create: DEFAULT_OWNER_SETTINGS,
          },
        },
        include: {
          user: true,
          anonUser: true,
          settings: true,
        },
      });


    }

    return next({
      ctx: {
        ...ctx,
        user,
        anonUser,
        owner,
      },
    });

  } catch (error) {
    console.warn("Error in withOwner middleware:", error);
    // Continue without owner/user context on error
    return next({
      ctx: {
        ...ctx,
      },
    });
  }
}); 