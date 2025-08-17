import express from 'express';

const app = express();

// Simple health check without dependencies
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'vybe-api',
    version: '0.1.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎵 Vybe API is running!',
    status: 'online',
    endpoints: {
      health: '/health',
      api: '/api/v1'
    }
  });
});

export default app;
