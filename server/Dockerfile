FROM oven/bun:latest

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client (needed for compile)
RUN bunx prisma generate

# Build standalone binary (output to dist/server)
RUN bun run build

# Make start script executable
RUN chmod +x ./scripts/start.sh

EXPOSE 3000 