import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '@/config/environment';
import { db } from '@/services/database';
import { SpotifyApiError } from '@/middleware/errorHandler';
import { logSpotifyApi, logError, logPerformance } from '@/utils/logger';

// Spotify API Types
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  preview_url?: string;
  external_urls: {
    spotify: string;
  };
  popularity: number;
  explicit: boolean;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  popularity?: number;
  followers?: {
    total: number;
  };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  images: SpotifyImage[];
  artists: SpotifyArtist[];
}

export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyAudioFeatures {
  id: string;
  danceability: number;      // 0.0 - 1.0
  energy: number;            // 0.0 - 1.0
  key: number;               // 0 - 11 (pitch class)
  loudness: number;          // -60 - 0 db
  mode: number;              // 0 = minor, 1 = major
  speechiness: number;       // 0.0 - 1.0
  acousticness: number;      // 0.0 - 1.0
  instrumentalness: number;  // 0.0 - 1.0
  liveness: number;          // 0.0 - 1.0
  valence: number;           // 0.0 - 1.0 (sad to happy)
  tempo: number;             // BPM
  duration_ms: number;
  time_signature: number;    // 3, 4, 5, 6, 7
}

export interface SpotifySearchResponse {
  tracks: {
    href: string;
    items: SpotifyTrack[];
    limit: number;
    next?: string;
    offset: number;
    previous?: string;
    total: number;
  };
}

export interface SpotifyUserProfile {
  id: string;
  display_name?: string;
  email?: string;
  followers: {
    total: number;
  };
  images: SpotifyImage[];
  country: string;
  product: string;
}

class SpotifyService {
  private static instance: SpotifyService;
  private client: AxiosInstance;
  private clientCredentialsToken?: string;
  private clientCredentialsExpiry?: Date;

  private constructor() {
    this.client = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: config.spotify.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request/response interceptors for logging
    this.setupInterceptors();
  }

