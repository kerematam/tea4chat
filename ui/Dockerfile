# Build stage
FROM oven/bun:latest as build

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .


RUN bun run build:unsafe

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 