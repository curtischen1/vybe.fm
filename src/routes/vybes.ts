import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();

// Placeholder for vybe routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Vybes routes - coming soon' });
}));

export { router as vybeRoutes };
