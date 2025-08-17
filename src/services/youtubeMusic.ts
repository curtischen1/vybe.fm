import { GetListByKeyword } from 'youtube-search-api';
import playdl from 'play-dl';
import ytdl from 'ytdl-core';
import { logInfo, logError, logWarn as logWarning } from '@/utils/logger';

export interface YouTubeTrack {
  id: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  thumbnail: string;
  videoId: string;
  streamUrl?: string;
  quality?: string;
}

export interface YouTubeSearchOptions {
  query: string;
  limit?: number;
  type?: 'music' | 'video';
}

export interface YouTubeStreamInfo {
  url: string;
  quality: string;
  format: string;
  expires: Date;
}

export class YouTubeMusicService {
  private streamCache: Map<string, { info: YouTubeStreamInfo; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

  constructor() {
    logInfo('🎵 YouTube Music Service initialized');
  }

  /**
   * Search for music tracks on YouTube
   */
  async searchTracks(options: YouTubeSearchOptions): Promise<YouTubeTrack[]> {
    try {
      logInfo(`🔍 Searching YouTube for: "${options.query}"`);
      
      const searchResults = await GetListByKeyword(options.query, false, options.limit || 10);

      const tracks: YouTubeTrack[] = [];

      for (const item of searchResults.items) {
        if (item.type === 'video' && item.isLive === false) {
          // Parse duration from YouTube format (PT4M33S) to seconds
          const duration = this.parseDuration(item.length?.simpleText || '0:00');
          
          // Filter out videos longer than 10 minutes (likely not music)
          if (duration > 0 && duration <= 600) {
            tracks.push({
              id: `yt_${item.id}`,
              title: item.title,
              artist: item.channelTitle || 'Unknown Artist',
              duration,
              thumbnail: item.thumbnail?.url || '',
              videoId: item.id,
            });
          }
        }
      }

      logInfo(`✅ Found ${tracks.length} music tracks for "${options.query}"`);
      return tracks;

    } catch (error) {
      logError('❌ YouTube search failed', error as Error, { query: options.query });
      return [];
    }
  }

  /**
   * Get streaming URL for a YouTube video
   */
  async getStreamUrl(videoId: string): Promise<YouTubeStreamInfo | null> {
    try {
      // Check cache first
      const cached = this.streamCache.get(videoId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        logInfo(`🎯 Using cached stream URL for ${videoId}`);
        return cached.info;
      }

      logInfo(`🔗 Getting stream URL for video: ${videoId}`);

      // Try play-dl first (more reliable)
      try {
        const info = await playdl.video_info(`https://www.youtube.com/watch?v=${videoId}`);
        
        if (info.video_details.uploadedAt) {
          const formats = await playdl.video_basic_info(`https://www.youtube.com/watch?v=${videoId}`);
          
          // Get the best audio format
          const audioFormat = formats.video_details.music || formats.video_details;
          
          if (audioFormat) {
            const streamInfo: YouTubeStreamInfo = {
              url: `https://www.youtube.com/watch?v=${videoId}`, // We'll process this through play-dl
              quality: 'audio',
              format: 'webm',
              expires: new Date(Date.now() + this.CACHE_DURATION)
            };

            // Cache the result
            this.streamCache.set(videoId, {
              info: streamInfo,
              timestamp: Date.now()
            });

            logInfo(`✅ Got stream URL for ${videoId}`);
            return streamInfo;
          }
        }
      } catch (playDlError) {
        logWarning('⚠️ play-dl failed, trying ytdl-core', { videoId, error: playDlError });
      }

      // Fallback to ytdl-core
      const info = await ytdl.getInfo(videoId);
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      if (audioFormats.length > 0) {
        const bestFormat = audioFormats[0]; // Get highest quality
        
        if (bestFormat) {
          const streamInfo: YouTubeStreamInfo = {
            url: bestFormat.url,
            quality: bestFormat.audioBitrate?.toString() || 'unknown',
            format: bestFormat.container || 'unknown',
            expires: new Date(Date.now() + this.CACHE_DURATION)
          };

          // Cache the result
          this.streamCache.set(videoId, {
            info: streamInfo,
            timestamp: Date.now()
          });

          logInfo(`✅ Got stream URL for ${videoId} via ytdl-core`);
          return streamInfo;
        }
      }

      logWarning(`⚠️ No audio formats found for ${videoId}`);
      return null;

    } catch (error) {
      logError('❌ Failed to get stream URL', error as Error, { videoId });
      return null;
    }
  }

  /**
   * Search for a specific track by artist and title
   */
  async findTrack(artist: string, title: string): Promise<YouTubeTrack | null> {
    const query = `${artist} ${title}`;
    const results = await this.searchTracks({ query, limit: 5 });
    
    if (results.length === 0) return null;

    // Find the best match (simple heuristic)
    const bestMatch = results.find(track => {
      const trackTitle = track.title.toLowerCase();
      const trackArtist = track.artist.toLowerCase();
      const searchTitle = title.toLowerCase();
      const searchArtist = artist.toLowerCase();
      
      return trackTitle.includes(searchTitle) && trackArtist.includes(searchArtist);
    }) || results[0]; // Fallback to first result

    if (!bestMatch) return null;

    // Get stream URL for the best match
    const streamInfo = await this.getStreamUrl(bestMatch.videoId);
    if (streamInfo) {
      bestMatch.streamUrl = streamInfo.url;
      bestMatch.quality = streamInfo.quality;
    }

    return bestMatch;
  }

  /**
   * Get multiple tracks with stream URLs
   */
  async getTracksWithStreams(tracks: { artist: string; title: string }[]): Promise<YouTubeTrack[]> {
    logInfo(`🎵 Getting ${tracks.length} tracks with stream URLs`);
    
    const results: YouTubeTrack[] = [];
    
    for (const track of tracks) {
      const youtubeTrack = await this.findTrack(track.artist, track.title);
      if (youtubeTrack) {
        results.push(youtubeTrack);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logInfo(`✅ Got ${results.length}/${tracks.length} tracks with streams`);
    return results;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [videoId, cached] of this.streamCache.entries()) {
      if (now - cached.timestamp > this.CACHE_DURATION) {
        this.streamCache.delete(videoId);
      }
    }
  }

  /**
   * Parse YouTube duration format to seconds
   */
  private parseDuration(duration: string): number {
    try {
      // Handle formats like "4:33", "1:04:33", "PT4M33S"
      if (duration.startsWith('PT')) {
        // ISO 8601 duration format (PT4M33S)
        const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (matches) {
          const hours = parseInt(matches[1] || '0');
          const minutes = parseInt(matches[2] || '0');
          const seconds = parseInt(matches[3] || '0');
          return hours * 3600 + minutes * 60 + seconds;
        }
      } else {
        // Simple format (4:33 or 1:04:33)
        const parts = duration.split(':').map(p => parseInt(p) || 0);
        if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
          return parts[0] * 60 + parts[1]; // mm:ss
        } else if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
          return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
        }
      }
    } catch (error) {
      logWarning('⚠️ Failed to parse duration', { duration, error });
    }
    
    return 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; expired: number } {
    this.cleanCache();
    return {
      size: this.streamCache.size,
      expired: 0 // We just cleaned, so 0 expired
    };
  }
}

// Export singleton instance
export const youtubeMusicService = new YouTubeMusicService();
