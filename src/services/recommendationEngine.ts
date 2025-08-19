import { spotifyService } from '@/services/spotify';
import { contextProcessor } from '@/services/contextProcessor';
import { musicAnalysisService } from '@/services/musicAnalysis';

import { db } from '@/services/database';
import { ContextWeights, TrackRecommendation, SpotifyAudioFeatures } from '@/types/api';
import { logPerformance, logRecommendation, logError } from '@/utils/logger';

// Recommendation engine types
export interface RecommendationRequest {
  userId: string;
  contextText: string;
  referenceTrackIds: string[];
  limit?: number;
  excludeTrackIds?: string[];
}

export interface RecommendationResult {
  vybeId: string;
  recommendations: TrackRecommendation[];
  contextAnalysis: any;
  processingTime: number;
  confidence: number;
  reasoning: string;
}

export interface UserMusicProfile {
  favoriteGenres: string[];
  audioFeaturePreferences: Partial<SpotifyAudioFeatures>;
  contextPatterns: Map<string, ContextWeights>;
  feedbackHistory: FeedbackPattern[];
}

export interface FeedbackPattern {
  contextType: string;
  audioFeatures: Partial<SpotifyAudioFeatures>;
  feedbackScore: number; // -1 to 1 (negative to positive)
  listenTime: number;    // seconds
  timestamp: Date;
}

class RecommendationEngineService {
  private static instance: RecommendationEngineService;

  public static getInstance(): RecommendationEngineService {
    if (!RecommendationEngineService.instance) {
      RecommendationEngineService.instance = new RecommendationEngineService();
    }
    return RecommendationEngineService.instance;
  }

  /**
   * MAIN RECOMMENDATION ENGINE - Pure Individual-Based Algorithm
   * NO collaborative filtering, NO "people like you" - only user's own behavior
   */
  public async generateRecommendations(
    request: RecommendationRequest
  ): Promise<RecommendationResult> {
    const startTime = Date.now();
    const { userId, contextText, referenceTrackIds, limit = 20, excludeTrackIds = [] } = request;

    try {
      // Step 1: Get user's individual music profile (their behavior only)
      const userProfile = await this.getUserMusicProfile(userId);

      // Step 2: Interpret context using Claude (with user's personal history)
      const contextAnalysis = await contextProcessor.interpretContext(
        contextText,
        { preferences: userProfile }
      );

      // Step 3: Analyze reference tracks to understand musical DNA
      const referenceAudioFeatures = await spotifyService.getMultipleAudioFeatures(referenceTrackIds);
      const referenceProfile = musicAnalysisService.createReferenceProfile(referenceAudioFeatures);

      // Step 4: Apply context weights to reference profile
      const weightedProfile = musicAnalysisService.applyContextWeights(
        referenceProfile,
        contextAnalysis.weights
      );

      // Step 5: Apply individual user learning (the anti-collaborative filtering magic)
      const personalizedWeights = await this.applyIndividualLearning(
        contextAnalysis.weights,
        contextText,
        userProfile
      );

      // Step 6: Find candidate tracks using Spotify's catalog
      const candidateTracks = await this.findCandidateTracks(
        contextAnalysis,
        referenceProfile,
        excludeTrackIds
      );

      // Step 7: Rank tracks using individual preference algorithm
      const rankedRecommendations = await this.rankByIndividualPreference(
        candidateTracks,
        { ...weightedProfile, weights: personalizedWeights },
        userProfile
      );

      // Step 8: Diversify to avoid repetitive suggestions
      const diversifiedRecommendations = this.diversifyRecommendations(
        rankedRecommendations.slice(0, limit * 2), // Get more candidates for diversification
        limit
      );

      // Step 9: Use Spotify track URIs for Web Playback SDK
      const recommendationsWithStreams = diversifiedRecommendations;

      // Step 10: Create Vybe record in database
      const processingTime = Date.now() - startTime;
      const vybe = await db.createVybe({
        userId,
        contextRaw: contextText,
        contextParsed: contextAnalysis,
        referenceTrackIds,
        recommendations: recommendationsWithStreams,
        processingTimeMs: processingTime,
        aiCostCents: Math.ceil(contextAnalysis.confidence * 2), // Rough cost estimate
      });

      // Step 10: Update user's music profile with this interaction
      await this.updateUserProfileFromInteraction(userId, contextAnalysis, referenceProfile);

      // Log the recommendation for analytics
      logRecommendation(
        userId,
        contextText,
        diversifiedRecommendations.length,
        processingTime,
        {
          confidence: contextAnalysis.confidence,
          mood: contextAnalysis.mood,
        }
      );

      return {
        vybeId: vybe.id,
        recommendations: recommendationsWithStreams,
        contextAnalysis,
        processingTime,
        confidence: contextAnalysis.confidence,
        reasoning: this.generateRecommendationReasoning(contextAnalysis, referenceProfile, userProfile),
      };

    } catch (error) {
      logError('Recommendation generation failed', error as Error, {
        userId,
        contextText: contextText.substring(0, 100),
        referenceTrackCount: referenceTrackIds.length,
      });
      throw error;
    }
  }

