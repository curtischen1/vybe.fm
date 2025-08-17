import { Request, Response, NextFunction } from 'express';
import { authService } from '@/services/auth';
import { UnauthorizedError } from '@/middleware/errorHandler';
import { logSecurityEvent } from '@/utils/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      token?: string;
    }
  }
}

/**
 * Authentication middleware - verifies JWT token and attaches user to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logSecurityEvent('missing_auth_token', 'low', {
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new UnauthorizedError('Access token required');
    }

    // Verify token and get user
    const user = await authService.getUserFromToken(token);
    
    // Attach user and token to request
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    logSecurityEvent('auth_token_verification_failed', 'medium', {
      path: req.path,
      ip: req.ip,
      error: error.message,
    });
    next(error);
  }
};

/**
 * Optional authentication middleware - attaches user if token is present
 * but doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        req.user = user;
        req.token = token;
      } catch (error) {
        // Log but don't fail for optional auth
        logSecurityEvent('optional_auth_failed', 'low', {
          path: req.path,
          ip: req.ip,
          error: error.message,
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to require Spotify integration
 */
export const requireSpotify = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!req.user.spotifyId) {
    logSecurityEvent('spotify_integration_required', 'low', {
      userId: req.user.id,
      path: req.path,
    });
    
    res.status(400).json({
      success: false,
      error: 'Spotify integration required',
      code: 'SPOTIFY_INTEGRATION_REQUIRED',
      message: 'Please link your Spotify account to use this feature',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};

/**
 * Role-based access control middleware
 * (For future use when we add admin roles)
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // For now, all users have the same role
    // In the future, you might add a role field to the User model
    const userRole = 'user'; // req.user.role

    if (!roles.includes(userRole)) {
      logSecurityEvent('insufficient_permissions', 'medium', {
        userId: req.user.id,
        requiredRoles: roles,
        userRole,
        path: req.path,
      });
      
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
};

/**
 * Rate limiting by user ID
 */
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // If no user, fall back to IP-based rate limiting (handled by global rate limiter)
      next();
      return;
    }

    const userId = req.user.id;
    const now = Date.now();
    const userRequests = requestCounts.get(userId);

    if (!userRequests || now > userRequests.resetTime) {
      // Reset window
      requestCounts.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (userRequests.count >= maxRequests) {
      logSecurityEvent('user_rate_limit_exceeded', 'medium', {
        userId,
        path: req.path,
        requestCount: userRequests.count,
        maxRequests,
      });

      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'USER_RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 1000} seconds`,
        retryAfter: Math.ceil((userRequests.resetTime - now) / 1000),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Increment count
    userRequests.count++;
    requestCounts.set(userId, userRequests);
    
    next();
  };
};

/**
 * Middleware to validate user owns resource
 */
export const validateResourceOwnership = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Get resource user ID from request params, query, or body
    const resourceUserId = req.params[resourceUserIdField] || 
                          req.query[resourceUserIdField] || 
                          req.body[resourceUserIdField];

    if (!resourceUserId) {
      res.status(400).json({
        success: false,
        error: 'Resource user ID required',
        code: 'MISSING_RESOURCE_USER_ID',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.user.id !== resourceUserId) {
      logSecurityEvent('unauthorized_resource_access', 'high', {
        userId: req.user.id,
        attemptedResourceUserId: resourceUserId,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'RESOURCE_ACCESS_DENIED',
        message: 'You can only access your own resources',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
};

/**
 * Security headers middleware
 */
export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

export default {
  authenticateToken,
  optionalAuth,
  requireSpotify,
  requireRole,
  userRateLimit,
  validateResourceOwnership,
  securityHeaders,
};
