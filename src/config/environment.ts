import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),
  
  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  // Spotify API
  SPOTIFY_CLIENT_ID: z.string(),
  SPOTIFY_CLIENT_SECRET: z.string(),
  SPOTIFY_REDIRECT_URI: z.string().url(),
  
  // Claude API (replacing OpenAI)
  CLAUDE_API_KEY: z.string(),
  CLAUDE_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  CLAUDE_MAX_TOKENS: z.string().transform(Number).default('800'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
  
  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // Security
  BCRYPT_SALT_ROUNDS: z.string().transform(Number).default('12'),
  SESSION_SECRET: z.string().min(32),
  
  // Cache
  CACHE_TTL_SECONDS: z.string().transform(Number).default('3600'),
  CONTEXT_CACHE_TTL_SECONDS: z.string().transform(Number).default('86400'),
  
  // API Timeouts
  SPOTIFY_API_TIMEOUT: z.string().transform(Number).default('5000'),
  CLAUDE_API_TIMEOUT: z.string().transform(Number).default('10000'),
});

// Validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:');
  if (error instanceof z.ZodError) {
    console.error(error.errors);
  }
  process.exit(1);
}

// Export typed configuration
export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  apiVersion: env.API_VERSION,
  
  // Database
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL || undefined,
  
  // JWT
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  
  // Spotify
  spotify: {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
    timeout: env.SPOTIFY_API_TIMEOUT,
  },
  
  // Claude
  claude: {
    apiKey: env.CLAUDE_API_KEY,
    model: env.CLAUDE_MODEL,
    maxTokens: env.CLAUDE_MAX_TOKENS,
    timeout: env.CLAUDE_API_TIMEOUT,
  },
  
  // Rate Limiting
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  
  // Logging
  logLevel: env.LOG_LEVEL,
  logFilePath: env.LOG_FILE_PATH,
  
  // CORS
  allowedOrigins: env.ALLOWED_ORIGINS.split(','),
  
  // Security
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  sessionSecret: env.SESSION_SECRET,
  
  // Cache
  cacheTtlSeconds: env.CACHE_TTL_SECONDS,
  contextCacheTtlSeconds: env.CONTEXT_CACHE_TTL_SECONDS,
  
  // Development flags
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
} as const;

// Validate critical configuration at startup
export function validateConfig(): void {
  const requiredConfigs = [
    { name: 'DATABASE_URL', value: config.databaseUrl },
    { name: 'JWT_SECRET', value: config.jwtSecret },
    { name: 'SPOTIFY_CLIENT_ID', value: config.spotify.clientId },
    { name: 'CLAUDE_API_KEY', value: config.claude.apiKey },
  ];

  const missing = requiredConfigs.filter(({ value }) => !value);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(({ name }) => console.error(`  - ${name}`));
    process.exit(1);
  }

  console.log('✅ Configuration validated successfully');
}
