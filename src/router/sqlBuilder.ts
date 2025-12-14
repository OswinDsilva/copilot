import { buildStatisticalSQL } from './builders/statisticalBuilder';
/**
 * SQL Builder - LLM-First Architecture (Option 3)
 * 
 * PHILOSOPHY: The SQL builder should only handle queries that have PROVEN,
 * well-tested templates. Everything else goes to the LLM which can handle
 * novel queries, edge cases, and complex combinations.
 * 
 * Flow:
 * 1. Router detects intent and extracts parameters
 * 2. SQL Builder ONLY handles whitelist of proven patterns
 * 3. For EVERYTHING else, return null → LLM generates SQL
 * 
 * WHITELIST (proven patterns that consistently work):
 * - STATISTICAL_QUERY: Mean, median, mode, stddev with month/date filters
 * - COMPARISON_QUERY: Compare shift A vs shift B, month vs month
 * - ORDINAL_ROW_QUERY: First, last, Nth row queries
 * 
 * EVERYTHING ELSE → LLM (it handles novel queries much better than
 * adding more brittle template handlers)
 */

// Only import the PROVEN builders we're keeping
import { buildOrdinalRowSQL } from './builders/ranking';

/**
 * Main SQL builder function - LLM-First Architecture
 * 
 * ONLY handles 2 proven patterns:
 * - STATISTICAL_QUERY
 * - ORDINAL_ROW_QUERY
 * 
 * Everything else returns null → LLM handles it
 */
export function buildSQL(
  intent: string,
  params: Record<string, any>,
  question: string
): string | null {
  console.log('[buildSQL] ========================================');
  console.log('[buildSQL] Intent:', intent);
  console.log('[buildSQL] LLM-First mode: Only handling whitelisted patterns');
  
  // WHITELIST: Only these 2 proven patterns get SQL builder treatment
  // COMPARISON_QUERY removed - too many edge cases, LLM handles better
  switch (intent) {
    case 'STATISTICAL_QUERY':
      console.log('[buildSQL] ✅ WHITELISTED: Statistical query');
      return buildStatisticalSQL(params, question);
    
    case 'ORDINAL_ROW_QUERY':
      console.log('[buildSQL] ✅ WHITELISTED: Ordinal row query');
      return buildOrdinalRowSQL(params, question);
    
    // EVERYTHING ELSE → LLM (including COMPARISON_QUERY)
    default:
      console.log(`[buildSQL] ❌ NOT WHITELISTED: ${intent} → Delegating to LLM`);
      return null;
  }
}
