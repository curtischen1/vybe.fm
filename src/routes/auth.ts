import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticateToken } from '@/middleware/auth';
import { authService } from '@/services/auth';
import { logUserActivity } from '@/utils/logger';
import { 
  RegisterRequest, 
  LoginRequest, 
  SpotifyAuthRequest
} from '@/types/api';

const router = Router();

/**
 * @route   POST /auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password }: RegisterRequest = req.body;

  // Register user with auth service
  const result = await authService.register(email, password);

  // TODO: Handle Spotify OAuth if code provided
  // if (spotifyCode) {
  //   // Exchange code for tokens and link account
  // }

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
    },
    message: 'User registered successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /auth/login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password }: LoginRequest = req.body;

  // Authenticate user with auth service
  const result = await authService.login(email, password);

  res.json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
    },
    message: 'Login successful',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /auth/spotify/callback
 * @desc    Handle Spotify OAuth callback
 * @access  Public
 */
router.post('/spotify/callback', asyncHandler(async (req, res): Promise<any> => {
  const { code }: SpotifyAuthRequest = req.body;

  // TODO: Implement Spotify OAuth callback
  // - Exchange code for access token
  // - Get user's Spotify profile
  // - Link Spotify account to user
  // - Store Spotify tokens securely

  logUserActivity('spotify_integration', 'oauth_callback', { hasCode: !!code });

  res.json({
    success: true,
    message: 'Spotify account linked successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /auth/refresh
 * @desc    Refresh JWT access token
 * @access  Public (with refresh token)
 */
router.post('/refresh', asyncHandler(async (req, res): Promise<any> => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token required',
      timestamp: new Date().toISOString(),
    });
  }

  // Refresh token with auth service
  const tokens = await authService.refreshAccessToken(refreshToken);

  res.json({
    success: true,
    data: tokens,
    message: 'Token refreshed successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   POST /auth/logout
 * @desc    Logout user and invalidate tokens
 * @access  Private
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Logout user with auth service
  await authService.logout(userId);

  res.json({
    success: true,
    message: 'Logged out successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @route   GET /auth/spotify/url
 * @desc    Get Spotify authorization URL
 * @access  Public
 */
router.get('/spotify/url', asyncHandler(async (_req, res): Promise<any> => {
  // TODO: Generate Spotify authorization URL
  // - Include required scopes
  // - Generate state parameter for security
  // - Return authorization URL

  const spotifyAuthUrl = 'https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI&scope=user-read-private%20user-read-email&state=random_state';

  res.json({
    success: true,
    data: {
      authUrl: spotifyAuthUrl,
      state: 'random_state',
    },
    message: 'Spotify authorization URL generated',
    timestamp: new Date().toISOString(),
  });
}));

export { router as authRoutes };
