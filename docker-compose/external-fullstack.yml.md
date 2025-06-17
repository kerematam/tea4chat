# External Fullstack Docker Compose

This docker compose file is used to development of backend and frontend. It runs postgres, redis and database.

## Usage

```bash
docker compose -f docker-compose/docker-compose.external-fullstack.yml up
```

Be sure that hosts in `.env.local` files are set correctly with `localhost`.

On `server/.env.local` file:

```bash 
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tea4chat?schema=public"
REDIS_HOST=localhost
```

On `ui/.env.local` file:

```bash
VITE_BACKEND_URL=http://localhost:3000
```

**Daily development:** Start the server in watch mode:

```bash
bun run dev
```