  /**
   * Get user's individual music profile based on THEIR behavior only
   */
  private async getUserMusicProfile(userId: string): Promise<UserMusicProfile> {
    const startTime = Date.now();

    try {
      // Get user's feedback history (individual behavior)
      const feedbackHistory = await db.client.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500, // Last 500 interactions
        include: {
          vybe: true,
        },
      });

      // Get user's preferences from database
      // const userPreferences = await db.client.userPreferences.findUnique({
      //   where: { userId },
      // });

      // Analyze individual patterns from user's own behavior
      const profile: UserMusicProfile = {
        favoriteGenres: this.extractFavoriteGenres(feedbackHistory),
        audioFeaturePreferences: this.analyzeAudioFeaturePreferences(feedbackHistory),
        contextPatterns: this.extractContextPatterns(feedbackHistory),
        feedbackHistory: this.processFeedbackHistory(feedbackHistory),
      };

      logPerformance('get_user_music_profile', startTime, {
        feedbackCount: feedbackHistory.length,
      });

      return profile;
    } catch (error) {
      logError('Failed to get user music profile', error as Error, { userId });
      
      // Return empty profile for new users
      return {
        favoriteGenres: [],
        audioFeaturePreferences: {},
        contextPatterns: new Map(),
        feedbackHistory: [],
      };
    }
  }

  /**
   * Apply individual learning - adjust recommendations based on user's personal behavior
   */
  private async applyIndividualLearning(
    baseWeights: ContextWeights,
    contextText: string,
    userProfile: UserMusicProfile
  ): Promise<ContextWeights> {
    
    // Find similar contexts in user's history
    const similarContextPattern = this.findSimilarContextPattern(contextText, userProfile);
    
    if (!similarContextPattern) {
      return baseWeights; // No personal history for this context type
    }

    // Adjust weights based on user's individual patterns
    const learningRate = 0.3; // How much to adjust based on personal history
    
    const personalizedWeights: ContextWeights = {
      valence: this.adjustWeight(baseWeights.valence, similarContextPattern.valence, learningRate),
      energy: this.adjustWeight(baseWeights.energy, similarContextPattern.energy, learningRate),
      danceability: this.adjustWeight(baseWeights.danceability, similarContextPattern.danceability, learningRate),
      acousticness: this.adjustWeight(baseWeights.acousticness, similarContextPattern.acousticness, learningRate),
      tempoModifier: this.adjustWeight(baseWeights.tempoModifier, similarContextPattern.tempoModifier, learningRate),
    };

    return personalizedWeights;
  }

  /**
   * Find candidate tracks for recommendations
   */
  private async findCandidateTracks(
    contextAnalysis: any,
    _referenceProfile: any,
    _excludeTrackIds: string[]
  ): Promise<Array<{ trackId: string; features: SpotifyAudioFeatures }>> {
    
    // Strategy 1: Search by genre and mood keywords
    const searchQueries = this.generateSearchQueries(contextAnalysis);
    const candidateMap = new Map<string, SpotifyAudioFeatures>();

    for (const query of searchQueries) {
      try {
        const searchResults = await spotifyService.searchTracks(query, 50);
        const trackIds = searchResults.tracks.items
          .filter(track => !_excludeTrackIds.includes(track.id))
          .map(track => track.id)
          .slice(0, 30); // Limit per search

        const audioFeatures = await spotifyService.getMultipleAudioFeatures(trackIds);
        
        audioFeatures.forEach(features => {
          if (features && !candidateMap.has(features.id)) {
            candidateMap.set(features.id, features);
          }
        });

      } catch (error) {
        logError('Search query failed', error as Error, { query });
        // Continue with other queries
      }
    }

    // Strategy 2: Use cached similar tracks from database
    const cachedSimilar = await this.findSimilarCachedTracks(_referenceProfile, _excludeTrackIds);
    cachedSimilar.forEach(({ trackId, features }) => {
      if (!candidateMap.has(trackId)) {
        candidateMap.set(trackId, features);
      }
    });

    return Array.from(candidateMap.entries()).map(([trackId, features]) => ({
      trackId,
      features,
    }));
  }

  /**
   * Rank tracks by individual preference (no collaborative filtering)
   */
  private async rankByIndividualPreference(
    candidates: Array<{ trackId: string; features: SpotifyAudioFeatures }>,
    weightedProfile: any,
    userProfile: UserMusicProfile
  ): Promise<TrackRecommendation[]> {
    
    const recommendations: TrackRecommendation[] = [];

    for (const { trackId, features } of candidates) {
      // Calculate similarity to target profile
      const similarity = musicAnalysisService.calculateSimilarity(
        weightedProfile,
        features as any,
        weightedProfile.weights
      );

      // Apply individual user preference boost/penalty
      const personalPreference = this.calculatePersonalPreference(features, userProfile);
      
      // Combine similarity with personal preference (pure individual algorithm)
      const finalScore = (similarity * 0.7) + (personalPreference * 0.3);

      // Get track details
      try {
        const track = await spotifyService.getTrack(trackId);
        
        recommendations.push({
          trackId,
          name: track.name,
          artists: track.artists.map(a => a.name),
          album: track.album.name,
          previewUrl: track.preview_url || null,
          spotifyUrl: track.external_urls.spotify,
          spotifyUri: `spotify:track:${trackId}`,
          audioFeatures: features,
          confidence: finalScore,
          reasoning: this.generateTrackReasoning(similarity, personalPreference, features),
        });

      } catch (error) {
        logError('Failed to get track details', error as Error, { trackId });
        // Skip this track if we can't get details
      }
    }

    // Sort by final score (highest first)
    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate personal preference score based on individual user behavior
   */
  private calculatePersonalPreference(
    trackFeatures: SpotifyAudioFeatures,
    userProfile: UserMusicProfile
  ): number {
    if (userProfile.feedbackHistory.length === 0) {
      return 0.5; // Neutral for new users
    }

    let totalScore = 0;
    let weightSum = 0;

    // Analyze similarity to tracks user previously liked
    for (const feedback of userProfile.feedbackHistory) {
      if (feedback.feedbackScore > 0) { // Only consider positive feedback
        const similarity = musicAnalysisService.calculateSimilarity(
          trackFeatures as any,
          feedback.audioFeatures as any
        );
        
        // Weight by how much they liked it and how recently
        const timeWeight = this.calculateTimeWeight(feedback.timestamp);
        const feedbackWeight = feedback.feedbackScore * timeWeight;
        
        totalScore += similarity * feedbackWeight;
        weightSum += feedbackWeight;
      }
    }

    return weightSum > 0 ? totalScore / weightSum : 0.5;
  }

  /**
   * Diversify recommendations to avoid repetitive suggestions
   */
  private diversifyRecommendations(
    recommendations: TrackRecommendation[],
    limit: number
  ): TrackRecommendation[] {
    const diversified: TrackRecommendation[] = [];
    const usedArtists = new Set<string>();
    const minSimilarityThreshold = 0.85;

    for (const rec of recommendations) {
      if (diversified.length >= limit) break;

      // Check artist diversity
      const mainArtist = rec.artists[0];
      if (mainArtist && usedArtists.has(mainArtist) && usedArtists.size < limit / 2) {
        continue; // Skip if we already have this artist (unless we need to fill quota)
      }

      // Check audio feature diversity
      let tooSimilar = false;
      for (const existing of diversified) {
        const similarity = musicAnalysisService.calculateSimilarity(
          rec.audioFeatures as any,
          existing.audioFeatures as any
        );
        
        if (similarity > minSimilarityThreshold) {
          tooSimilar = true;
          break;
        }
      }

      if (!tooSimilar) {
        diversified.push(rec);
        if (mainArtist) usedArtists.add(mainArtist);
      }
    }

    // Fill remaining slots if we filtered too aggressively
    if (diversified.length < limit) {
      for (const rec of recommendations) {
        if (diversified.length >= limit) break;
        if (!diversified.find(d => d.trackId === rec.trackId)) {
          diversified.push(rec);
        }
      }
    }

    return diversified;
  }

  // Helper methods for individual behavior analysis
  private extractFavoriteGenres(feedbackHistory: any[]): string[] {
    // Analyze user's individual genre preferences from their feedback
    const genreScores = new Map<string, number>();
    
    for (const feedback of feedbackHistory) {
      if (feedback.feedbackType === 'UPVOTE') {
        // Extract genre from track data (simplified)
        const genre = 'unknown'; // Would need to classify from audio features
        genreScores.set(genre, (genreScores.get(genre) || 0) + 1);
      }
    }

    return Array.from(genreScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre);
  }

  private analyzeAudioFeaturePreferences(feedbackHistory: any[]): Partial<SpotifyAudioFeatures> {
    // Calculate average preferences from user's positive feedback
    const positives = feedbackHistory.filter(f => f.feedbackType === 'UPVOTE');
    
    if (positives.length === 0) return {};

    // This would calculate averages from actual audio features of liked tracks
    return {
      valence: 0.6, // Placeholder - would calculate from actual data
      energy: 0.7,
      danceability: 0.5,
    };
  }

  private extractContextPatterns(_feedbackHistory: any[]): Map<string, ContextWeights> {
    // Analyze user's individual context patterns
    const patterns = new Map<string, ContextWeights>();
    
    // Group feedback by context and analyze successful patterns
    // This would analyze which contexts led to positive feedback
    
    return patterns;
  }

  private processFeedbackHistory(feedbackHistory: any[]): FeedbackPattern[] {
    return feedbackHistory.map(feedback => ({
      contextType: feedback.vybe?.contextRaw?.substring(0, 50) || 'unknown',
      audioFeatures: {}, // Would extract from actual track
      feedbackScore: feedback.feedbackType === 'UPVOTE' ? 1 : feedback.feedbackType === 'DOWNVOTE' ? -1 : 0,
      listenTime: feedback.playTime || 0,
      timestamp: feedback.createdAt,
    }));
  }

  private findSimilarContextPattern(_contextText: string, _userProfile: UserMusicProfile): ContextWeights | null {
    // Find user's individual patterns for similar contexts
    // This would use semantic similarity to match contexts
    return null; // Simplified for now
  }

  private adjustWeight(baseWeight: number, userPreference: number, learningRate: number): number {
    return baseWeight + (userPreference - baseWeight) * learningRate;
  }

  private generateSearchQueries(contextAnalysis: any): string[] {
    const queries: string[] = [];
    
    // Generate searches based on context analysis
    for (const genre of contextAnalysis.musicGenres) {
      queries.push(`genre:"${genre}" ${contextAnalysis.mood}`);
    }
    
    queries.push(`${contextAnalysis.mood} ${contextAnalysis.energy}`);
    queries.push(`${contextAnalysis.activityType} music`);
    
    return queries.slice(0, 3); // Limit queries
  }

  private async findSimilarCachedTracks(
    _referenceProfile: any,
    _excludeTrackIds: string[]
  ): Promise<Array<{ trackId: string; features: SpotifyAudioFeatures }>> {
    // Find similar tracks from cache (would implement similarity search)
    return [];
  }

  private calculateTimeWeight(timestamp: Date): number {
    const daysSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 30); // Exponential decay over 30 days
  }

  private generateTrackReasoning(similarity: number, personalPreference: number, _features: SpotifyAudioFeatures): string {
    return `Similarity: ${(similarity * 100).toFixed(1)}%, Personal fit: ${(personalPreference * 100).toFixed(1)}%`;
  }

  private generateRecommendationReasoning(contextAnalysis: any, _referenceProfile: any, _userProfile: UserMusicProfile): string {
    return `Analyzed context "${contextAnalysis.mood}" with ${_userProfile.feedbackHistory.length} personal interactions to create individual recommendations.`;
  }

  private async updateUserProfileFromInteraction(userId: string, contextAnalysis: any, _referenceProfile: any): Promise<void> {
    // Update user's individual profile with this interaction
    // This helps improve future recommendations based on their behavior
    try {
      await db.trackEvent('vybe_created', {
        userId,
        contextMood: contextAnalysis.mood,
        contextEnergy: contextAnalysis.energy,
      }, userId);
    } catch (error) {
      logError('Failed to update user profile', error as Error, { userId });
    }
  }


}

// Export singleton instance
export const recommendationEngine = RecommendationEngineService.getInstance();
export default recommendationEngine;
