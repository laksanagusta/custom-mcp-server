import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import { MatchResult, UnmatchedItem } from './types.js';

/**
 * NEW APPROACH:
 * 1. Send source values and master values to LLM
 * 2. LLM returns for each source value: the EXACT master value that has same meaning (or null if no match)
 * 3. We then do EXACT STRING MATCHING to find the master row
 * 
 * This eliminates issues with:
 * - LLM returning slightly different values
 * - Normalized matching not finding items
 * - Complex row index calculations
 */

interface NormalizedSourceItem {
  originalSourceValue: string;
  normalizedToMaster: string | null;  // Exact master value if matched, null if no match
  confidence: number;
  reasoning: string;
}

interface LLMNormalizationResponse {
  normalizedItems: NormalizedSourceItem[];
}

export class SemanticMatcher {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    });
  }

  /**
   * Build a map from master values to their row indices for fast lookup
   */
  private buildMasterValueMap(masterValues: Array<{ value: string; rowIndex: number }>): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of masterValues) {
      // Store with exact value as key
      map.set(item.value, item.rowIndex);
    }
    return map;
  }

  /**
   * Perform semantic matching using the new "normalize to master" approach
   */
  async matchValues(
    masterValues: Array<{ value: string; rowIndex: number }>,
    sourceValues: Array<{ value: string; rowIndex: number }>,
    confidenceThreshold: number = 0.8,
    model: string = 'gpt-4o-mini'
  ): Promise<{ matches: MatchResult[]; unmatched: UnmatchedItem[] }> {
    logger.info('Starting semantic matching (normalize-to-master approach)', {
      masterCount: masterValues.length,
      sourceCount: sourceValues.length,
      threshold: confidenceThreshold
    });

    // Build lookup map for master values
    const masterValueMap = this.buildMasterValueMap(masterValues);
    const masterValueList = masterValues.map(m => m.value);

    const BATCH_SIZE = 20;
    const CONCURRENCY_LIMIT = 50;
    
    // Create batch definitions
    interface BatchDefinition {
      sourceBatch: Array<{ value: string; rowIndex: number }>;
      batchNumber: number;
    }
    const batchDefinitions: BatchDefinition[] = [];

    for (let i = 0; i < sourceValues.length; i += BATCH_SIZE) {
      batchDefinitions.push({
        sourceBatch: sourceValues.slice(i, i + BATCH_SIZE),
        batchNumber: Math.floor(i / BATCH_SIZE) + 1
      });
    }

    const totalBatches = batchDefinitions.length;
    const allMatches: MatchResult[] = [];
    const allUnmatched: UnmatchedItem[] = [];

    // Define the processor function
    const processBatch = async ({ sourceBatch, batchNumber }: BatchDefinition) => {
      logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchSize: sourceBatch.length
      });

      const sourceValueList = sourceBatch.map(s => s.value);

      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a data normalization assistant. Your task is to match source values to master values based on semantic meaning.

TASK:
For each SOURCE value, find the MASTER value that has the SAME MEANING and return the EXACT master value string.

RULES:
1. If a source value has the same meaning as a master value, return the EXACT master value string (copy-paste it exactly)
2. If no master value matches the meaning, return null
3. Consider variations like:
   - Prefixes/suffixes: "IKP 24.2 Persentase..." matches "Persentase..."
   - Case differences: "JAKARTA" matches "Jakarta"
   - Abbreviations: "DKI Jakarta" matches "Jakarta" 
   - Formatting: "PT. ABC" matches "ABC"
   - Typos or slight variations in spelling
4. Assign confidence score (0-1) for each match
5. Only match if confidence >= ${confidenceThreshold}
6. CRITICAL: The normalizedToMaster value MUST be an EXACT copy from the master list, or null. Do not modify, trim, or alter the master value in any way.

Return JSON format:
{
  "normalizedItems": [
    {
      "originalSourceValue": "exact source value",
      "normalizedToMaster": "exact master value or null",
      "confidence": 0.95,
      "reasoning": "brief explanation"
    }
  ]
}`
            },
            {
              role: 'user',
              content: `MASTER VALUES (${masterValueList.length} items):
${JSON.stringify(masterValueList, null, 2)}

SOURCE VALUES to normalize (${sourceValueList.length} items):
${JSON.stringify(sourceValueList, null, 2)}

