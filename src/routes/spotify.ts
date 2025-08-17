import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticateToken, requireSpotify, optionalAuth } from '@/middleware/auth';
import { spotifyService } from '@/services/spotify';
import { authService } from '@/services/auth';
import { db } from '@/services/database';
import { logUserActivity } from '@/utils/logger';
import { 
  TrackSearchRequest,
  TrackSearchResponse,
  SpotifyAuthRequest 
} from '@/types/api';

const router = Router();

/**
 * @route   GET /spotify/auth-url
 * @desc    Get Spotify authorization URL for OAuth flow
 * @access  Public
 */
router.get('/auth-url', asyncHandler(async (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = spotifyService.getAuthorizationUrl(state);

  res.json({
    success: true,
    data: {
      authUrl,
      state,
    },
    message: 'Spotify authorization URL generated',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /spotify/callback
 * @desc    Handle Spotify OAuth callback and link account
 * @access  Private
 */
router.post('/callback', authenticateToken, asyncHandler(async (req, res) => {
  const { code, state }: SpotifyAuthRequest = req.body;
  const userId = req.user.id;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Authorization code required',
      timestamp: new Date().toISOString(),
    });
  }

  // Exchange code for tokens
  const tokens = await spotifyService.exchangeCodeForTokens(code);
  
  // Get user's Spotify profile
  const profile = await spotifyService.getUserProfile(tokens.access_token);
  
  // Calculate token expiry
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  // Link Spotify account to user
  const updatedUser = await authService.linkSpotifyAccount(userId, {
    spotifyId: profile.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token!,
    expiresAt,
  });

  logUserActivity(userId, 'spotify_account_linked', {
    spotifyId: profile.id,
    spotifyDisplayName: profile.display_name,
  });

  res.json({
    success: true,
    data: {
      user: updatedUser,
      spotifyProfile: {
        id: profile.id,
        displayName: profile.display_name,
        followers: profile.followers.total,
        country: profile.country,
        product: profile.product,
      },
    },
    message: 'Spotify account linked successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /spotify/refresh-token
 * @desc    Refresh user's Spotify access token
 * @access  Private (requires Spotify integration)
 */
router.post('/refresh-token', requireSpotify, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = req.user;

  if (!user.spotifyRefreshToken) {
    return res.status(400).json({
      success: false,
      error: 'No refresh token available',
      code: 'MISSING_REFRESH_TOKEN',
      timestamp: new Date().toISOString(),
    });
  }

  // Refresh the token
  const tokens = await spotifyService.refreshUserToken(user.spotifyRefreshToken);
  
  // Update user's tokens in database
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db.updateUserSpotifyTokens(userId, {
    spotifyAccessToken: tokens.access_token,
    spotifyRefreshToken: tokens.refresh_token || user.spotifyRefreshToken,
    spotifyExpiresAt: expiresAt,
  });

  logUserActivity(userId, 'spotify_token_refreshed', {});

  res.json({
    success: true,
    data: {
      expiresIn: tokens.expires_in,
      expiresAt: expiresAt.toISOString(),
    },
    message: 'Spotify token refreshed successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /spotify/search/tracks
 * @desc    Search for tracks on Spotify
 * @access  Public (but better results with auth)
 */
router.get('/search/tracks', optionalAuth, asyncHandler(async (req, res) => {
  const { 
    q: query, 
    limit = 20, 
    offset = 0 
  }: TrackSearchRequest = req.query as any;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Search query required',
      timestamp: new Date().toISOString(),
    });
  }

  const parsedLimit = Math.min(parseInt(limit as string) || 20, 50);
  const parsedOffset = parseInt(offset as string) || 0;

  // Search tracks
  const searchResults = await spotifyService.searchTracks(
    query as string,
    parsedLimit,
    parsedOffset
  );

  // Track analytics
  if (req.user) {
    await db.trackEvent('track_search', {
      query: (query as string).substring(0, 100), // Truncate for privacy
      resultCount: searchResults.tracks.items.length,
      userId: req.user.id,
    }, req.user.id);
  }

  const response: TrackSearchResponse = {
    tracks: searchResults.tracks.items.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map(artist => ({
        id: artist.id,
        name: artist.name,
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        releaseDate: track.album.release_date,
        images: track.album.images,
      },
      duration: Math.floor(track.duration_ms / 1000),
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
      popularity: track.popularity,
    })),
    total: searchResults.tracks.total,
    limit: parsedLimit,
    offset: parsedOffset,
  };

  res.json({
    success: true,
    data: response,
    message: `Found ${searchResults.tracks.items.length} tracks`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /spotify/tracks/:trackId
 * @desc    Get detailed track information
 * @access  Public
 */
router.get('/tracks/:trackId', asyncHandler(async (req, res) => {
  const { trackId } = req.params;

  if (!trackId) {
    return res.status(400).json({
      success: false,
      error: 'Track ID required',
      timestamp: new Date().toISOString(),
    });
  }

  const track = await spotifyService.getTrack(trackId);

  res.json({
    success: true,
    data: {
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: track.album,
      duration: Math.floor(track.duration_ms / 1000),
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
      popularity: track.popularity,
      explicit: track.explicit,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /spotify/tracks/batch
 * @desc    Get multiple tracks by IDs
 * @access  Public
 */
router.post('/tracks/batch', asyncHandler(async (req, res) => {
  const { trackIds } = req.body;

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Array of track IDs required',
      timestamp: new Date().toISOString(),
    });
  }

  if (trackIds.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 50 track IDs allowed per request',
      timestamp: new Date().toISOString(),
    });
  }

  const tracks = await spotifyService.getTracks(trackIds);

  res.json({
    success: true,
    data: tracks.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: track.album,
      duration: Math.floor(track.duration_ms / 1000),
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
      popularity: track.popularity,
    })),
    message: `Retrieved ${tracks.length} tracks`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /spotify/audio-features/:trackId
 * @desc    Get audio features for a track (core of recommendation engine)
 * @access  Public
 */
router.get('/audio-features/:trackId', asyncHandler(async (req, res) => {
  const { trackId } = req.params;

  if (!trackId) {
    return res.status(400).json({
      success: false,
      error: 'Track ID required',
      timestamp: new Date().toISOString(),
    });
  }

  const audioFeatures = await spotifyService.getAudioFeatures(trackId);

  res.json({
    success: true,
    data: audioFeatures,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /spotify/audio-features/batch
 * @desc    Get audio features for multiple tracks
 * @access  Public
 */
router.post('/audio-features/batch', asyncHandler(async (req, res) => {
  const { trackIds } = req.body;

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Array of track IDs required',
      timestamp: new Date().toISOString(),
    });
  }

  if (trackIds.length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 100 track IDs allowed per request',
      timestamp: new Date().toISOString(),
    });
  }

  const audioFeatures = await spotifyService.getMultipleAudioFeatures(trackIds);

  res.json({
    success: true,
    data: audioFeatures,
    message: `Retrieved audio features for ${audioFeatures.length} tracks`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /spotify/playlist/create
 * @desc    Create a Spotify playlist from Vybe recommendations
 * @access  Private (requires Spotify integration)
 */
router.post('/playlist/create', requireSpotify, asyncHandler(async (req, res) => {
  const { name, description, trackIds } = req.body;
  const userId = req.user.id;
  const spotifyUserId = req.user.spotifyId;
  const accessToken = req.user.spotifyAccessToken;

  if (!name || !trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Playlist name and track IDs required',
      timestamp: new Date().toISOString(),
    });
  }

  // Create playlist
  const playlist = await spotifyService.createPlaylist(
    accessToken,
    spotifyUserId,
    name,
    description
  );

  // Add tracks to playlist
  const trackUris = trackIds.map((id: string) => `spotify:track:${id}`);
  await spotifyService.addTracksToPlaylist(
    accessToken,
    playlist.id,
    trackUris
  );

  logUserActivity(userId, 'playlist_created', {
    playlistId: playlist.id,
    trackCount: trackIds.length,
  });

  // Track analytics
  await db.trackEvent('playlist_created', {
    playlistId: playlist.id,
    trackCount: trackIds.length,
    userId,
  }, userId);

  res.json({
    success: true,
    data: {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        spotifyUrl: playlist.external_urls.spotify,
        trackCount: trackIds.length,
      },
    },
    message: 'Playlist created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /spotify/profile
 * @desc    Get user's Spotify profile information
 * @access  Private (requires Spotify integration)
 */
router.get('/profile', requireSpotify, asyncHandler(async (req, res) => {
  const accessToken = req.user.spotifyAccessToken;

  const profile = await spotifyService.getUserProfile(accessToken);

  res.json({
    success: true,
    data: {
      id: profile.id,
      displayName: profile.display_name,
      email: profile.email,
      followers: profile.followers.total,
      images: profile.images,
      country: profile.country,
      product: profile.product,
    },
    timestamp: new Date().toISOString(),
  });
}));

export { router as spotifyRoutes };
