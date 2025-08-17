import winston from 'winston';
import { config } from '@/config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'vybe-api',
    version: process.env.npm_package_version || '0.1.0',
  },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: config.logFilePath.replace('.log', '-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: config.logFilePath,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (config.isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Log levels: error, warn, info, debug
export const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

// Helper functions for structured logging
export const logError = (message: string, error?: Error, meta?: any) => {
  logger.error(message, {
    error: error?.message,
    stack: error?.stack,
    ...meta,
  });
};

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

// Performance logging helper
export const logPerformance = (
  operation: string,
  startTime: number,
  meta?: any
) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...meta,
  });
};

// API request logging helper
export const logApiRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  meta?: any
) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `API ${method} ${url}`, {
    statusCode,
    duration: `${duration}ms`,
    ...meta,
  });
};

// Spotify API logging
export const logSpotifyApi = (
  operation: string,
  success: boolean,
  meta?: any
) => {
  const level = success ? 'info' : 'warn';
  logger.log(level, `Spotify API: ${operation}`, {
    success,
    ...meta,
  });
};

// OpenAI API logging
export const logOpenAiApi = (
  operation: string,
  tokens: number,
  cost: number,
  meta?: any
) => {
  logger.info(`OpenAI API: ${operation}`, {
    tokens,
    estimatedCost: `$${cost.toFixed(4)}`,
    ...meta,
  });
};

// User activity logging
export const logUserActivity = (
  userId: string,
  activity: string,
  meta?: any
) => {
  logger.info(`User Activity: ${activity}`, {
    userId,
    ...meta,
  });
};

// Database operation logging
export const logDatabaseOperation = (
  operation: string,
  table: string,
  duration: number,
  meta?: any
) => {
  logger.debug(`DB ${operation}: ${table}`, {
    duration: `${duration}ms`,
    ...meta,
  });
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  meta?: any
) => {
  const level = severity === 'critical' ? 'error' : 'warn';
  logger.log(level, `Security Event: ${event}`, {
    severity,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// Recommendation engine logging
export const logRecommendation = (
  userId: string,
  context: string,
  recommendationCount: number,
  processingTime: number,
  meta?: any
) => {
  logger.info('Recommendation generated', {
    userId,
    context: context.substring(0, 50) + '...', // Truncate for privacy
    recommendationCount,
    processingTime: `${processingTime}ms`,
    ...meta,
  });
};

export default logger;
