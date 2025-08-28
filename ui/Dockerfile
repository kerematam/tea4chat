# syntax=docker/dockerfile:1.6
# Build stage
FROM oven/bun:latest as build

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .


RUN --mount=type=secret,id=frontend_env,target=/tmp/frontend.env,required=false \
    if [ -f /tmp/frontend.env ]; then cp /tmp/frontend.env .env.production; fi && \
    bun run build:unsafe

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 