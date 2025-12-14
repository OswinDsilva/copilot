/**
 * Fallback Router
 * Catches queries that didn't match specific rules using heuristic patterns
 */

import type { RouterDecision } from '../types';
import { PATTERNS } from './helpers/patterns';
import { debugBranch } from './helpers/debug';

export function fallbackRoute(question: string): RouterDecision {
  const q = question.toLowerCase();
  
  // Reject meaningless queries: too short or lacks meaningful content
  const trimmed = question.trim();
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  const hasMeaningfulWords = /\b(?:show|what|how|when|where|why|list|get|find|calculate|production|tonnage|trips|shift|equipment|excavator|tipper|today|yesterday|month|week|compare|total|average|best|optimize|forecast|predict)\b/i.test(trimmed);
  
  // Reject if:
  // 1. Less than 2 characters, OR
  // 2. Single word AND no meaningful keywords
  if (trimmed.length < 2 || (wordCount === 1 && !hasMeaningfulWords)) {
    debugBranch('fallback_rejected_meaningless');
    return {
      task: 'rag',
      confidence: 0.3,
      reason: 'Query too short or lacks meaningful content. Please ask a complete question about mining operations, production data, or equipment.',
      route_source: 'deterministic',
      namespaces: ['combined'],
      original_question: question,
      template_used: 'rejected_query_template'
    };
  }
  
  // RAG patterns: advisory, how-to, best practices
  if (PATTERNS.ADVISORY.test(question)) {
    debugBranch('fallback_advisory');
    return {
      task: 'rag',
      confidence: 0.75,
      reason: 'Detected advisory/procedural pattern (catch-all)',
      route_source: 'deterministic',
      namespaces: ['combined'],
      original_question: question,
      template_used: 'advisory_rule_template'
    };
  }
  
  // Optimize patterns: equipment selection, forecasting
  if (PATTERNS.OPTIMIZATION.test(question)) {
    debugBranch('fallback_optimization');
    return {
      task: 'optimize',
      confidence: 0.75,
      reason: 'Detected optimization/forecasting pattern (catch-all)',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'optimize_rule_template'
    };
  }
  
  // Strong SQL indicators - high confidence
  const strongSQLPatterns = [
    // Data retrieval keywords
    /\b(show|display|list|get|fetch|retrieve|find|search|query)\b/i,
    // Table/database keywords
    /\b(table|column|row|record|data|database|entries)\b/i,
    // Aggregation keywords
    /\b(count|sum|total|average|mean|median|max|min|aggregate)\b/i,
    // Mining operations keywords
    /\b(production|tonnage|trips|shift|equipment|excavator|tipper|dumper|vehicle)\b/i,
    // Temporal keywords
    /\b(today|yesterday|this week|this month|january|february|march|april|may|june|july|august|september|october|november|december|2024|2025)\b/i,
    // Comparison keywords
    /\b(compare|versus|vs|difference|higher|lower|more|less|between)\b/i,
    // Filtering keywords
    /\b(where|filter|by|for|in|on|during|when)\b/i,
  ];
  
  const hasStrongSQLIndicator = strongSQLPatterns.some(pattern => pattern.test(q));
  
  if (hasStrongSQLIndicator) {
    debugBranch('fallback_strong_sql');
    return {
      task: 'sql',
      confidence: 0.8,
      reason: 'Detected strong SQL/data indicators (high confidence fallback)',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'data_retrieval_rule_template'
    };
  }
  
  // Standard SQL patterns: data queries, tables, columns
  if (PATTERNS.SQL_DATA.test(question)) {
    debugBranch('fallback_sql_data');
    return {
      task: 'sql',
      confidence: 0.75,
      reason: 'Detected SQL/data query pattern (catch-all)',
      route_source: 'deterministic',
      original_question: question,
      template_used: 'data_retrieval_rule_template'
    };
  }
  
  // Final fallback: Default to RAG with low confidence for unclear queries
  // This ensures the LLM router will be called to make a better decision
  debugBranch('fallback_unclear');
  return {
    task: 'rag',
    confidence: 0.5,
    reason: 'Query unclear - could not determine intent. Defaulting to RAG for general assistance.',
    route_source: 'deterministic',
    namespaces: ['combined'],
    original_question: question,
    template_used: 'unclear_query_template'
  };
}
