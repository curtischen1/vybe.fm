import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logError } from '@/utils/logger';
import { ApiError, ValidationError } from '@/types/api';

// Custom error classes
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationAppError extends AppError {
  public fields: Record<string, string[]>;

  constructor(message: string, fields: Record<string, string[]>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  public retryAfter: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter: number = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

export class SpotifyApiError extends AppError {
  constructor(message: string, statusCode: number = 503) {
    super(message, statusCode, 'SPOTIFY_API_ERROR');
  }
}

export class OpenAiApiError extends AppError {
  constructor(message: string, statusCode: number = 503) {
    super(message, statusCode, 'OPENAI_API_ERROR');
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Default error response
  let statusCode = 500;
  let errorResponse: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  };

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    statusCode = 400;
    const fields: Record<string, string[]> = {};
    
    error.errors.forEach((err) => {
      const field = err.path.join('.');
      if (!fields[field]) {
        fields[field] = [];
      }
      fields[field].push(err.message);
    });

    const validationError: ValidationError = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields,
      timestamp: new Date().toISOString(),
    };

    errorResponse = validationError;
  }
  
  // Handle custom application errors
  else if (error instanceof ValidationAppError) {
    statusCode = error.statusCode;
    const validationError: ValidationError = {
      code: 'VALIDATION_ERROR' as const,
      message: error.message,
      fields: error.fields,
      timestamp: new Date().toISOString(),
    };
    errorResponse = validationError;
  }
  
  // Handle other custom application errors
  else if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorResponse = {
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
    };

    // Add retry-after header for rate limit errors
    if (error instanceof RateLimitError) {
      res.set('Retry-After', error.retryAfter.toString());
    }
  }
  
  // Handle JWT errors
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorResponse = {
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
      timestamp: new Date().toISOString(),
    };
  }
  
  // Handle JWT expiration
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorResponse = {
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired',
      timestamp: new Date().toISOString(),
    };
  }
  
  // Handle MongoDB/Database errors
  else if (error.name === 'MongoError' || error.name === 'CastError') {
    statusCode = 400;
    errorResponse = {
      code: 'DATABASE_ERROR',
      message: 'Database operation failed',
      timestamp: new Date().toISOString(),
    };
  }

  // Log the error
  logError('Request error', error, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode,
    userId: (req as any).user?.id,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: errorResponse.message,
    code: errorResponse.code,
    timestamp: errorResponse.timestamp,
    ...(errorResponse as any).fields && { fields: (errorResponse as any).fields },
    ...(process.env['NODE_ENV'] === 'development' && { 
      stack: error.stack,
      details: error 
    }),
  });
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  const error = new NotFoundError(`Route ${_req.originalUrl} not found`);
  next(error);
};

// Global uncaught exception handler
process.on('uncaughtException', (error: Error) => {
  logError('Uncaught Exception', error);
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  process.exit(1);
});

// Global unhandled rejection handler
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logError('Unhandled Rejection', new Error(reason), { promise });
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  process.exit(1);
});
