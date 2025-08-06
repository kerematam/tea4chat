# Tea4Chat Project Context

## Project Overview
Tea4Chat is a real-time chat application with AI capabilities, built with:
- **Backend**: Bun/TypeScript with tRPC, Prisma, Redis Streams
- **Frontend**: React/TypeScript with Vite, TanStack Query, Zustand
- **Architecture**: Monorepo with separate server and UI packages

@CLAUDE/current-task.md

## Key Files & Architecture
- **Server**: `/server/src/` - tRPC API, streaming logic, Redis message handling
- **UI**: `/ui/src/` - React components, hooks, streaming state management
- **Message Router**: `server/src/router/messageRouter.ts` - Core streaming logic
- **Chat Streaming**: `ui/src/hooks/useChatMessages/` - Client-side streaming state

## Development Commands
- **Server Dev**: `cd server && bun run dev`
- **UI Dev**: `cd ui && bun run dev`
- **Server Tests**: `cd server && bun run test`
- **Build Server**: `cd server && bun run build`
- **Build UI**: `cd ui && bun run build`
- **Lint UI**: `cd ui && bun run lint`

## Terminal Logging (For Claude Code Testing)
Browser console logs can be sent to terminal for easy debugging:

```typescript
import { terminal } from 'virtual:terminal'

// Send messages directly to terminal
terminal.log('Hey terminal! A message from the browser')
terminal.error('Error message in terminal')
terminal.warn('Warning in terminal')
```

**Current Setup**: Only `console.error()` automatically forwards to terminal. All other console methods stay in browser only. To verify your implementations work:

1. Add `console.error("Test: feature working")` to your code
2. Check terminal where `bun run dev` is running
3. Remove the console.error when done testing

**Testing URLs**:
- `http://localhost:5173/` - Landing page
- `http://localhost:5173/chat` - New chat (test streaming)
- `http://localhost:5173/settings` - Settings page


## Database & Infrastructure
- PostgreSQL with Prisma ORM
- Redis Streams for resumable message streaming and caching
- Docker Compose for local development
- BullMQ (experimental implementation for background jobs)

