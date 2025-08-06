# Development Tools & Testing

## Browser Console → Terminal Logging

The UI includes a sophisticated logging system that channels browser console logs to the development terminal for better debugging experience.

### Setup

**Vite Configuration (`ui/vite.config.ts`)**:
```typescript
import Terminal from 'vite-plugin-terminal'

export default defineConfig({
  plugins: [
    react(),
    Terminal({ strip: true }), // Removes logs in production builds
  ],
})
```

**Logger Setup (`ui/src/logger.ts`)**:
The logger is automatically imported in `App.tsx` and overrides console methods to selectively forward logs to terminal.

### Configuration

**Current Settings (`ui/src/logger.ts`)**:
```typescript
const LOG_CONFIG = {
    errors: true,      // ✅ console.error() → terminal
    warnings: false,   // ❌ console.warn() → browser only  
    info: false,       // ❌ console.info() → browser only
    debug: false,      // ❌ console.debug() → browser only
    logs: false        // ❌ console.log() → browser only
}
```

**Filtering Options**:
- **Keyword Filters**: Always/never log messages containing specific keywords
- **Message Filters**: Block specific patterns using regex (useful for noisy logs)
- **Level Control**: Enable/disable entire log levels

### Usage

All console methods work normally in browser:
```typescript
console.log("Debug info")     // Browser only (filtered)
console.error("Error!")       // Browser + Terminal ✅
console.warn("Warning")       // Browser only (filtered) 
```

### Benefits for Claude Code Testing

1. **Terminal Visibility**: See browser errors in terminal while coding
2. **Noise Reduction**: Filter out verbose logs, focus on errors
3. **Production Safety**: Logs automatically stripped from builds
4. **Flexible Control**: Easily adjust what gets logged where

### Customization

To modify logging behavior, edit `ui/src/logger.ts`:
```typescript
// Enable more log types
const LOG_CONFIG = {
    errors: true,
    warnings: true,  // Now shows warnings in terminal
    logs: true       // Now shows logs in terminal
}

// Add keyword filters
const KEYWORD_FILTERS = {
    alwaysLog: ['CRITICAL', 'FATAL'],    // Always to terminal
    neverLog: ['DEBUG', 'VERBOSE']       // Never to terminal
}

// Block noisy messages
const MESSAGE_FILTERS = [
    /react.*warning/i,  // Block React warnings
    /dev.*tool/i        // Block dev tool messages
]
```

## Testing Endpoints

### Core Production Endpoints

**Main Application**:
- `http://localhost:5173/` - Landing page
- `http://localhost:5173/chat` - New chat
- `http://localhost:5173/chat/:id` - Specific chat
- `http://localhost:5173/settings` - User settings
- `http://localhost:5173/admin` - Admin dashboard (requires admin)

**API Endpoints**:
- `http://localhost:3000/trpc` - tRPC API router
- `http://localhost:3000/api` - Better Auth endpoints

### Development Verification

**Quick Health Check**:
1. Start both servers: `cd server && bun run dev` + `cd ui && bun run dev`
2. Visit `http://localhost:5173/`
3. Create a new chat and send a message
4. Verify streaming works and errors appear in terminal

**Error Testing**:
1. Open browser dev tools
2. Execute: `console.error("Test error")`
3. Verify error appears in terminal where `bun run dev` is running

**Log Level Testing**:
1. Execute: `console.log("Test log")` - should only appear in browser
2. Execute: `console.error("Test error")` - should appear in both browser and terminal

## Claude Code Integration

This setup enables Claude Code to:
1. **Monitor Implementation**: See real-time errors while implementing features
2. **Debug Issues**: Terminal logs help identify problems quickly
3. **Verify Changes**: Test endpoints to ensure implementations work
4. **Production Safety**: Logs are automatically removed from builds

The logging system provides immediate feedback for development and testing without cluttering production builds.