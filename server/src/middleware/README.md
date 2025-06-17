# tRPC Middleware

This directory contains middleware for use with tRPC procedures.

## Tracker Middleware

The tracker middleware (`tracker.ts`) provides automatic session tracking for users. It:

1. Creates and manages session cookies
2. Retrieves client information (IP address, user agent)
3. Stores tracking data in the database
4. Makes tracking information available in the request context

### How It Works

The middleware automatically:
- Sets a persistent session cookie for anonymous visitors
- Retrieves IP address and user agent information
- Updates the database with each visitor's session data
- Adds tracking information to the tRPC context

### Usage

#### Basic Usage with Procedures

```ts
// Import the tracked procedure
import { trackedProcedure } from "../procedures";

// Define a procedure that needs tracking
const myProcedure = trackedProcedure.query(({ ctx }) => {
  // Access tracker information from context
  const sessionId = ctx.tracker?.sessionId;
  const ipAddress = ctx.tracker?.ipAddress;
  const userAgent = ctx.tracker?.userAgent;
  
  // Do something with tracker data
  return {
    sessionInfo: {
      id: sessionId,
      ip: ipAddress,
      agent: userAgent,
    }
  };
});
```

#### Updating User IDs

Once a user logs in, you can associate their session with their user ID:

```ts
import { updateTracker } from "../services/tracker.service";

// Inside your login procedure
await updateTracker({
  sessionId: ctx.tracker.sessionId,
  ipAddress: ctx.tracker.ipAddress,
  userAgent: ctx.tracker.userAgent,
  userId: loggedInUserId, // Add the user ID
});
```

#### Client-Side Considerations

The session cookie is set with:
- `httpOnly: true` - For security
- `secure: true` - In production only
- `sameSite: "lax"` - For good compatibility with modern browsers
- `maxAge: 30 days` - For persistence

### Database Schema

The tracker relies on the `Tracker` model in the Prisma schema:

```prisma
model Tracker {
  id         String    @id @default(uuid())
  sessionId  String
  ipAddress  String
  userAgent  String
  firstSeen  DateTime  @default(now())
  lastSeen   DateTime  @updatedAt
  userId     String?
  anonUserId String?
  user       User?     @relation(fields: [userId], references: [id])
  anonUser   AnonUser? @relation(fields: [anonUserId], references: [id])

  @@unique([sessionId, ipAddress, userAgent])
  @@index([userId])
  @@index([anonUserId])
  @@index([ipAddress])
}
``` 