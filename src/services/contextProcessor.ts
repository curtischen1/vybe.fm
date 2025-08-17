import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/config/environment';
import { db } from '@/services/database';
import { ContextWeights } from '@/types/api';
import { OpenAiApiError } from '@/middleware/errorHandler';
import { logOpenAiApi, logError, logPerformance } from '@/utils/logger';

// Context processing types
export interface ContextAnalysis {
  weights: ContextWeights;
  reasoning: string;
  confidence: number;
  musicGenres: string[];
  mood: string;
  energy: string;
  socialContext: string;
  activityType: string;
}

export interface ContextExample {
  input: string;
  output: ContextWeights;
  description: string;
}

class ContextProcessorService {
  private static instance: ContextProcessorService;
  private claude: Anthropic;

  private constructor() {
    this.claude = new Anthropic({
      apiKey: config.claude.apiKey, // We'll need to update config for this
    });
  }

  public static getInstance(): ContextProcessorService {
    if (!ContextProcessorService.instance) {
      ContextProcessorService.instance = new ContextProcessorService();
    }
    return ContextProcessorService.instance;
  }

  /**
   * Main context interpretation method - converts natural language to audio feature weights
   */
  public async interpretContext(
    contextText: string,
    userHistory?: any
  ): Promise<ContextAnalysis> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = await this.getCachedContext(contextText);
    if (cached) {
      logPerformance('interpret_context_cached', startTime);
      return cached;
    }

