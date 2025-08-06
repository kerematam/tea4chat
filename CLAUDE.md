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


## Database & Infrastructure
- PostgreSQL with Prisma ORM
- Redis Streams for resumable message streaming and caching
- Docker Compose for local development
- BullMQ (experimental implementation for background jobs)

