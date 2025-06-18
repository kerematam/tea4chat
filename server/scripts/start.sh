#!/bin/bash
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

# Build the server and cluster binaries
echo "Building server and cluster binaries..."
bun run build

# Start compiled cluster binary
echo "Starting compiled Bun worker cluster..."
./dist/cluster
