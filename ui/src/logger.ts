import { terminal } from 'virtual:terminal'

// Configure what types of logs you want to see in terminal
const LOG_CONFIG = {
    errors: true,      // console.error() -> terminal
    warnings: false,   // console.warn() -> terminal  
    info: false,       // console.info() -> terminal
    debug: false,      // console.debug() -> terminal
    logs: false         // console.log() -> terminal
}

// Keywords to always/never log to terminal
const KEYWORD_FILTERS = {
    // Always log these to terminal (regardless of LOG_CONFIG) - DISABLED
    alwaysLog: [], // ['ERROR', 'CRITICAL', 'FATAL', 'EXCEPTION'],

    // Never log these to terminal (even if LOG_CONFIG allows it) - DISABLED  
    neverLog: [] // ['DEBUG', 'VERBOSE', 'TRACE']
}

// Specific message filters - these will be completely blocked from terminal.
// Write regex to match the message. This might be useful to avoid log
// pollution.
const MESSAGE_FILTERS = [
    // /iframe[\s\-_]*resizer/i,  //  example
] as RegExp[]

function shouldLogToTerminal(level: keyof typeof LOG_CONFIG, message: any) {
    const messageStr = String(message).toUpperCase()

    // Check if message should be completely filtered out
    if (MESSAGE_FILTERS.some(filter => filter.test(messageStr))) {
        return false
    }

    // Check never log keywords
    if (KEYWORD_FILTERS.neverLog.some(keyword => messageStr.includes(keyword))) {
        return false
    }

    // Check always log keywords
    if (KEYWORD_FILTERS.alwaysLog.some(keyword => messageStr.includes(keyword))) {
        return true
    }

    // Check level configuration
    return LOG_CONFIG[level] || false
}

// Store original console methods
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
}

// Override console methods to filter messages
function initializeConsoleOverride() {
    console.log = (...args) => {
        originalConsole.log(...args) // Always show in browser
        if (shouldLogToTerminal('logs', args[0])) {
            terminal.log(...args)
        }
    }

    console.error = (...args) => {
        originalConsole.error(...args) // Always show in browser
        if (shouldLogToTerminal('errors', args[0])) {
            terminal.error(...args)
        }
    }

    console.warn = (...args) => {
        originalConsole.warn(...args) // Always show in browser
        if (shouldLogToTerminal('warnings', args[0])) {
            terminal.warn(...args)
        }
    }

    console.info = (...args) => {
        originalConsole.info(...args) // Always show in browser
        if (shouldLogToTerminal('info', args[0])) {
            terminal.info(...args)
        }
    }

    console.debug = (...args) => {
        originalConsole.debug(...args) // Always show in browser
        if (shouldLogToTerminal('debug', args[0])) {
            terminal.log(...args)
        }
    }
}

// Initialize console override
initializeConsoleOverride()

export default { terminal } 