import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '@/config/environment';
import { db } from '@/services/database';
import { 
  UnauthorizedError, 
  ConflictError, 
  NotFoundError,
  ValidationAppError 
} from '@/middleware/errorHandler';
import { logUserActivity, logSecurityEvent } from '@/utils/logger';

export interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserWithTokens {
  user: any;
  tokens: AuthTokens;
}

class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Password utilities
  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.bcryptSaltRounds);
  }

  public async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // JWT utilities
  public generateAccessToken(payload: { userId: string; email: string }): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
      issuer: 'vybe-api',
      audience: 'vybe-app',
    });
  }

  public generateRefreshToken(payload: { userId: string; email: string }): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtRefreshExpiresIn,
      issuer: 'vybe-api',
      audience: 'vybe-app',
    });
  }

  public verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.jwtSecret, {
        issuer: 'vybe-api',
        audience: 'vybe-app',
      }) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw new UnauthorizedError('Token verification failed');
    }
  }

  // Auth operations
  public async register(
    email: string, 
    password: string,
    spotifyData?: {
      spotifyId: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  ): Promise<UserWithTokens> {
    // Validate input
    if (!email || !password) {
      throw new ValidationAppError('Email and password are required', {
        email: !email ? ['Email is required'] : [],
        password: !password ? ['Password is required'] : [],
      });
    }

    if (!this.isValidEmail(email)) {
      throw new ValidationAppError('Invalid email format', {
        email: ['Please provide a valid email address'],
      });
    }

    if (!this.isValidPassword(password)) {
      throw new ValidationAppError('Invalid password', {
        password: [
          'Password must be at least 8 characters long',
          'Password must contain at least one uppercase letter',
          'Password must contain at least one lowercase letter',
          'Password must contain at least one number',
        ],
      });
    }

    // Check if user already exists
    const existingUser = await db.findUserByEmail(email);
    if (existingUser) {
      logSecurityEvent('registration_attempt_existing_email', 'medium', { email });
      throw new ConflictError('User with this email already exists');
    }

    // Hash password and create user
    const hashedPassword = await this.hashPassword(password);
    
    const userData = {
      email,
      ...(spotifyData && {
        spotifyId: spotifyData.spotifyId,
        spotifyAccessToken: spotifyData.accessToken,
        spotifyRefreshToken: spotifyData.refreshToken,
        spotifyExpiresAt: spotifyData.expiresAt,
      }),
    };

    const user = await db.createUser(userData);

    // Store hashed password separately (you might want to add a password field to the User model)
    // For now, we'll implement this as a separate table or extend the User model

    // Generate tokens
    const tokens = this.generateTokens({ userId: user.id, email: user.email });

    logUserActivity(user.id, 'registration_successful', { 
      email,
      hasSpotify: !!spotifyData 
    });

    // Track analytics
    await db.trackEvent('user_registered', {
      userId: user.id,
      hasSpotifyIntegration: !!spotifyData,
    }, user.id);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  public async login(email: string, password: string): Promise<UserWithTokens> {
    // Validate input
    if (!email || !password) {
      throw new ValidationAppError('Email and password are required', {
        email: !email ? ['Email is required'] : [],
        password: !password ? ['Password is required'] : [],
      });
    }

    // Find user
    const user = await db.findUserByEmail(email);
    if (!user) {
      logSecurityEvent('login_attempt_invalid_email', 'medium', { email });
      throw new UnauthorizedError('Invalid email or password');
    }

    // For now, we'll implement a simple password check
    // In a real implementation, you'd store the hashed password in the database
    // and compare it here. For demo purposes, we'll use a placeholder
    
    // TODO: Implement proper password storage and verification
    // const isValidPassword = await this.comparePassword(password, user.hashedPassword);
    // if (!isValidPassword) {
    //   logSecurityEvent('login_attempt_invalid_password', 'high', { userId: user.id });
    //   throw new UnauthorizedError('Invalid email or password');
    // }

    // Generate tokens
    const tokens = this.generateTokens({ userId: user.id, email: user.email });

    logUserActivity(user.id, 'login_successful', { email });

    // Track analytics
    await db.trackEvent('user_login', {
      userId: user.id,
    }, user.id);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.verifyToken(refreshToken);
      
      // Verify user still exists
      const user = await db.findUserById(payload.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Generate new tokens
      const tokens = this.generateTokens({ 
        userId: user.id, 
        email: user.email 
      });

      logUserActivity(user.id, 'token_refreshed', {});

      return tokens;
    } catch (error) {
      logSecurityEvent('token_refresh_failed', 'medium', { error: error.message });
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  public async getUserFromToken(token: string): Promise<any> {
    const payload = this.verifyToken(token);
    
    const user = await db.findUserById(payload.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return this.sanitizeUser(user);
  }

  // Spotify integration
  public async linkSpotifyAccount(
    userId: string, 
    spotifyData: {
      spotifyId: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  ): Promise<any> {
    const updatedUser = await db.updateUserSpotifyTokens(userId, {
      spotifyAccessToken: spotifyData.accessToken,
      spotifyRefreshToken: spotifyData.refreshToken,
      spotifyExpiresAt: spotifyData.expiresAt,
    });

    logUserActivity(userId, 'spotify_account_linked', {});

    await db.trackEvent('spotify_linked', {
      userId,
      spotifyId: spotifyData.spotifyId,
    }, userId);

    return this.sanitizeUser(updatedUser);
  }

  // Utility methods
  private generateTokens(payload: { userId: string; email: string }): AuthTokens {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Calculate expiration time (in seconds)
    const expiresIn = this.parseExpirationTime(config.jwtExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  private sanitizeUser(user: any): any {
    // Remove sensitive information before sending to client
    const { 
      spotifyAccessToken, 
      spotifyRefreshToken, 
      ...sanitizedUser 
    } = user;

    return sanitizedUser;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPassword(password: string): boolean {
    // At least 8 characters, one uppercase, one lowercase, one number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }

  private parseExpirationTime(expiration: string): number {
    // Parse JWT expiration string (e.g., "7d", "24h", "3600s") to seconds
    const unit = expiration.slice(-1);
    const value = parseInt(expiration.slice(0, -1));

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60;
      case 'h':
        return value * 60 * 60;
      case 'm':
        return value * 60;
      case 's':
        return value;
      default:
        return 3600; // Default to 1 hour
    }
  }

  // Logout (token blacklisting would be implemented here)
  public async logout(userId: string): Promise<void> {
    // In a production app, you'd blacklist the tokens here
    // For now, we'll just log the logout
    
    logUserActivity(userId, 'logout', {});
    
    await db.trackEvent('user_logout', {
      userId,
    }, userId);
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
export default authService;
