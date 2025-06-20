<div align="center" style="background-color: ##fef7ed; padding: 20px; border-radius: 12px; margin: 20px 0; position: relative;">
  <img src="ui/src/assets/tea4chat.png" alt="Tea 4 Chat Logo" width="200"/>
  <h1 style="font-family: 'Courier New', 'Monaco', 'Consolas', monospace; font-weight: bold; color: white; font-size: 2rem; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3); margin: 10px 0 0 0; letter-spacing: 3px;">Tea 4 Chat 💬</h1>
</div>

An AI-powered chat application built for scalability and performance, supporting multiple AI models with real-time streaming capabilities.

## 🚀 Features

- **High Performance**: Built with Bun runtime, clustering, and binary builds
- **Multi-Model AI Support**: OpenAI GPT, Anthropic Claude
- **Local First**: React Query with IndexedDB persistor for local-first experience
- **User Authentication**: OAuth integration with Google and anonymous sessions
- **Chat History**: Persistent chat sessions
- **Modern UI**: Responsive interface with dark/light theme
- **Scalable Architecture**: Docker-ready with Redis for session management
- **Database Integration**: PostgreSQL with Prisma ORM

## 🏗️ Architecture

This is a full-stack TypeScript application with:

- **Frontend**: React + Vite + Material-UI
- **Backend**: Bun + Hono + tRPC for type-safe APIs
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Sessions**: Redis for real-time features
- **Authentication**: Better Auth with Google
- **Containerization**: Docker with multi-service setup

## 📋 Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://docker.com/) & Docker Compose
- [PostgreSQL](https://postgresql.org/) (if running locally)
- [Redis](https://redis.io/) (if running locally)

## 🛠️ Quick Start

### Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/kerematam/tea4chat.git
   cd tea4chat
   ```

2. **Configure environment**
   ```bash
   # Copy and configure server environment
   cp docker-compose/envs/server.example.env docker-compose/envs/server.env
   cp docker-compose/envs/frontend.example.env docker-compose/envs/frontend.env
   # Edit the .env files with your values
   ```

3. **Start with Docker Compose**
   ```bash
   cd docker-compose
   docker-compose -f docker-compose.external-fullstack.yml up
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Database Studio: http://localhost:5555

### Manual Development Setup

1. **Setup Server**
   ```bash
   cd server
   bun install
   bun run db:migrate
   bun run dev
   ```

2. **Setup UI**
   ```bash
   cd ui
   bun install
   bun run dev
   ```

## 🐳 Production Deployment

### Using Docker Compose

1. **Configure environment variables**
   ```bash
   cp docker-compose/envs/server.example.env docker-compose/envs/server.env
   cp docker-compose/envs/frontend.example.env docker-compose/envs/frontend.env
   # Edit the .env files with your production values
   ```

2. **Deploy with production compose**
   ```bash
   cd docker-compose
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Environment Variables

Configure `docker-compose/envs/server.env`:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=tea4chat
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/tea4chat?schema=public"

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Auth
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# AI APIs
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## 🔧 Development

### Available Scripts

**Server (Bun)**
```bash
bun run dev         # Development with hot reload
bun run build       # Build production binary
bun run start       # Start production server
bun run test        # Run tests
bun run db:migrate  # Run database migrations
bun run db:studio   # Open Prisma Studio
```

**UI (React)**
```bash
bun run dev         # Development server
bun run build       # Production build
bun run preview     # Preview production build
bun run lint        # Lint code
```

### Database Management

```bash
# Generate Prisma client
bun run db:generate

# Create new migration
bun run db:migrate

# Reset database
bun run db:reset

# Seed database
bun run db:seed
```

## 🧪 Testing

```bash
# Run server tests
cd server && bun run test

# Run with coverage
cd server && bun run test --coverage

# Watch mode
cd server && bun run test:watch
```

## 📊 Performance

- **Clustering**: Automatic multi-CPU clustering with SO_REUSEPORT
- **Caching**: Redis-based session and response caching
- **Streaming**: Real-time AI response streaming
- **Build Optimization**: Binary compilation for production
- **Resource Usage**: Optimized for 2 vCPU / 4GB RAM deployment

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🛡️ Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md) for reporting instructions.

## 📞 Support

- Create an [Issue](https://github.com/kerematam/tea4chat/issues) for bug reports
- Join our [Discussions](https://github.com/kerematam/tea4chat/discussions) for questions
- Check out the [Documentation](docs/) for detailed guides

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh/) - The fast all-in-one JavaScript runtime
- Powered by [Hono](https://hono.dev/) - Ultrafast web framework
- UI components from [Material-UI](https://mui.com/)
- Type safety with [tRPC](https://trpc.io/)

---

Made with ❤️ and lots of ☕ (and 🍵) 
