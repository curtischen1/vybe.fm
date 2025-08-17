// API Request/Response Types for Vybe

// Axios metadata extension
declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Vybe-related types
export interface CreateVybeRequest {
  context: string;
  referenceTrackIds: string[];
  limit?: number;
}

export interface VybeResponse {
  id: string;
  userId: string;
  context: string;
  contextParsed: ContextWeights;
  referenceTrackIds: string[];
  recommendations: TrackRecommendation[];
  createdAt: string;
}

export interface ContextWeights {
  valence: number;        // -1 to 1 (sad to happy)
  energy: number;         // 0 to 1 (calm to energetic)
  danceability: number;   // 0 to 1 (not danceable to very danceable)
  acousticness: number;   // 0 to 1 (electric to acoustic)
  tempoModifier: number;  // 0.5 to 2.0 (slower to faster)
}

export interface TrackRecommendation {
  trackId: string;
  name: string;
  artists: string[];
  album: string;
  previewUrl: string | null;
  spotifyUrl: string;
  audioFeatures: SpotifyAudioFeatures;
  confidence: number;     // 0 to 1
  reasoning?: string;
}

export interface SpotifyAudioFeatures {
  id?: string;
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
  tempo: number;
  loudness: number;
  mode: number;
  key: number;
  time_signature: number;
  duration_ms?: number;
}

// Feedback types
export interface FeedbackRequest {
  trackId: string;
  feedbackType: 'upvote' | 'downvote' | 'skip';
  playTime?: number;
}

export interface FeedbackResponse {
  id: string;
  vybeId: string;
  trackId: string;
  feedbackType: string;
  playTime?: number;
  createdAt: string;
}

// User types
export interface UserProfile {
  id: string;
  email: string;
  spotifyId?: string;
  createdAt: string;
  preferences: UserPreferences;
  stats: UserStats;
}

export interface UserPreferences {
  contextPreferences: Record<string, ContextPreference>;
  overallPreferences: {
    favoriteArtists: string[];
    preferredGenres: string[];
    audioFeatureTendencies: Partial<SpotifyAudioFeatures>;
  };
}

export interface ContextPreference {
  preferredGenres: string[];
  audioFeaturePreferences: Partial<SpotifyAudioFeatures>;
  avgFeedbackScore: number;
  totalInteractions: number;
}

export interface UserStats {
  totalVybes: number;
  totalFeedback: number;
  avgRecommendationAccuracy: number;
  favoriteContexts: string[];
  joinedAt: string;
}

// Authentication types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  spotifyCode?: string;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SpotifyAuthRequest {
  code: string;
  state?: string;
}

export interface SpotifyAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface SpotifyProfileResponse {
  id: string;
  displayName?: string;
  email?: string;
  followers: number;
  images: SpotifyImage[];
  country: string;
  product: string;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

export interface ValidationError extends ApiError {
  code: 'VALIDATION_ERROR';
  fields: Record<string, string[]>;
}

export interface RateLimitError extends ApiError {
  code: 'RATE_LIMIT_EXCEEDED';
  retryAfter: number;
}

// Search types
export interface TrackSearchRequest {
  q: string;
  limit?: number;
  offset?: number;
}

export interface TrackSearchResponse {
  tracks: SpotifyTrack[];
  total: number;
  limit: number;
  offset: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration: number;
  previewUrl?: string | undefined;
  spotifyUrl: string;
  popularity: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  releaseDate: string;
  images: SpotifyImage[];
}

export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

// Insights types
export interface UserInsights {
  musicDna: MusicDnaInsights;
  patterns: UserPatterns;
  recommendations: InsightRecommendations;
}

export interface MusicDnaInsights {
  dominantMoods: Array<{
    mood: string;
    percentage: number;
    contexts: string[];
  }>;
  audioFeatureProfile: SpotifyAudioFeatures;
  genreDistribution: Array<{
    genre: string;
    percentage: number;
  }>;
}

export interface UserPatterns {
  contextCorrelations: Array<{
    context: string;
    preferredFeatures: Partial<SpotifyAudioFeatures>;
    successRate: number;
  }>;
  timeBasedPatterns: Array<{
    timeOfDay: string;
    preferredGenres: string[];
    avgEnergy: number;
  }>;
  socialPatterns: Array<{
    socialContext: string;
    musicPreferences: Partial<SpotifyAudioFeatures>;
  }>;
}

export interface InsightRecommendations {
  suggestedContexts: string[];
  artistsToExplore: string[];
  genreRecommendations: string[];
}
