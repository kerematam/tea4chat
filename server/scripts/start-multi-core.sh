#!/bin/sh
set -e

# echo "POSTGRES_USER: $POSTGRES_USER"
# echo "POSTGRES_PASSWORD: $POSTGRES_PASSWORD"
# echo "POSTGRES_DB: $POSTGRES_DB"
# echo "DATABASE_URL: $DATABASE_URL"

# Generate Prisma Client
echo "Generating Prisma Client..."
bunx prisma generate

# Check Prisma database connection with retry logic
echo "Checking database connection..."
MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if bunx prisma db execute --url "$DATABASE_URL" --stdin <<EOF
SELECT 1 as connection_test;
EOF
    then
        echo "Database connection successful!"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Database connection failed (attempt $RETRY_COUNT/$MAX_RETRIES). Retrying in 3 seconds..."
        sleep 3
        
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            echo "Failed to connect to database after $MAX_RETRIES attempts"
            exit 1
        fi
    fi
done

# Run migrations
echo "Running migrations..."
bunx prisma migrate deploy

# Run seed script to ensure system models exist
echo "Running seed script..."
bunx prisma db seed

# INFO: keep it alive so that i can debug issues
# while true; do
#   sleep 1000
# done

# Start the compiled binary
CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu || echo 2)
echo "Starting $CPU_COUNT Bun workers (reuse-port)..."

# Use a simple while loop instead of for loop with seq
i=1
while [ $i -le $CPU_COUNT ]; do
  REUSE_PORT=true ./dist/server &
  i=$((i + 1))
done

# Wait for all background processes
wait