  public static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
    }
    return SpotifyService.instance;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        config.metadata = { startTime };
        return config;
      },
      (error) => {
        logError('Spotify request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const endTime = Date.now();
        const duration = endTime - response.config.metadata.startTime;
        
        logSpotifyApi(
          `${response.config.method?.toUpperCase()} ${response.config.url}`,
          true,
          {
            status: response.status,
            duration: `${duration}ms`,
          }
        );

        return response;
      },
      (error) => {
        const endTime = Date.now();
        const duration = error.config?.metadata?.startTime 
          ? endTime - error.config.metadata.startTime 
          : 0;

        logSpotifyApi(
          `${error.config?.method?.toUpperCase()} ${error.config?.url}`,
          false,
          {
            status: error.response?.status,
            duration: `${duration}ms`,
            error: error.response?.data,
          }
        );

        return Promise.reject(this.handleSpotifyError(error));
      }
    );
  }

  // Client Credentials Flow - for general API access
  public async getClientCredentialsToken(): Promise<string> {
    // Return cached token if still valid
    if (this.clientCredentialsToken && this.clientCredentialsExpiry && 
        new Date() < this.clientCredentialsExpiry) {
      return this.clientCredentialsToken;
    }

    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(
              `${config.spotify.clientId}:${config.spotify.clientSecret}`
            ).toString('base64')}`,
          },
          timeout: config.spotify.timeout,
        }
      );

      const { access_token, expires_in } = response.data;
      this.clientCredentialsToken = access_token;
      this.clientCredentialsExpiry = new Date(Date.now() + expires_in * 1000);

      logSpotifyApi('client_credentials_token_obtained', true, {
        expiresIn: expires_in,
      });

      return access_token;
    } catch (error) {
      logSpotifyApi('client_credentials_token_failed', false, { error });
      throw new SpotifyApiError('Failed to obtain Spotify client credentials');
    }
  }

  // Authorization Code Flow - for user-specific access
  public getAuthorizationUrl(state?: string): string {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-top-read',
    ];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotify.clientId,
      scope: scopes.join(' '),
      redirect_uri: config.spotify.redirectUri,
      ...(state && { state }),
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  public async exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.spotify.redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(
              `${config.spotify.clientId}:${config.spotify.clientSecret}`
            ).toString('base64')}`,
          },
          timeout: config.spotify.timeout,
        }
      );

      logSpotifyApi('authorization_code_exchange', true, {
        hasRefreshToken: !!response.data.refresh_token,
      });

      return response.data;
    } catch (error) {
      logSpotifyApi('authorization_code_exchange_failed', false, { error });
      throw new SpotifyApiError('Failed to exchange authorization code');
    }
  }

  public async refreshUserToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(
              `${config.spotify.clientId}:${config.spotify.clientSecret}`
            ).toString('base64')}`,
          },
          timeout: config.spotify.timeout,
        }
      );

      logSpotifyApi('user_token_refresh', true, {});

      return response.data;
    } catch (error) {
      logSpotifyApi('user_token_refresh_failed', false, { error });
      throw new SpotifyApiError('Failed to refresh user token');
    }
  }

  // User Profile
  public async getUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.get('/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      logPerformance('get_user_profile', startTime);
      return response.data;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Track Search
  public async searchTracks(
    query: string, 
    limit: number = 20, 
    offset: number = 0,
    useCache: boolean = true
  ): Promise<SpotifySearchResponse> {
    const startTime = Date.now();

    try {
      // Get client credentials token
      const token = await this.getClientCredentialsToken();

      const response = await this.client.get('/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: query,
          type: 'track',
          limit,
          offset,
        },
      });

      // Cache popular tracks
      if (useCache && response.data.tracks.items.length > 0) {
        await this.cacheTracksInBackground(response.data.tracks.items);
      }

      logPerformance('search_tracks', startTime, {
        query: query.substring(0, 50),
        resultCount: response.data.tracks.items.length,
      });

      return response.data;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Get Track Details
  public async getTrack(trackId: string, useCache: boolean = true): Promise<SpotifyTrack> {
    const startTime = Date.now();

    // Check cache first
    if (useCache) {
      const cached = await db.getCachedTrack(trackId);
      if (cached) {
        logPerformance('get_track_cached', startTime);
        return this.formatCachedTrack(cached);
      }
    }

    try {
      const token = await this.getClientCredentialsToken();
      
      const response = await this.client.get(`/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Cache the track
      if (useCache) {
        await this.cacheTrack(response.data);
      }

      logPerformance('get_track_api', startTime);
      return response.data;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Get Multiple Tracks
  public async getTracks(trackIds: string[], useCache: boolean = true): Promise<SpotifyTrack[]> {
    const startTime = Date.now();
    const tracks: SpotifyTrack[] = [];
    const uncachedIds: string[] = [];

    // Check cache for each track
    if (useCache) {
      for (const trackId of trackIds) {
        const cached = await db.getCachedTrack(trackId);
        if (cached) {
          tracks.push(this.formatCachedTrack(cached));
        } else {
          uncachedIds.push(trackId);
        }
      }
    } else {
      uncachedIds.push(...trackIds);
    }

    // Fetch uncached tracks from API
    if (uncachedIds.length > 0) {
      try {
        const token = await this.getClientCredentialsToken();
        
        // Spotify allows up to 50 tracks per request
        const chunks = this.chunkArray(uncachedIds, 50);
        
        for (const chunk of chunks) {
          const response = await this.client.get('/tracks', {
            headers: { Authorization: `Bearer ${token}` },
            params: { ids: chunk.join(',') },
          });

          tracks.push(...response.data.tracks.filter(Boolean)); // Filter out null values

          // Cache the tracks
          if (useCache) {
            await this.cacheTracksInBackground(response.data.tracks.filter(Boolean));
          }
        }
      } catch (error) {
        throw this.handleSpotifyError(error);
      }
    }

    logPerformance('get_tracks', startTime, {
      totalTracks: trackIds.length,
      cachedHits: tracks.length - uncachedIds.length,
      apiCalls: Math.ceil(uncachedIds.length / 50),
    });

    return tracks;
  }

  // Audio Features - Core of Vybe's recommendation engine
  public async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures> {
    const startTime = Date.now();

    try {
      const token = await this.getClientCredentialsToken();
      
      const response = await this.client.get(`/audio-features/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      logPerformance('get_audio_features', startTime);
      return response.data;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  public async getMultipleAudioFeatures(trackIds: string[]): Promise<SpotifyAudioFeatures[]> {
    const startTime = Date.now();

    try {
      const token = await this.getClientCredentialsToken();
      
      // Spotify allows up to 100 audio features per request
      const chunks = this.chunkArray(trackIds, 100);
      const allFeatures: SpotifyAudioFeatures[] = [];

      for (const chunk of chunks) {
        const response = await this.client.get('/audio-features', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ids: chunk.join(',') },
        });

        allFeatures.push(...response.data.audio_features.filter(Boolean));
      }

      logPerformance('get_multiple_audio_features', startTime, {
        trackCount: trackIds.length,
        apiCalls: chunks.length,
      });

      return allFeatures;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Playlist Operations
  public async createPlaylist(
    accessToken: string, 
    userId: string, 
    name: string, 
    description?: string
  ): Promise<any> {
    const startTime = Date.now();

    try {
      const response = await this.client.post(
        `/users/${userId}/playlists`,
        {
          name,
          description: description || `Created by Vybe - ${new Date().toLocaleDateString()}`,
          public: false,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      logPerformance('create_playlist', startTime);
      return response.data;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  public async addTracksToPlaylist(
    accessToken: string, 
    playlistId: string, 
    trackUris: string[]
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Spotify allows up to 100 tracks per request
      const chunks = this.chunkArray(trackUris, 100);
      
      for (const chunk of chunks) {
        await this.client.post(
          `/playlists/${playlistId}/tracks`,
          { uris: chunk },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      }

      logPerformance('add_tracks_to_playlist', startTime, {
        trackCount: trackUris.length,
        apiCalls: chunks.length,
      });

      return { success: true };
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Utility Methods
  private async cacheTrack(track: SpotifyTrack): Promise<void> {
    try {
      await db.cacheTrack(track.id, {
        name: track.name,
        artists: JSON.stringify(track.artists),
        album: JSON.stringify(track.album),
        duration: Math.floor(track.duration_ms / 1000),
        previewUrl: track.preview_url,
        spotifyUrl: track.external_urls.spotify,
        popularity: track.popularity,
        audioFeatures: JSON.stringify({}), // Will be filled when audio features are fetched
      });
    } catch (error) {
      logError('Failed to cache track', error as Error, { trackId: track.id });
    }
  }

  private async cacheTracksInBackground(tracks: SpotifyTrack[]): Promise<void> {
    // Cache tracks in background without blocking the response
    setImmediate(async () => {
      for (const track of tracks) {
        await this.cacheTrack(track);
      }
    });
  }

  private formatCachedTrack(cached: any): SpotifyTrack {
    return {
      id: cached.id,
      name: cached.name,
      artists: JSON.parse(cached.artists),
      album: JSON.parse(cached.album),
      duration_ms: cached.duration * 1000,
      preview_url: cached.previewUrl,
      external_urls: {
        spotify: cached.spotifyUrl,
      },
      popularity: cached.popularity,
      explicit: false, // Default value for cached tracks
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private handleSpotifyError(error: any): SpotifyApiError {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || 'Spotify API error';
      
      if (status === 401) {
        return new SpotifyApiError('Spotify authentication failed', 401);
      } else if (status === 403) {
        return new SpotifyApiError('Spotify access forbidden', 403);
      } else if (status === 429) {
        return new SpotifyApiError('Spotify rate limit exceeded', 429);
      } else if (status >= 500) {
        return new SpotifyApiError('Spotify service unavailable', 503);
      }
      
      return new SpotifyApiError(message, status);
    }
    
    return new SpotifyApiError('Failed to connect to Spotify', 503);
  }
}

// Export singleton instance
export const spotifyService = SpotifyService.getInstance();
export default spotifyService;
