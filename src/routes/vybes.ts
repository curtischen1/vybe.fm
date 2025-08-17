import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticateToken, optionalAuth, userRateLimit } from '@/middleware/auth';
import { recommendationEngine } from '@/services/recommendationEngine';
import { db } from '@/services/database';
import { logUserActivity } from '@/utils/logger';
import { 
  CreateVybeRequest,
  VybeResponse,
  FeedbackRequest,
  PaginatedResponse 
} from '@/types/api';

const router = Router();

/**
 * @route   POST /vybes
 * @desc    Create a new Vybe (the main recommendation endpoint)
 * @access  Private
 */
router.post('/', 
  authenticateToken,
  userRateLimit(10, 15 * 60 * 1000), // 10 vybes per 15 minutes per user
  asyncHandler(async (req, res) => {
    const { context, referenceTrackIds, limit = 20 }: CreateVybeRequest = req.body;
    const userId = req.user.id;

    // Validate input
    if (!context || !context.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Context description is required',
        code: 'MISSING_CONTEXT',
        timestamp: new Date().toISOString(),
      });
    }

    if (!referenceTrackIds || !Array.isArray(referenceTrackIds) || referenceTrackIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one reference track is required',
        code: 'MISSING_REFERENCE_TRACKS',
        timestamp: new Date().toISOString(),
      });
    }

    if (referenceTrackIds.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 reference tracks allowed',
        code: 'TOO_MANY_REFERENCE_TRACKS',
        timestamp: new Date().toISOString(),
      });
    }

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 recommendations allowed',
        code: 'LIMIT_TOO_HIGH',
        timestamp: new Date().toISOString(),
      });
    }

    // Generate recommendations using our individual-based algorithm
    const result = await recommendationEngine.generateRecommendations({
      userId,
      contextText: context.trim(),
      referenceTrackIds,
      limit: Math.min(limit, 50),
    });

    logUserActivity(userId, 'vybe_created', {
      contextLength: context.length,
      referenceTrackCount: referenceTrackIds.length,
      recommendationCount: result.recommendations.length,
      processingTime: result.processingTime,
    });

    const vybeResponse: VybeResponse = {
      id: result.vybeId,
      userId,
      context: context.trim(),
      contextParsed: result.contextAnalysis.weights,
      referenceTrackIds,
      recommendations: result.recommendations,
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({
      success: true,
      data: vybeResponse,
      meta: {
        processingTime: result.processingTime,
        confidence: result.confidence,
        reasoning: result.reasoning,
        contextAnalysis: {
          mood: result.contextAnalysis.mood,
          energy: result.contextAnalysis.energy,
          genres: result.contextAnalysis.musicGenres,
          socialContext: result.contextAnalysis.socialContext,
          activityType: result.contextAnalysis.activityType,
        },
      },
      message: `Generated ${result.recommendations.length} personalized recommendations`,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * @route   GET /vybes
 * @desc    Get user's vybe history
 * @access  Private
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const result = await db.getUserVybes(userId, page, limit);

  const response: PaginatedResponse<VybeResponse> = {
    success: true,
    data: result.vybes.map(vybe => ({
      id: vybe.id,
      userId: vybe.userId,
      context: vybe.contextRaw,
      contextParsed: JSON.parse(vybe.contextParsed as string),
      referenceTrackIds: JSON.parse(vybe.referenceTrackIds as string),
      recommendations: JSON.parse(vybe.recommendations as string),
      createdAt: vybe.createdAt.toISOString(),
    })),
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      pages: result.pages,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
    },
    timestamp: new Date().toISOString(),
  };

  res.json(response);
}));

/**
 * @route   GET /vybes/stats
 * @desc    Get user's recommendation statistics
 * @access  Private
 */
