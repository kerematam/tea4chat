# Tea4Chat – Backend Deployment Guide

> Applies to the `/server` workspace (Hono + Bun runtime, Prisma ORM).

---

## 1  Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Bun**     | ≥ 1.1   | https://bun.sh 
| **PostgreSQL** | 14 / 15 | Accessible via `DATABASE_URL`.
| **Redis**   | 6 / 7    | Used for rate-limiting & caching.
| **Node.js** | not required at runtime (only Bun) |
| **OpenAI / Anthropic keys** | optional | Needed for live LLM calls.

You can spin up Postgres & Redis with the provided **docker-compose** files (see `docker-compose/`).

```bash
# quick local databases
cd docker-compose
docker compose up -d postgres redis
```

---

## 2  Environment variables

Create `.env` inside `/server` (or export vars in your platform). Minimum:

```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/tea4chat?schema=public"

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# (optional) LLM providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...

# (optional) Google / Better-Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

A fuller example lives in `docker-compose/envs/backend.env`.

---

## 3  Local development

```bash
# 1. install deps (once)
cd server
bun install

# 2. generate Prisma client
bun run db:generate    # -> prisma generate

# 3. apply migrations & seed system models (idempotent)
bun run db:migrate     # -> prisma migrate dev (runs seed script)

# 4. start dev server with reload
bun run dev            # Hono listens on http://localhost:3000
```

> The seed script (`prisma/seed.ts`) automatically inserts core LLM models (`gpt-4o`, `gpt-3.5-turbo`, `claude-3-sonnet`). It runs every time you execute `db:migrate` or `prisma db seed`.

---

## 4  Production / CI deploy

### 4.1 Plain Linux host (systemd / PM2)
```bash
# clone & enter project
git clone https://github.com/<you>/tea4chat.git
cd tea4chat/server

bun install --production

# run migrations against live DB (no schema changes are generated)
BUN_PRISMA_QUERY_ENGINE_LIBRARY=/tmp bunx prisma migrate deploy  # or bun run prisma migrate deploy

# start server
bun run start             # NODE_ENV=production src/index.ts
```

### 4.2 Docker Compose
A ready-made compose file is in `docker-compose/docker-compose.prod.yml`.

```bash
cd docker-compose
# edit envs/backend.env with real secrets
export $(cat envs/backend.env | xargs)   # or use an .env file

docker compose -f docker-compose.prod.yml up -d server
```

### 4.3 Platform-as-a-Service (Railway, Fly.io, Render …)
1  Add the `/server` directory as the service root.  
2  Set env vars shown above.  
3  Build command: `bun install --production`  
4  Start command:  
```bash
bunx prisma migrate deploy && bun run start
```

---

## 5  Handy commands

| Purpose | Command |
|---------|---------|
| Create a new migration (dev only) | `bun run db:migrate` |
| Deploy migrations in prod | `bun run prisma migrate deploy` |
| Seed data only | `bun run db:seed` |
| Open Prisma Studio | `bun run db:studio` |
| Run unit tests | `bun run test` |

---

## 6  Troubleshooting

**`Script not found "server"`** – Run Bun commands from inside the `server` folder or use `bun run --cwd server <script>`.

**Database connection errors** – double-check `DATABASE_URL`, network rules, and that the Postgres container/service is up.

**Seed script fails** – ensures your `ModelCatalog` table exists (all migrations ran) and that deterministic IDs (`sys_<name>`) aren't colliding with other rows.

---

Happy shipping! 🚀