    try {
      const analysis = await this.processWithClaude(contextText, userHistory);
      
      // Cache the result
      await this.cacheContext(contextText, analysis);
      
      const cost = this.estimateTokenCost(contextText, JSON.stringify(analysis));
      logOpenAiApi('context_interpretation', analysis.weights.valence !== undefined ? 1 : 0, cost, {
        contextLength: contextText.length,
        confidence: analysis.confidence,
      });

      logPerformance('interpret_context_claude', startTime, {
        confidence: analysis.confidence,
        mood: analysis.mood,
      });

      return analysis;
    } catch (error) {
      logError('Context interpretation failed', error as Error, {
        contextText: contextText.substring(0, 100),
      });
      throw new OpenAiApiError('Failed to interpret musical context');
    }
  }

  /**
   * Process context using Claude with sophisticated musical understanding
   */
  private async processWithClaude(
    contextText: string,
    userHistory?: any
  ): Promise<ContextAnalysis> {
    const prompt = this.buildContextPrompt(contextText, userHistory);

    const response = await this.claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      temperature: 0.3, // Lower temperature for more consistent outputs
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Parse Claude's response
    const content = response.content[0];
    if (content.type === 'text') {
      return this.parseClaudeResponse(content.text);
    } else {
      throw new Error('Unexpected response format from Claude');
    }
  }

  /**
   * Build sophisticated prompt for Claude with musical context understanding
   */
  private buildContextPrompt(contextText: string, userHistory?: any): string {
    const examples = this.getContextExamples();
    const userHistoryContext = userHistory ? this.buildUserHistoryContext(userHistory) : '';

    return `You are Vybe's AI music context interpreter. Your job is to convert natural language descriptions of musical moments into precise audio feature weights that will drive personalized music recommendations.

CORE PHILOSOPHY: Vybe is ANTI-collaborative filtering. We ONLY use individual user behavior and preferences. No "people like you" recommendations - pure individual taste learning.

AUDIO FEATURES TO ANALYZE:
- valence: 0.0-1.0 (sad/negative to happy/positive)
- energy: 0.0-1.0 (calm/peaceful to energetic/intense)
- danceability: 0.0-1.0 (not danceable to very danceable)
- acousticness: 0.0-1.0 (electronic/produced to acoustic/organic)
- tempoModifier: 0.5-2.0 (slower tempo to faster tempo multiplier)

CONTEXT EXAMPLES:
${examples.map(ex => `
Input: "${ex.input}"
Output: ${JSON.stringify(ex.output)}
Why: ${ex.description}
`).join('\n')}

${userHistoryContext}

USER'S CONTEXT: "${contextText}"

Analyze this context and provide:
1. Audio feature weights (be precise - this drives the recommendation algorithm)
2. Your reasoning (why these specific weights?)
3. Confidence level (0.0-1.0)
4. Likely music genres that fit
5. Overall mood classification
6. Energy level classification
7. Social context (alone, friends, public, etc.)
8. Activity type (working, exercising, relaxing, etc.)

Respond ONLY with valid JSON in this exact format:
{
  "weights": {
    "valence": 0.0-1.0,
    "energy": 0.0-1.0,
    "danceability": 0.0-1.0,
    "acousticness": 0.0-1.0,
    "tempoModifier": 0.5-2.0
  },
  "reasoning": "Detailed explanation of why these weights were chosen",
  "confidence": 0.0-1.0,
  "musicGenres": ["genre1", "genre2"],
  "mood": "descriptive mood",
  "energy": "energy level description",
  "socialContext": "social situation",
  "activityType": "type of activity"
}`;
  }

  /**
   * Parse Claude's response into structured data
   */
  private parseClaudeResponse(responseText: string): ContextAnalysis {
    try {
      // Extract JSON from response (Claude sometimes adds explanation before/after)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate the response structure
      if (!parsed.weights || typeof parsed.weights !== 'object') {
        throw new Error('Invalid weights in Claude response');
      }

      // Ensure all required weights are present and valid
      const weights: ContextWeights = {
        valence: this.clamp(parsed.weights.valence || 0.5, 0, 1),
        energy: this.clamp(parsed.weights.energy || 0.5, 0, 1),
        danceability: this.clamp(parsed.weights.danceability || 0.5, 0, 1),
        acousticness: this.clamp(parsed.weights.acousticness || 0.5, 0, 1),
        tempoModifier: this.clamp(parsed.weights.tempoModifier || 1.0, 0.5, 2.0),
      };

      return {
        weights,
        reasoning: parsed.reasoning || 'Context analysis completed',
        confidence: this.clamp(parsed.confidence || 0.8, 0, 1),
        musicGenres: Array.isArray(parsed.musicGenres) ? parsed.musicGenres : ['unknown'],
        mood: parsed.mood || 'neutral',
        energy: parsed.energy || 'medium',
        socialContext: parsed.socialContext || 'unknown',
        activityType: parsed.activityType || 'listening',
      };
    } catch (error) {
      logError('Failed to parse Claude response', error as Error, {
        responseText: responseText.substring(0, 200),
      });
      
      // Return default weights if parsing fails
      return {
        weights: {
          valence: 0.5,
          energy: 0.5,
          danceability: 0.5,
          acousticness: 0.5,
          tempoModifier: 1.0,
        },
        reasoning: 'Default weights used due to parsing error',
        confidence: 0.3,
        musicGenres: ['unknown'],
        mood: 'neutral',
        energy: 'medium',
        socialContext: 'unknown',
        activityType: 'listening',
      };
    }
  }

  /**
   * Get curated examples for Claude to learn from
   */
  private getContextExamples(): ContextExample[] {
    return [
      {
        input: "driving with friends, want upbeat music but not too intense",
        output: {
          valence: 0.7,
          energy: 0.7,
          danceability: 0.6,
          acousticness: 0.3,
          tempoModifier: 1.1
        },
        description: "Social driving context needs upbeat (high valence) but controlled energy, moderately danceable for sing-alongs"
      },
      {
        input: "studying late at night, need focus music like Max Richter",
        output: {
          valence: 0.4,
          energy: 0.3,
          danceability: 0.2,
          acousticness: 0.8,
          tempoModifier: 0.9
        },
        description: "Study context requires low distraction (acoustic, instrumental), contemplative mood, steady but not energetic"
      },
      {
        input: "workout at the gym, feeling motivated",
        output: {
          valence: 0.8,
          energy: 0.9,
          danceability: 0.8,
          acousticness: 0.1,
          tempoModifier: 1.3
        },
        description: "High energy workout needs motivation (high valence), very energetic, rhythmic for movement, electronic production"
      },
      {
        input: "rainy Sunday morning, feeling contemplative",
        output: {
          valence: 0.3,
          energy: 0.2,
          danceability: 0.2,
          acousticness: 0.7,
          tempoModifier: 0.8
        },
        description: "Contemplative mood suggests lower valence, calm energy, acoustic instruments, slower tempo for reflection"
      },
      {
        input: "getting ready for a date, feeling excited but nervous",
        output: {
          valence: 0.6,
          energy: 0.6,
          danceability: 0.5,
          acousticness: 0.4,
          tempoModifier: 1.0
        },
        description: "Mixed emotions (excited + nervous) = moderate valence, moderate energy to match mood complexity"
      },
      {
        input: "cooking dinner with my partner, want something romantic but not cheesy",
        output: {
          valence: 0.7,
          energy: 0.4,
          danceability: 0.3,
          acousticness: 0.6,
          tempoModifier: 0.9
        },
        description: "Romantic context needs positive but subtle energy, intimate (acoustic), not dance-focused"
      }
    ];
  }

  /**
   * Build user history context for personalization
   */
  private buildUserHistoryContext(userHistory: any): string {
    if (!userHistory.preferences) return '';

    return `
USER'S PERSONAL MUSIC HISTORY:
${userHistory.preferences.favoriteGenres?.length > 0 ? 
  `Favorite Genres: ${userHistory.preferences.favoriteGenres.join(', ')}` : ''}
${userHistory.preferences.audioFeatureTendencies ? 
  `Typical Preferences: ${JSON.stringify(userHistory.preferences.audioFeatureTendencies)}` : ''}

IMPORTANT: Use this history to PERSONALIZE the weights. If the user typically likes high energy music, bias slightly toward their preferences while still respecting the context.`;
  }

  /**
   * Cache context analysis to reduce API costs and improve performance
   */
  private async cacheContext(contextText: string, analysis: ContextAnalysis): Promise<void> {
    try {
      await db.cacheContext(contextText, analysis);
    } catch (error) {
      logError('Failed to cache context', error as Error);
      // Don't throw - caching failure shouldn't break the main flow
    }
  }

  /**
   * Get cached context analysis
   */
  private async getCachedContext(contextText: string): Promise<ContextAnalysis | null> {
    try {
      const cached = await db.getCachedContext(contextText);
      if (cached) {
        return JSON.parse(cached.contextParsed as string);
      }
    } catch (error) {
      logError('Failed to retrieve cached context', error as Error);
    }
    return null;
  }

  /**
   * Estimate token cost for logging
   */
  private estimateTokenCost(input: string, output: string): number {
    // Rough estimation: ~4 characters per token, Claude pricing
    const inputTokens = Math.ceil(input.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    
    // Claude 3.5 Sonnet pricing (approximate)
    const inputCostPer1K = 0.003;
    const outputCostPer1K = 0.015;
    
    return (inputTokens * inputCostPer1K / 1000) + (outputTokens * outputCostPer1K / 1000);
  }

  /**
   * Batch process multiple contexts (for optimization)
   */
  public async batchInterpretContexts(
    contexts: string[]
  ): Promise<Map<string, ContextAnalysis>> {
    const results = new Map<string, ContextAnalysis>();
    
    // Process in parallel but with rate limiting
    const batchSize = 3; // Conservative to avoid rate limits
    
    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      const batchPromises = batch.map(context => 
        this.interpretContext(context).catch(error => {
          logError('Batch context processing failed', error, { context });
          return null;
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result) {
          results.set(batch[index], result);
        }
      });
      
      // Small delay between batches to be respectful to API
      if (i + batchSize < contexts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Validate and improve context weights based on user feedback
   */
  public async learnFromFeedback(
    originalContext: string,
    originalWeights: ContextWeights,
    userFeedback: 'positive' | 'negative',
    actualUserBehavior: {
      averageListenTime: number;
      skipRate: number;
      upvoteRate: number;
    }
  ): Promise<ContextWeights> {
    // This is where individual learning happens - adjust weights based on user behavior
    const adjustmentFactor = userFeedback === 'positive' ? 0.1 : -0.1;
    
    // Adjust weights based on actual user behavior patterns
    const improvedWeights: ContextWeights = {
      valence: this.clamp(
        originalWeights.valence + (actualUserBehavior.upvoteRate - 0.5) * adjustmentFactor, 
        0, 1
      ),
      energy: this.clamp(
        originalWeights.energy + (1 - actualUserBehavior.skipRate) * adjustmentFactor,
        0, 1
      ),
      danceability: originalWeights.danceability,
      acousticness: originalWeights.acousticness,
      tempoModifier: originalWeights.tempoModifier,
    };

    // Cache the improved weights for similar future contexts
    await this.cacheContext(`${originalContext}_learned`, {
      weights: improvedWeights,
      reasoning: 'Weights adjusted based on user behavior',
      confidence: 0.9,
      musicGenres: [],
      mood: 'learned',
      energy: 'adjusted',
      socialContext: 'user_feedback',
      activityType: 'learning',
    });

    return improvedWeights;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

// Export singleton instance
export const contextProcessor = ContextProcessorService.getInstance();
export default contextProcessor;