router.get('/stats', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [totalVybes, totalFeedback, recentFeedback] = await Promise.all([
    db.client.vybe.count({ where: { userId } }),
    db.client.feedback.count({ where: { userId } }),
    db.client.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  // Calculate recommendation accuracy from individual feedback
  const positiveCount = recentFeedback.filter(f => f.feedbackType === 'UPVOTE').length;
  const negativeCount = recentFeedback.filter(f => f.feedbackType === 'DOWNVOTE').length;
  const totalRated = positiveCount + negativeCount;
  const accuracy = totalRated > 0 ? positiveCount / totalRated : 0;

  res.json({
    success: true,
    data: {
      totalVybes,
      totalFeedback,
      recommendationAccuracy: Math.round(accuracy * 100),
      recentActivity: {
        upvotes: positiveCount,
        downvotes: negativeCount,
        skips: recentFeedback.filter(f => f.feedbackType === 'SKIP').length,
      },
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /vybes/:vybeId
 * @desc    Get specific vybe details
 * @access  Private (own vybes only)
 */
router.get('/:vybeId', authenticateToken, asyncHandler(async (req, res) => {
  const { vybeId } = req.params;
  const userId = req.user.id;

  const vybe = await db.client.vybe.findFirst({
    where: {
      id: vybeId,
      userId, // Ensure user can only access their own vybes
    },
    include: {
      feedback: true,
    },
  });

  if (!vybe) {
    return res.status(404).json({
      success: false,
      error: 'Vybe not found',
      code: 'VYBE_NOT_FOUND',
      timestamp: new Date().toISOString(),
    });
  }

  const vybeResponse: VybeResponse = {
    id: vybe.id,
    userId: vybe.userId,
    context: vybe.contextRaw,
    contextParsed: JSON.parse(vybe.contextParsed as string),
    referenceTrackIds: JSON.parse(vybe.referenceTrackIds as string),
    recommendations: JSON.parse(vybe.recommendations as string),
    createdAt: vybe.createdAt.toISOString(),
  };

  res.json({
    success: true,
    data: vybeResponse,
    meta: {
      feedbackCount: vybe.feedback.length,
      processingTime: vybe.processingTimeMs,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /vybes/:vybeId/feedback
 * @desc    Provide feedback on a recommendation (core learning mechanism)
 * @access  Private
 */
router.post('/:vybeId/feedback', authenticateToken, asyncHandler(async (req, res) => {
  const { vybeId } = req.params;
  const { trackId, feedbackType, playTime }: FeedbackRequest = req.body;
  const userId = req.user.id;

  // Validate input
  if (!trackId || !feedbackType) {
    return res.status(400).json({
      success: false,
      error: 'Track ID and feedback type are required',
      timestamp: new Date().toISOString(),
    });
  }

  if (!['upvote', 'downvote', 'skip'].includes(feedbackType)) {
    return res.status(400).json({
      success: false,
      error: 'Feedback type must be upvote, downvote, or skip',
      timestamp: new Date().toISOString(),
    });
  }

  // Verify vybe belongs to user
  const vybe = await db.client.vybe.findFirst({
    where: {
      id: vybeId,
      userId,
    },
  });

  if (!vybe) {
    return res.status(404).json({
      success: false,
      error: 'Vybe not found',
      timestamp: new Date().toISOString(),
    });
  }

  // Create feedback record (individual learning data)
  const feedback = await db.createFeedback({
    vybeId,
    userId,
    trackId,
    feedbackType: feedbackType.toUpperCase() as 'UPVOTE' | 'DOWNVOTE' | 'SKIP',
    playTime,
  });

  logUserActivity(userId, 'feedback_provided', {
    vybeId,
    trackId,
    feedbackType,
    playTime,
  });

  // Track analytics for individual learning
  await db.trackEvent('recommendation_feedback', {
    vybeId,
    trackId,
    feedbackType,
    playTime,
    userId,
  }, userId);

  res.status(201).json({
    success: true,
    data: {
      id: feedback.id,
      vybeId,
      trackId,
      feedbackType,
      playTime,
      createdAt: feedback.createdAt.toISOString(),
    },
    message: 'Feedback recorded - improving your personal recommendations',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /vybes/:vybeId/feedback
 * @desc    Get feedback for a specific vybe
 * @access  Private
 */
router.get('/:vybeId/feedback', authenticateToken, asyncHandler(async (req, res) => {
  const { vybeId } = req.params;
  const userId = req.user.id;

  // Verify vybe belongs to user
  const vybe = await db.client.vybe.findFirst({
    where: {
      id: vybeId,
      userId,
    },
  });

  if (!vybe) {
    return res.status(404).json({
      success: false,
      error: 'Vybe not found',
      timestamp: new Date().toISOString(),
    });
  }

  const feedback = await db.client.feedback.findMany({
    where: { vybeId },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: feedback.map(f => ({
      id: f.id,
      trackId: f.trackId,
      feedbackType: f.feedbackType.toLowerCase(),
      playTime: f.playTime,
      createdAt: f.createdAt.toISOString(),
    })),
    timestamp: new Date().toISOString(),
  });
}));

export { router as vybeRoutes };
