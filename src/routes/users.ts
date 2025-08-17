import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();

// Placeholder for user routes
router.get('/profile', asyncHandler(async (req, res) => {
  res.json({ message: 'User profile - coming soon' });
}));

export { router as userRoutes };
