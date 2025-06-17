# Contributing to tea4chat 🤝

Thank you for your interest in contributing to tea4chat! We welcome contributions from everyone, whether you're fixing bugs, adding features, improving documentation, or sharing ideas.

## 🚀 Getting Started

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/kerematam/tea4chat.git
   cd tea4chat
   ```

2. **Install dependencies**
   ```bash
   # Server
   cd server && bun install
   
   # UI
   cd ui && bun install
   ```

3. **Set up the development environment**
   ```bash
   cd docker-compose
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   cd server
   bun run db:migrate
   ```

## 📋 How to Contribute

### Reporting Bugs

Before creating a bug report, please check if the issue already exists. If you find a bug:

1. Create a detailed issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Bun version, etc.)
   - Screenshots if applicable

### Suggesting Features

We love feature suggestions! Please:

1. Check if the feature has already been requested
2. Create a detailed issue describing:
   - The problem you're solving
   - Your proposed solution
   - Any alternatives considered
   - Mock-ups or examples if helpful

### Code Contributions

#### Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following our coding standards

3. **Test your changes**:
   ```bash
   # Server tests
   cd server && bun run test
   
   # UI build test
   cd ui && bun run build
   ```

4. **Commit your changes** with clear messages:
   ```bash
   git add .
   git commit -m "feat: add user preference settings"
   # or
   git commit -m "fix: resolve chat history loading issue"
   ```

5. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** with:
   - Clear title and description
   - Reference to related issues
   - Screenshots for UI changes
   - Test results

## 🎯 Coding Standards

### General Guidelines

- **Language**: Use TypeScript for all new code
- **Formatting**: We use Prettier and ESLint
- **Testing**: Write tests for new features and bug fixes
- **Documentation**: Update documentation for API changes

### Backend (Server)

- Use **Bun** as the runtime
- Follow **tRPC** patterns for API endpoints
- Use **Zod** for input validation
- Write unit tests with **Vitest**
- Follow RESTful principles where applicable

```typescript
// Example tRPC procedure
export const getUserChats = publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input }) => {
    // Implementation
  });
```

### Frontend (UI)

- Use **React** with TypeScript
- Follow **Material-UI** design patterns
- Use **React Query** for server state
- Write component tests
- Use semantic HTML and ARIA attributes

```tsx
// Example component
interface ChatMessageProps {
  message: ChatMessage;
  isLoading?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  isLoading = false 
}) => {
  // Implementation
};
```

### Database

- Use **Prisma** for all database operations
- Write migrations for schema changes
- Include seed data for new features
- Follow naming conventions (camelCase for fields)

```prisma
model Chat {
  id        String   @id @default(cuid())
  title     String
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  messages Message[]
  user     User      @relation(fields: [userId], references: [id])
}
```

## 🧪 Testing

### Running Tests

```bash
# Server tests
cd server
bun run test

# Watch mode
bun run test:watch

# With coverage
bun run test --coverage
```

### Writing Tests

- Write unit tests for business logic
- Write integration tests for API endpoints
- Mock external services (OpenAI, Anthropic, etc.)
- Test error scenarios and edge cases

```typescript
// Example test
describe('Chat Service', () => {
  it('should create a new chat', async () => {
    const chatData = { title: 'Test Chat', userId: 'user-1' };
    const result = await chatService.createChat(chatdata);
    
    expect(result.title).toBe('Test Chat');
    expect(result.userId).toBe('user-1');
  });
});
```

## 🔄 Git Workflow

### Commit Messages

We follow the [Conventional Commits](https://conventionalcommits.org/) specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code formatting changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

## 📚 Documentation

When contributing, please update relevant documentation:

- **README.md** - For setup or usage changes
- **API docs** - For backend changes
- **Component docs** - For UI changes
- **Code comments** - For complex logic

## 🛡️ Security

- Never commit sensitive data (API keys, passwords, etc.)
- Use environment variables for configuration
- Report security vulnerabilities privately
- Follow security best practices

## 💬 Getting Help

- **Questions**: Create a [Discussion](https://github.com/kerematam/tea4chat/discussions)
- **Bugs**: Create an [Issue](https://github.com/kerematam/tea4chat/issues)
- **Chat**: Join our development chat (link when available)

## 🎉 Recognition

Contributors will be:
- Listed in our README acknowledgments
- Mentioned in release notes for significant contributions
- Invited to our contributor Discord (when available)

## 📜 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

Thank you for contributing to tea4chat! Every contribution, no matter how small, helps make the project better for everyone. ☕🍵 