For each source value, return the EXACT matching master value or null if no match.`
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }

        const llmResult: LLMNormalizationResponse = JSON.parse(content);

        const batchMatches: MatchResult[] = [];
        const batchUnmatched: UnmatchedItem[] = [];

        for (const item of llmResult.normalizedItems) {
          // Find the original source item
          const sourceItem = sourceBatch.find(s => s.value === item.originalSourceValue);
          
          if (!sourceItem) {
            logger.warn('LLM returned item not found in source batch', {
              originalSourceValue: item.originalSourceValue,
              availableSourceValues: sourceBatch.slice(0, 3).map(s => s.value)
            });
            continue;
          }

          if (item.normalizedToMaster && item.confidence >= confidenceThreshold) {
            // Look up master row using EXACT STRING MATCH
            const masterRowIndex = masterValueMap.get(item.normalizedToMaster);

            if (masterRowIndex !== undefined) {
              batchMatches.push({
                masterValue: item.normalizedToMaster,
                sourceValue: item.originalSourceValue,
                confidence: item.confidence,
                masterRowIndex: masterRowIndex,
                sourceRowIndex: sourceItem.rowIndex
              });

              logger.debug('Match found', {
                source: item.originalSourceValue.substring(0, 50),
                master: item.normalizedToMaster.substring(0, 50),
                confidence: item.confidence,
                masterRow: masterRowIndex,
                sourceRow: sourceItem.rowIndex
              });
            } else {
              // LLM returned a master value that doesn't exist in our list
              logger.warn('LLM returned master value not found in master list', {
                returnedMasterValue: item.normalizedToMaster,
                sourceValue: item.originalSourceValue,
                confidence: item.confidence
              });
              
              batchUnmatched.push({
                sourceValue: item.originalSourceValue,
                sourceRowIndex: sourceItem.rowIndex,
                reason: `LLM suggested "${item.normalizedToMaster}" but it was not found in master list`,
                bestCandidate: {
                  value: item.normalizedToMaster,
                  confidence: item.confidence
                }
              });
            }
          } else {
            // No match or below threshold
            batchUnmatched.push({
              sourceValue: item.originalSourceValue,
              sourceRowIndex: sourceItem.rowIndex,
              reason: item.normalizedToMaster 
                ? `Confidence ${item.confidence} below threshold ${confidenceThreshold}: ${item.reasoning}`
                : `No matching master value: ${item.reasoning}`,
              bestCandidate: item.normalizedToMaster ? {
                value: item.normalizedToMaster,
                confidence: item.confidence
              } : undefined
            });
          }
        }

        // Check if all source items were processed
        const processedSourceValues = new Set(llmResult.normalizedItems.map(i => i.originalSourceValue));
        for (const sourceItem of sourceBatch) {
          if (!processedSourceValues.has(sourceItem.value)) {
            logger.warn('Source item not processed by LLM', {
              sourceValue: sourceItem.value
            });
            batchUnmatched.push({
              sourceValue: sourceItem.value,
              sourceRowIndex: sourceItem.rowIndex,
              reason: 'Not processed by LLM'
            });
          }
        }

        return { matches: batchMatches, unmatched: batchUnmatched };

      } catch (error) {
        logger.error(`Error in semantic matching batch ${batchNumber}`, { error });
        throw new Error(`Semantic matching failed for batch ${batchNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    // Execute in chunks to respect concurrency limit
    for (let i = 0; i < batchDefinitions.length; i += CONCURRENCY_LIMIT) {
      const chunk = batchDefinitions.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(chunk.map(processBatch));
      
      results.forEach(res => {
        allMatches.push(...res.matches);
        allUnmatched.push(...res.unmatched);
      });
    }

    logger.info('Semantic matching completed', {
      totalMatches: allMatches.length,
      totalUnmatched: allUnmatched.length,
      avgConfidence: allMatches.length > 0 ? allMatches.reduce((sum, m) => sum + m.confidence, 0) / allMatches.length : 0,
      matchedMasterValues: allMatches.map(m => m.masterValue.substring(0, 30)),
      sampleUnmatched: allUnmatched.slice(0, 5).map(u => ({ value: u.sourceValue.substring(0, 30), reason: u.reason }))
    });

    return { matches: allMatches, unmatched: allUnmatched };
  }

  /**
   * Preview matches without performing actual matching
   * Useful for validating matching approach
   */
  async previewMatching(
    masterValues: string[],
    sourceValues: string[],
    model: string = 'gpt-4o-mini'
  ): Promise<{ sampleMatches: Array<{ masterValue: string; sourceValue: string; confidence: number; reasoning: string }>; estimatedAccuracy: number }> {
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
