import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import { MatchResult, UnmatchedItem } from './types.js';

interface LLMMatch {
  masterValue: string;
  sourceValue: string;
  confidence: number;
  reasoning: string;
}

interface LLMResponse {
  matches: LLMMatch[];
  unmatched: Array<{
    sourceValue: string;
    reason: string;
    bestCandidate?: {
      value: string;
      confidence: number;
    };
  }>;
}

export class SemanticMatcher {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }

  /**
   * Perform semantic matching between master and source values using LLM
   */
  async matchValues(
    masterValues: Array<{ value: string; rowIndex: number }>,
    sourceValues: Array<{ value: string; rowIndex: number }>,
    confidenceThreshold: number = 0.8,
    model: string = 'gpt-4o-mini',
    batchSize: number = 60
  ): Promise<{ matches: MatchResult[]; unmatched: UnmatchedItem[] }> {
    logger.info('Starting semantic matching', {
      masterCount: masterValues.length,
      sourceCount: sourceValues.length,
      threshold: confidenceThreshold,
      batchSize
    });

    // Extract values for LLM (master values are needed for every batch)
    const masterValueList = masterValues.map(m => m.value);

    // Helper to process a single batch
    const processBatch = async (batchSourceValues: Array<{ value: string; rowIndex: number }>, batchIndex: number) => {
      const sourceValueList = batchSourceValues.map(s => s.value);
      const prompt = this.buildMatchingPrompt(masterValueList, sourceValueList, confidenceThreshold);

      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a semantic matching assistant. Your task is to match values from a source list to a master list based on semantic similarity and meaning, not just string equality. 

Rules:
1. Consider variations in formatting, prefixes, suffixes, abbreviations, and spelling differences
2. Examples of valid matches:
   - "kota Surabaya" ≈ "Surabaya" (confidence: 0.95)
   - "DKI Jakarta" ≈ "Jakarta" (confidence: 0.90)
   - "Product A-123" ≈ "A123" (confidence: 0.85)
   - "John Smith Jr." ≈ "Smith, John" (confidence: 0.88)
   - "PT. ABC Indonesia" ≈ "ABC Indonesia" (confidence: 0.92)
   - "New York City" ≈ "NYC" (confidence: 0.85)

3. Each match must have a confidence score between 0 and 1
4. Only return matches with confidence >= threshold
5. For unmatched items, provide the best candidate if one exists
6. Be precise - don't match completely different values

Return ONLY valid JSON in the specified format.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error(`Empty response from OpenAI for batch ${batchIndex}`);
        }

        const llmResult: LLMResponse = JSON.parse(content);
        return llmResult;
      } catch (error) {
        logger.error(`Error processing batch ${batchIndex}`, { error });
        throw error;
      }
    };

    // Split sourceValues into chunks
    const chunks: Array<Array<{ value: string; rowIndex: number }>> = [];
    for (let i = 0; i < sourceValues.length; i += batchSize) {
      chunks.push(sourceValues.slice(i, i + batchSize));
    }

    logger.info(`Split ${sourceValues.length} source items into ${chunks.length} batches`);

    // Process chunks with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const allMatches: MatchResult[] = [];
    const allUnmatched: UnmatchedItem[] = [];

    for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
      const batchPromises = chunks.slice(i, i + CONCURRENCY_LIMIT).map(async (chunk, idx) => {
        const result = await processBatch(chunk, i + idx);
        
        // Map results back to original objects
        const matches: MatchResult[] = result.matches.map(match => {
          const masterItem = masterValues.find(m => m.value === match.masterValue);
          const sourceItem = chunk.find(s => s.value === match.sourceValue);

          if (!masterItem || !sourceItem) return null;

          return {
            masterValue: match.masterValue,
            sourceValue: match.sourceValue,
            confidence: match.confidence,
            masterRowIndex: masterItem.rowIndex,
            sourceRowIndex: sourceItem.rowIndex
          };
        }).filter((m): m is MatchResult => m !== null);

        const unmatched: UnmatchedItem[] = result.unmatched.map(item => {
          const sourceItem = chunk.find(s => s.value === item.sourceValue);
          return {
            sourceValue: item.sourceValue,
            sourceRowIndex: sourceItem?.rowIndex ?? -1,
            reason: item.reason,
            bestCandidate: item.bestCandidate
          };
        });

        return { matches, unmatched };
      });

      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(res => {
        allMatches.push(...res.matches);
        allUnmatched.push(...res.unmatched);
      });
      
      logger.info(`Processed batches ${i + 1} to ${Math.min(i + CONCURRENCY_LIMIT, chunks.length)}`);
    }

    logger.info('Semantic matching completed', {
      matchesFound: allMatches.length,
      unmatchedCount: allUnmatched.length,
      avgConfidence: allMatches.length > 0 
        ? allMatches.reduce((sum, m) => sum + m.confidence, 0) / allMatches.length 
        : 0
    });

    return { matches: allMatches, unmatched: allUnmatched };
  }

  /**
   * Build the matching prompt for the LLM
   */
  private buildMatchingPrompt(
    masterValues: string[],
    sourceValues: string[],
    threshold: number
  ): string {
    return `Match values from the SOURCE list to the MASTER list.

MASTER values (${masterValues.length} items):
${JSON.stringify(masterValues, null, 2)}

SOURCE values (${sourceValues.length} items):
${JSON.stringify(sourceValues, null, 2)}

Confidence threshold: ${threshold}

Task:
1. For each SOURCE value, find the best matching MASTER value based on semantic meaning
2. Consider formatting differences, abbreviations, prefixes, suffixes
3. Assign a confidence score (0-1) to each match
4. Only include matches with confidence >= ${threshold}
5. Source values that don't match any master value should be in "unmatched"

Return JSON in this exact format:
{
  "matches": [
    {
      "masterValue": "exact master value",
      "sourceValue": "exact source value",
      "confidence": 0.95,
      "reasoning": "brief explanation"
    }
  ],
  "unmatched": [
    {
      "sourceValue": "source value that didn't match",
      "reason": "why it didn't match",
      "bestCandidate": {
        "value": "closest master value if any",
        "confidence": 0.45
      }
    }
  ]
}`;
  }

  /**
   * Preview matches without performing actual matching
   * Useful for validating matching approach
   */
  async previewMatching(
    masterValues: string[],
    sourceValues: string[],
    model: string = 'gpt-4o-mini'
  ): Promise<{ sampleMatches: LLMMatch[]; estimatedAccuracy: number }> {
    const prompt = `Preview semantic matching between these lists:

MASTER (${masterValues.length} items): ${JSON.stringify(masterValues.slice(0, 10))}${masterValues.length > 10 ? '...' : ''}

SOURCE (${sourceValues.length} items): ${JSON.stringify(sourceValues.slice(0, 10))}${sourceValues.length > 10 ? '...' : ''}

Provide a preview of how these would match, including sample matches and estimated accuracy.

Return JSON:
{
  "sampleMatches": [
    {
      "masterValue": "...",
      "sourceValue": "...",
      "confidence": 0.95,
      "reasoning": "..."
    }
  ],
  "estimatedAccuracy": 0.85
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a semantic matching preview assistant. Provide realistic estimates based on the data provided.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      logger.error('Error in preview matching', { error });
      throw error;
    }
  }
}
