import express from 'express';
import { youtubeMusicService } from '@/services/youtubeMusic';
import { authenticateToken } from '@/middleware/auth';
import { logInfo, logError } from '@/utils/logger';
import {
  YouTubeMusicSearchRequest,
  YouTubeMusicSearchResponse,
  YouTubeStreamRequest,
  YouTubeStreamResponse,
  ApiResponse
} from '@/types/api';

const router = express.Router();

/**
 * Search for music tracks on YouTube
 * @route POST /api/v1/youtube/search
 * @desc Search YouTube for music tracks
 * @access Private
 */
router.post('/search', authenticateToken, async (req, res) => {
  try {
    const { artist, title, limit = 10 }: YouTubeMusicSearchRequest = req.body;

    if (!artist || !title) {
      return res.status(400).json({
        success: false,
        error: 'Artist and title are required',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    logInfo(`🔍 YouTube search request`, { artist, title, limit });

    const tracks = await youtubeMusicService.searchTracks({
      query: `${artist} ${title}`,
      limit,
      type: 'music'
    });

    const response: YouTubeMusicSearchResponse = {
      tracks,
      total: tracks.length
    };

    return res.json({
      success: true,
      data: response,
      message: `Found ${tracks.length} tracks`,
      timestamp: new Date().toISOString()
    } as ApiResponse<YouTubeMusicSearchResponse>);

  } catch (error) {
    logError('❌ YouTube search failed', error as Error, { 
      userId: req.user?.id,
      request: req.body 
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to search YouTube Music',
      timestamp: new Date().toISOString()
    } as ApiResponse);
  }
});

/**
 * Get streaming URL for a YouTube video
 * @route POST /api/v1/youtube/stream
 * @desc Get streaming URL for a YouTube video
 * @access Private
 */
router.post('/stream', authenticateToken, async (req, res) => {
  try {
    const { videoId }: YouTubeStreamRequest = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Video ID is required',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    logInfo(`🔗 YouTube stream request`, { videoId, userId: req.user?.id });

    const streamInfo = await youtubeMusicService.getStreamUrl(videoId);

    if (!streamInfo) {
      return res.status(404).json({
        success: false,
        error: 'Stream URL not found or video unavailable',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    const response: YouTubeStreamResponse = {
      streamUrl: streamInfo.url,
      quality: streamInfo.quality,
      format: streamInfo.format,
      expiresAt: streamInfo.expires.toISOString()
    };

    return res.json({
      success: true,
      data: response,
      message: 'Stream URL retrieved successfully',
      timestamp: new Date().toISOString()
    } as ApiResponse<YouTubeStreamResponse>);

  } catch (error) {
    logError('❌ YouTube stream failed', error as Error, { 
      userId: req.user?.id,
      videoId: req.body.videoId 
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get stream URL',
      timestamp: new Date().toISOString()
    } as ApiResponse);
  }
});

/**
 * Find a specific track by artist and title
 * @route POST /api/v1/youtube/find
 * @desc Find a specific track with stream URL
 * @access Private
 */
router.post('/find', authenticateToken, async (req, res) => {
  try {
    const { artist, title }: { artist: string; title: string } = req.body;

    if (!artist || !title) {
      return res.status(400).json({
        success: false,
        error: 'Artist and title are required',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    logInfo(`🎵 YouTube find track request`, { artist, title, userId: req.user?.id });

    const track = await youtubeMusicService.findTrack(artist, title);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    return res.json({
      success: true,
      data: track,
      message: 'Track found successfully',
      timestamp: new Date().toISOString()
    } as ApiResponse);

  } catch (error) {
    logError('❌ YouTube find track failed', error as Error, { 
      userId: req.user?.id,
      request: req.body 
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to find track',
      timestamp: new Date().toISOString()
    } as ApiResponse);
  }
});

/**
 * Get multiple tracks with stream URLs
 * @route POST /api/v1/youtube/batch
 * @desc Get multiple tracks with stream URLs
 * @access Private
 */
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const { tracks }: { tracks: { artist: string; title: string }[] } = req.body;

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tracks array is required',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    if (tracks.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 20 tracks per batch request',
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    logInfo(`🎵 YouTube batch request`, { 
      count: tracks.length, 
      userId: req.user?.id 
    });

    const results = await youtubeMusicService.getTracksWithStreams(tracks);

    return res.json({
      success: true,
      data: results,
      message: `Found ${results.length}/${tracks.length} tracks with stream URLs`,
      timestamp: new Date().toISOString()
    } as ApiResponse);

  } catch (error) {
    logError('❌ YouTube batch request failed', error as Error, { 
      userId: req.user?.id,
      trackCount: req.body.tracks?.length 
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process batch request',
      timestamp: new Date().toISOString()
    } as ApiResponse);
  }
});

/**
 * Get cache statistics
 * @route GET /api/v1/youtube/stats
 * @desc Get YouTube Music service cache statistics
 * @access Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = youtubeMusicService.getCacheStats();

    res.json({
      success: true,
      data: {
        cacheSize: stats.size,
        cacheExpired: stats.expired,
        timestamp: new Date().toISOString()
      },
      message: 'Cache statistics retrieved',
      timestamp: new Date().toISOString()
    } as ApiResponse);

  } catch (error) {
    logError('❌ YouTube stats failed', error as Error, { 
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      timestamp: new Date().toISOString()
    } as ApiResponse);
  }
});

export default router;
