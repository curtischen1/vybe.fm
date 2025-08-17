import { SpotifyAudioFeatures } from '@/services/spotify';
import { ContextWeights } from '@/types/api';
import { logPerformance } from '@/utils/logger';

// Music analysis types
export interface AudioProfile {
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
  timeSignature: number;
}

export interface WeightedAudioProfile extends AudioProfile {
  weights: ContextWeights;
}

export interface SimilarityResult {
  trackId: string;
  similarity: number;
  confidence: number;
}

export interface GenreClassification {
  genre: string;
  confidence: number;
}

class MusicAnalysisService {
  private static instance: MusicAnalysisService;

  public static getInstance(): MusicAnalysisService {
    if (!MusicAnalysisService.instance) {
      MusicAnalysisService.instance = new MusicAnalysisService();
    }
    return MusicAnalysisService.instance;
  }

  /**
   * Create a musical profile from multiple reference tracks
   */
  public createReferenceProfile(audioFeatures: SpotifyAudioFeatures[]): AudioProfile {
    const startTime = Date.now();

    if (audioFeatures.length === 0) {
      throw new Error('At least one audio feature set is required');
    }

    // Calculate average values for all features
    const profile: AudioProfile = {
      valence: this.average(audioFeatures.map(f => f.valence)),
      energy: this.average(audioFeatures.map(f => f.energy)),
      danceability: this.average(audioFeatures.map(f => f.danceability)),
      acousticness: this.average(audioFeatures.map(f => f.acousticness)),
      instrumentalness: this.average(audioFeatures.map(f => f.instrumentalness)),
      liveness: this.average(audioFeatures.map(f => f.liveness)),
      speechiness: this.average(audioFeatures.map(f => f.speechiness)),
      tempo: this.average(audioFeatures.map(f => f.tempo)),
      loudness: this.average(audioFeatures.map(f => f.loudness)),
      mode: this.mode(audioFeatures.map(f => f.mode)),
      key: this.mode(audioFeatures.map(f => f.key)),
      timeSignature: this.mode(audioFeatures.map(f => f.time_signature)),
    };

    logPerformance('create_reference_profile', startTime, {
      trackCount: audioFeatures.length,
    });

    return profile;
  }

  /**
   * Apply context weights to an audio profile
   */
  public applyContextWeights(
    profile: AudioProfile, 
    contextWeights: ContextWeights
  ): WeightedAudioProfile {
    const startTime = Date.now();

    // Apply weights to key features for recommendation matching
    const weightedProfile: WeightedAudioProfile = {
      ...profile,
      weights: contextWeights,
      // Apply direct context weight modifications
      valence: this.clamp(profile.valence * (1 + contextWeights.valence * 0.5), 0, 1),
      energy: this.clamp(profile.energy * (1 + contextWeights.energy * 0.5), 0, 1),
      danceability: this.clamp(profile.danceability * (1 + contextWeights.danceability * 0.5), 0, 1),
      acousticness: this.clamp(profile.acousticness * (1 + contextWeights.acousticness * 0.5), 0, 1),
      tempo: profile.tempo * contextWeights.tempoModifier,
    };

    logPerformance('apply_context_weights', startTime);

    return weightedProfile;
  }

