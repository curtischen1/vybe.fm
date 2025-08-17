import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';

const app = express();

// Security middleware with relaxed CSP for frontend
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https:", "http:"], // Allow external images
      connectSrc: ["'self'", "https:"]
    }
  }
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'vybe-api',
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎵 Vybe API is running!',
    status: 'online',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      spotify: '/api/v1/spotify',
      vybes: '/api/v1/vybes', 
      auth: '/api/v1/auth'
    }
  });
});

// Spotify Auth URL endpoint
app.get('/api/v1/spotify/auth-url', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/spotify/callback';
  
  if (!clientId) {
    return res.status(500).json({ 
      error: 'Spotify client ID not configured',
      message: 'SPOTIFY_CLIENT_ID environment variable is missing'
    });
  }

  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read'
  ].join(' ');

  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}`;

  res.json({
    authUrl,
    message: 'Redirect user to this URL for Spotify authentication'
  });
});

// Simple Vybe creation endpoint (without full algorithm for now)
app.post('/api/v1/vybes', (req, res) => {
  const { context, referenceTrackIds } = req.body;
  
  if (!context) {
    return res.status(400).json({
      error: 'Missing context',
      message: 'Please provide a context describing your vybe'
    });
  }

  // Placeholder response - we'll enhance this with the full algorithm
  res.json({
    id: `vybe_${Date.now()}`,
    context,
    referenceTrackIds: referenceTrackIds || [],
    recommendations: [
      {
        id: 'demo_track_1',
        name: 'Demo Track 1',
        artists: [{ name: 'Demo Artist' }],
        contextMatch: 0.85,
        confidence: 0.92
      }
    ],
    message: 'Vybe created! (Demo mode - full algorithm coming soon)',
    timestamp: new Date().toISOString()
  });
});

// Environment check endpoint
app.get('/api/v1/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    hasSpotifyConfig: !!process.env.SPOTIFY_CLIENT_ID,
    hasClaudeConfig: !!process.env.CLAUDE_API_KEY,
    hasDatabaseConfig: !!process.env.DATABASE_URL,
    timestamp: new Date().toISOString()
  });
});

// Catch-all handler: send back the index.html file for client-side routing
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve the frontend
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

export default app;
