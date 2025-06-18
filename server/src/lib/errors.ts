export enum ErrorCode {
  // API Key related errors
  API_KEY_MISSING = 'API_KEY_MISSING',
  API_KEY_INVALID = 'API_KEY_INVALID',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Model/Provider errors
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  
  // General errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes for different scenarios
export class ApiKeyError extends AppError {
  constructor(provider: string, code: ErrorCode = ErrorCode.API_KEY_MISSING) {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.API_KEY_MISSING]: `${provider} API key not configured. Please add your API key in settings.`,
      [ErrorCode.API_KEY_INVALID]: `Invalid ${provider} API key. Please check your API key in settings.`,
      [ErrorCode.API_KEY_EXPIRED]: `${provider} API key has expired. Please update your API key in settings.`,
      [ErrorCode.RATE_LIMIT_EXCEEDED]: `${provider} rate limit exceeded`,
      [ErrorCode.QUOTA_EXCEEDED]: `${provider} quota exceeded`,
      [ErrorCode.MODEL_NOT_FOUND]: `${provider} model not found`,
      [ErrorCode.PROVIDER_UNAVAILABLE]: `${provider} unavailable`,
      [ErrorCode.UNAUTHORIZED]: `${provider} unauthorized`,
      [ErrorCode.FORBIDDEN]: `${provider} forbidden`,
      [ErrorCode.INTERNAL_ERROR]: `${provider} internal error`,
      [ErrorCode.VALIDATION_ERROR]: `${provider} validation error`,
    };
    
    super(code, messages[code] || `${provider} API key error`, 401);
  }
}

export class RateLimitError extends AppError {
  constructor(provider: string, retryAfter?: number) {
    const message = retryAfter 
      ? `${provider} rate limit exceeded. Please try again in ${retryAfter} seconds.`
      : `${provider} rate limit exceeded. Please try again later.`;
    
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429);
  }
}

export class QuotaExceededError extends AppError {
  constructor(provider: string) {
    super(
      ErrorCode.QUOTA_EXCEEDED,
      `${provider} quota exceeded. Please check your billing or upgrade your plan.`,
      402
    );
  }
}

export class ModelNotFoundError extends AppError {
  constructor(modelName: string) {
    super(
      ErrorCode.MODEL_NOT_FOUND,
      `Model "${modelName}" not found or not available.`,
      404
    );
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(provider: string) {
    super(
      ErrorCode.PROVIDER_UNAVAILABLE,
      `${provider} service is currently unavailable. Please try again later.`,
      503
    );
  }
}

// Helper function to parse API errors and convert them to our error types
export function parseApiError(error: any, provider: string): AppError {
  const errorMessage = error?.message || error?.error?.message || 'Unknown error';
  const errorCode = error?.code || error?.error?.code;
  const statusCode = error?.status || error?.response?.status;

  // OpenAI specific error handling
  if (provider === 'openai') {
    if (statusCode === 401 || errorMessage.includes('api key')) {
      return new ApiKeyError('OpenAI', ErrorCode.API_KEY_INVALID);
    }
    if (statusCode === 429) {
      const retryAfter = error?.response?.headers?.['retry-after'];
      return new RateLimitError('OpenAI', retryAfter ? parseInt(retryAfter) : undefined);
    }
    if (statusCode === 402 || errorMessage.includes('quota')) {
      return new QuotaExceededError('OpenAI');
    }
    if (statusCode === 404 || errorMessage.includes('model')) {
      return new ModelNotFoundError(errorMessage);
    }
  }

  // Anthropic specific error handling
  if (provider === 'anthropic') {
    if (statusCode === 401 || errorMessage.includes('api key') || errorMessage.includes('authentication')) {
      return new ApiKeyError('Anthropic', ErrorCode.API_KEY_INVALID);
    }
    if (statusCode === 429) {
      return new RateLimitError('Anthropic');
    }
    if (statusCode === 402 || errorMessage.includes('credit') || errorMessage.includes('billing')) {
      return new QuotaExceededError('Anthropic');
    }
    if (statusCode === 404 || errorMessage.includes('model')) {
      return new ModelNotFoundError(errorMessage);
    }
  }

  // Generic service unavailable
  if (statusCode >= 500) {
    return new ProviderUnavailableError(provider);
  }

  // Fallback to generic internal error
  return new AppError(ErrorCode.INTERNAL_ERROR, errorMessage, statusCode || 500);
} 