  /**
   * Calculate similarity between two audio profiles using weighted cosine similarity
   */
  public calculateSimilarity(
    profile1: AudioProfile | WeightedAudioProfile,
    profile2: SpotifyAudioFeatures,
    contextWeights?: ContextWeights
  ): number {
    const startTime = Date.now();

    // Define feature weights for similarity calculation
    const featureWeights = {
      valence: contextWeights?.valence || 0.8,
      energy: contextWeights?.energy || 0.8,
      danceability: contextWeights?.danceability || 0.7,
      acousticness: contextWeights?.acousticness || 0.6,
      instrumentalness: 0.4,
      liveness: 0.3,
      speechiness: 0.3,
      tempo: 0.5,
      loudness: 0.2,
      mode: 0.3,
      key: 0.2,
    };

    // Normalize features to 0-1 range
    const features1 = this.normalizeFeatures(profile1);
    const features2 = this.normalizeFeatures(profile2);

    // Calculate weighted cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const [feature, weight] of Object.entries(featureWeights)) {
      const val1 = features1[feature] * weight;
      const val2 = features2[feature] * weight;
      
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));

    logPerformance('calculate_similarity', startTime);

    return this.clamp(similarity, 0, 1);
  }

  /**
   * Calculate Euclidean distance between audio profiles
   */
  public calculateEuclideanDistance(
    profile1: AudioProfile,
    profile2: SpotifyAudioFeatures
  ): number {
    const features1 = this.normalizeFeatures(profile1);
    const features2 = this.normalizeFeatures(profile2);

    const keyFeatures = ['valence', 'energy', 'danceability', 'acousticness'];
    
    let sumSquaredDiffs = 0;
    for (const feature of keyFeatures) {
      const diff = features1[feature] - features2[feature];
      sumSquaredDiffs += diff * diff;
    }

    return Math.sqrt(sumSquaredDiffs);
  }

  /**
   * Analyze musical characteristics and suggest mood/genre
   */
  public analyzeMusicCharacteristics(audioFeatures: SpotifyAudioFeatures): {
    mood: string;
    energy: string;
    danceability: string;
    characteristics: string[];
  } {
    const { valence, energy, danceability, acousticness, instrumentalness } = audioFeatures;

    // Determine mood based on valence and energy
    let mood = 'neutral';
    if (valence > 0.7 && energy > 0.6) {
      mood = 'happy and energetic';
    } else if (valence > 0.6) {
      mood = 'happy';
    } else if (valence < 0.3 && energy < 0.4) {
      mood = 'sad and mellow';
    } else if (valence < 0.4) {
      mood = 'sad';
    } else if (energy > 0.7) {
      mood = 'energetic';
    } else if (energy < 0.3) {
      mood = 'calm';
    }

    // Determine energy level
    let energyLevel = 'medium';
    if (energy > 0.7) {
      energyLevel = 'high';
    } else if (energy < 0.3) {
      energyLevel = 'low';
    }

    // Determine danceability
    let danceLevel = 'moderate';
    if (danceability > 0.7) {
      danceLevel = 'very danceable';
    } else if (danceability < 0.3) {
      danceLevel = 'not danceable';
    }

    // Additional characteristics
    const characteristics: string[] = [];
    if (acousticness > 0.7) characteristics.push('acoustic');
    if (instrumentalness > 0.5) characteristics.push('instrumental');
    if (audioFeatures.liveness > 0.8) characteristics.push('live recording');
    if (audioFeatures.speechiness > 0.33) characteristics.push('speech-heavy');

    return {
      mood,
      energy: energyLevel,
      danceability: danceLevel,
      characteristics,
    };
  }

  /**
   * Generate recommendations based on similarity to a profile
   */
  public rankTracksBySimilarity(
    targetProfile: WeightedAudioProfile,
    candidateFeatures: { trackId: string; features: SpotifyAudioFeatures }[]
  ): SimilarityResult[] {
    const startTime = Date.now();

    const results = candidateFeatures.map(({ trackId, features }) => {
      const similarity = this.calculateSimilarity(
        targetProfile,
        features,
        targetProfile.weights
      );

      // Calculate confidence based on feature consistency
      const confidence = this.calculateConfidence(targetProfile, features);

      return {
        trackId,
        similarity,
        confidence,
      };
    });

    // Sort by similarity score (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    logPerformance('rank_tracks_by_similarity', startTime, {
      candidateCount: candidateFeatures.length,
    });

    return results;
  }

  /**
   * Diversify recommendations to avoid too similar tracks
   */
  public diversifyRecommendations(
    recommendations: SimilarityResult[],
    allFeatures: Map<string, SpotifyAudioFeatures>,
    maxSimilarityThreshold: number = 0.95
  ): SimilarityResult[] {
    const diversified: SimilarityResult[] = [];
    
    for (const rec of recommendations) {
      let shouldInclude = true;
      const currentFeatures = allFeatures.get(rec.trackId);
      
      if (!currentFeatures) {
        continue;
      }

      // Check similarity to already included tracks
      for (const included of diversified) {
        const includedFeatures = allFeatures.get(included.trackId);
        if (!includedFeatures) continue;

        const similarity = this.calculateSimilarity(currentFeatures as any, includedFeatures);
        
        if (similarity > maxSimilarityThreshold) {
          shouldInclude = false;
          break;
        }
      }

      if (shouldInclude) {
        diversified.push(rec);
      }

      // Limit to reasonable number for performance
      if (diversified.length >= 50) {
        break;
      }
    }

    return diversified;
  }

  /**
   * Classify potential genre based on audio features
   */
  public classifyGenre(audioFeatures: SpotifyAudioFeatures): GenreClassification[] {
    const { energy, danceability, acousticness, instrumentalness, valence } = audioFeatures;
    
    const classifications: GenreClassification[] = [];

    // Electronic/Dance music
    if (energy > 0.7 && danceability > 0.7 && acousticness < 0.3) {
      classifications.push({ genre: 'electronic', confidence: 0.8 });
    }

    // Rock music
    if (energy > 0.6 && acousticness < 0.5 && instrumentalness < 0.5) {
      classifications.push({ genre: 'rock', confidence: 0.7 });
    }

    // Acoustic/Folk
    if (acousticness > 0.7 && energy < 0.6) {
      classifications.push({ genre: 'acoustic', confidence: 0.8 });
    }

    // Classical/Instrumental
    if (instrumentalness > 0.8 && acousticness > 0.3) {
      classifications.push({ genre: 'classical', confidence: 0.9 });
    }

    // Hip-hop/Rap
    if (audioFeatures.speechiness > 0.33 && energy > 0.5) {
      classifications.push({ genre: 'hip-hop', confidence: 0.7 });
    }

    // Pop music
    if (valence > 0.5 && energy > 0.4 && danceability > 0.5) {
      classifications.push({ genre: 'pop', confidence: 0.6 });
    }

    // Ambient/Chill
    if (energy < 0.4 && valence < 0.6 && acousticness > 0.4) {
      classifications.push({ genre: 'ambient', confidence: 0.7 });
    }

    return classifications.sort((a, b) => b.confidence - a.confidence);
  }

  // Utility methods
  private normalizeFeatures(features: any): any {
    return {
      valence: features.valence,
      energy: features.energy,
      danceability: features.danceability,
      acousticness: features.acousticness,
      instrumentalness: features.instrumentalness,
      liveness: features.liveness,
      speechiness: features.speechiness,
      tempo: features.tempo / 200, // Normalize tempo to 0-1 range
      loudness: (features.loudness + 60) / 60, // Normalize loudness to 0-1 range
      mode: features.mode,
      key: features.key / 11, // Normalize key to 0-1 range
    };
  }

  private calculateConfidence(profile: AudioProfile, features: SpotifyAudioFeatures): number {
    const distance = this.calculateEuclideanDistance(profile, features);
    return Math.max(0, 1 - distance);
  }

  private average(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private mode(values: number[]): number {
    const frequency = new Map<number, number>();
    values.forEach(val => {
      frequency.set(val, (frequency.get(val) || 0) + 1);
    });
    
    let maxCount = 0;
    let mode = values[0];
    
    frequency.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });
    
    return mode || 1; // Default to major mode
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

// Export singleton instance
export const musicAnalysisService = MusicAnalysisService.getInstance();
export default musicAnalysisService;
