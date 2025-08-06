# Tea4Chat Documentation

## Overview

Tea4Chat is a real-time chat application with AI capabilities built with a modern tech stack.

## Architecture Documentation

- **[Streaming Architecture](./STREAMING-ARCHITECTURE.md)** - Complete guide to the hybrid streaming system
  - Direct streaming for real-time responses
  - Redis stream fallback for resumption scenarios
  - Bi-directional infinite queries
  - Resource optimization strategies

## Additional Documentation

- **[Stream Abort Mechanism](./stream-abort-mechanism.md)** - Stream termination handling
- **[Development Tools](./DEVELOPMENT-TOOLS.md)** - Browser console → terminal logging, testing endpoints

## Quick Start

1. **Development Setup**:
   ```bash
   # Server
   cd server && bun run dev
   
   # UI  
   cd ui && bun run dev
   ```

2. **Main Interface**: http://localhost:3000/

## Tech Stack

- **Backend**: Bun/TypeScript with tRPC, Prisma, Redis Streams
- **Frontend**: React/TypeScript with Vite, TanStack Query, Zustand
- **Database**: PostgreSQL with Prisma ORM
- **Streaming**: Redis Streams for resumable messaging
- **Architecture**: Monorepo structure