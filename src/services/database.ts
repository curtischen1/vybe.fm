import { PrismaClient } from '@prisma/client';
import { config } from '@/config/environment';
import { logger, logDatabaseOperation } from '@/utils/logger';

// Prisma Client singleton
class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: config.isDevelopment ? ['query', 'info', 'warn', 'error'] : ['error'],
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });

    // Add query logging middleware
    this.prisma.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      logDatabaseOperation(
        params.action,
        params.model || 'unknown',
        duration,
        {
          args: params.args,
        }
      );

      return result;
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public get client(): PrismaClient {
    return this.prisma;
  }

  // Connection management
  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database', error as Error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database', error as Error);
      throw error;
    }
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return false;
    }
  }

  // Transaction wrapper
  public async transaction<T>(
    fn: (prisma: any) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // User operations
  public async createUser(data: {
    email: string;
    spotifyId?: string;
    spotifyAccessToken?: string;
    spotifyRefreshToken?: string;
    spotifyExpiresAt?: Date;
  }) {
    return this.prisma.user.create({
      data: {
        ...data,
        preferences: {
          create: {}, // Create empty preferences
        },
        stats: {
          create: {}, // Create empty stats
        },
      },
      include: {
        preferences: true,
        stats: true,
      },
    });
  }

  public async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        preferences: true,
        stats: true,
      },
    });
  }

  public async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        preferences: true,
        stats: true,
      },
    });
  }

  public async updateUserSpotifyTokens(
    userId: string,
    tokens: {
      spotifyAccessToken: string;
      spotifyRefreshToken: string;
      spotifyExpiresAt: Date;
    }
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: tokens,
    });
  }

  // Vybe operations
  public async createVybe(data: {
    userId: string;
    contextRaw: string;
    contextParsed: any;
    referenceTrackIds: string[];
    recommendations: any[];
    processingTimeMs?: number;
    aiCostCents?: number;
  }) {
    return this.prisma.vybe.create({
      data: {
        ...data,
        referenceTrackIds: JSON.stringify(data.referenceTrackIds),
        recommendations: JSON.stringify(data.recommendations),
        contextParsed: JSON.stringify(data.contextParsed),
      },
    });
  }

  public async getUserVybes(
    userId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const offset = (page - 1) * limit;
    
    const [vybes, total] = await Promise.all([
      this.prisma.vybe.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          feedback: true,
        },
      }),
      this.prisma.vybe.count({ where: { userId } }),
    ]);

    return {
      vybes,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  // Feedback operations
  public async createFeedback(data: {
    vybeId: string;
    userId: string;
    trackId: string;
    feedbackType: 'UPVOTE' | 'DOWNVOTE' | 'SKIP';
    playTime?: number;
  }) {
    return this.prisma.feedback.create({
      data,
    });
  }

  public async getUserFeedbackForTrack(userId: string, trackId: string) {
    return this.prisma.feedback.findMany({
      where: {
        userId,
        trackId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Cache operations
  public async cacheTrack(trackId: string, trackData: any) {
    return this.prisma.trackCache.upsert({
      where: { id: trackId },
      update: {
        ...trackData,
        updatedAt: new Date(),
      },
      create: {
        id: trackId,
        ...trackData,
      },
    });
  }

  public async getCachedTrack(trackId: string) {
    return this.prisma.trackCache.findUnique({
      where: { id: trackId },
    });
  }

  public async cacheContext(contextRaw: string, contextParsed: any) {
    const contextHash = this.hashString(contextRaw);
    
    return this.prisma.contextCache.upsert({
      where: { contextHash },
      update: {
        hitCount: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        contextHash,
        contextRaw,
        contextParsed: JSON.stringify(contextParsed),
      },
    });
  }

  public async getCachedContext(contextRaw: string) {
    const contextHash = this.hashString(contextRaw);
    return this.prisma.contextCache.findUnique({
      where: { contextHash },
    });
  }

  // Analytics
  public async trackEvent(
    event: string,
    data: any,
    userId?: string,
    sessionId?: string
  ) {
    return this.prisma.analytics.create({
      data: {
        event,
        data: JSON.stringify(data),
        userId: userId || null,
        sessionId: sessionId || null,
      },
    });
  }

  // User preferences and stats updates
  public async updateUserPreferences(userId: string, preferences: any) {
    return this.prisma.userPreferences.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences,
      },
    });
  }

  public async updateUserStats(userId: string, stats: any) {
    return this.prisma.userStats.upsert({
      where: { userId },
      update: stats,
      create: {
        userId,
        ...stats,
      },
    });
  }

  // Utility methods
  private hashString(str: string): string {
    // Simple hash function for context caching
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // Cleanup operations
  public async cleanupOldData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Clean up old analytics
    await this.prisma.analytics.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    // Clean up unused context cache (hit count = 1 and old)
    await this.prisma.contextCache.deleteMany({
      where: {
        hitCount: 1,
        updatedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    logger.info('Database cleanup completed');
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();
export default db;
