/**
 * Hybrid Intent Selector
 * 
 * Uses LLM to select the best intent template when rule-based confidence is too low.
 * This prevents intent mismatches and improves routing accuracy.
 */

import type { IntentResult } from './intent';
import type { RAGSettings } from '../../types';

// Available intent templates for LLM to choose from
const AVAILABLE_INTENTS = [
  // Tier 1: Specific
  'EQUIPMENT_OPTIMIZATION',
  'FORECASTING',
  'EQUIPMENT_COMBINATION',
  'TARGET_OPTIMIZATION',
  'ORDINAL_ROW',
  
  // Tier 2: Moderate
  'MONTHLY_SUMMARY',
  'SHIFT_SPECIFIC',
  'ROUTE_SPECIFIC',
  'DATE_RANGE_QUERY',
  'COMPARISON_QUERY',
  
  // Tier 3: Generic
  'CHART_VISUALIZATION',
  'CALCULATION',
  'DATA_RETRIEVAL',
  'AGGREGATION_QUERY',
  'UNKNOWN'
];

const INTENT_DESCRIPTIONS: Record<string, string> = {
  'EQUIPMENT_OPTIMIZATION': 'User wants recommendations for best equipment selection or optimization (e.g., "which excavator should I pick", "best combination")',
  'FORECASTING': 'User wants predictions or forecasts for future production (e.g., "forecast next week", "predict tomorrow")',
  'EQUIPMENT_COMBINATION': 'User asks about which equipment worked together or pairs (e.g., "which tippers worked with EX-141", "equipment pairs")',
  'TARGET_OPTIMIZATION': 'User wants to plan for a specific production target (e.g., "mine 5000 tons", "target 3000 m3")',
  'ORDINAL_ROW': 'User wants a specific row by position (e.g., "first 5 rows", "top 10 results", "last entry")',
  'MONTHLY_SUMMARY': 'User explicitly wants a monthly summary or report (e.g., "monthly summary", "January report", "month breakdown"). NOT for simple queries like "show January data" or "plot January".',
  'SHIFT_SPECIFIC': 'User asks about a specific shift (A, B, C) (e.g., "shift A production", "how much did shift B produce")',
  'ROUTE_SPECIFIC': 'User asks about a specific route or face (e.g., "Route 1 tonnage", "production at Face A")',
  'DATE_RANGE_QUERY': 'User wants data for a date range (e.g., "last week", "January 1-15", "past 30 days")',
  'COMPARISON_QUERY': 'User compares two things (e.g., "compare shift A vs B", "EX-141 versus EX-139")',
  'CHART_VISUALIZATION': 'User explicitly wants a chart/graph/plot (e.g., "show me a chart", "plot production over time", "graph tonnage")',
  'CALCULATION': 'User wants calculations like average, sum, total (e.g., "average tonnage", "total trips")',
  'DATA_RETRIEVAL': 'User wants to retrieve specific data records (e.g., "show production data", "list all trips")',
  'AGGREGATION_QUERY': 'User wants aggregated/summarized data (e.g., "total production", "count of trips")',
  'UNKNOWN': 'Query is unclear or does not fit any specific intent pattern'
};

const LLM_INTENT_SELECTION_PROMPT = `You are an intent classifier for a mining operations assistant. Your job is to select the MOST APPROPRIATE intent template for the user's question.

Available Intent Templates:
${AVAILABLE_INTENTS.map(intent => `- ${intent}: ${INTENT_DESCRIPTIONS[intent]}`).join('\n')}

IMPORTANT RULES:
1. Choose the MOST SPECIFIC intent that matches (prefer Tier 1 over Tier 2 over Tier 3)
2. EQUIPMENT_OPTIMIZATION is for RECOMMENDATIONS only, not data queries about equipment
3. MONTHLY_SUMMARY requires explicit "monthly", "summary", or "report" keywords - NOT just a month name
4. If query has "plot", "chart", "graph", or "visualize", choose CHART_VISUALIZATION
5. If query asks "which equipment", check if it's asking for recommendations (EQUIPMENT_OPTIMIZATION) or historical data (EQUIPMENT_COMBINATION)
6. FORECASTING is only for future predictions, not historical analysis
7. Month names alone (January, February) are just date filters, not MONTHLY_SUMMARY intent
8. If query mentions "combination", "combinations", "pairs", "pairings", "worked together", "working together", always choose EQUIPMENT_COMBINATION (even with date filters)
9. DATE_RANGE_QUERY is ONLY for queries that ONLY ask for date ranges with NO specific metric or analysis (e.g., "show me last week" with nothing else)
10. Use UNKNOWN if the query is too vague or meaningless

Examples:
- "Plot production for January" → CHART_VISUALIZATION (has "plot")
- "Show monthly summary for January" → MONTHLY_SUMMARY (has "monthly summary")
- "Production in January" → DATA_RETRIEVAL (just a date filter)
- "Which routes in January" → ROUTE_SPECIFIC (route query with date filter)
- "Equipment combinations in January" → EQUIPMENT_COMBINATION (has "combinations" keyword)
- "Show equipment pairs for January" → EQUIPMENT_COMBINATION (has "pairs" keyword)

Return ONLY the intent name (e.g., "DATA_RETRIEVAL") with NO explanation.`;

/**
 * Use LLM to select the best intent template when rule-based confidence is low
 */
export async function selectIntentWithLLM(
  question: string,
  ruleBasedIntent: IntentResult,
  settings: RAGSettings
): Promise<IntentResult> {
  
  if (!settings.openai_api_key) {
    console.warn('[Hybrid Intent] No OpenAI key - falling back to rule-based intent');
    return ruleBasedIntent;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openai_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: LLM_INTENT_SELECTION_PROMPT },
          { role: 'user', content: `User Question: "${question}"\n\nRule-based guess: ${ruleBasedIntent.intent} (confidence: ${ruleBasedIntent.confidence.toFixed(2)})\n\nSelect the best intent:` }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const selectedIntent = data.choices[0]?.message?.content?.trim().toUpperCase() || 'UNKNOWN';
    
    // Validate that LLM returned a valid intent
    if (!AVAILABLE_INTENTS.includes(selectedIntent)) {
      console.warn(`[Hybrid Intent] LLM returned invalid intent: "${selectedIntent}", falling back to rule-based`);
      return ruleBasedIntent;
    }

    console.log(`[Hybrid Intent] LLM selected: ${selectedIntent} (was: ${ruleBasedIntent.intent})`);
    
    // Return enhanced intent with high confidence since LLM made the decision
    return {
      intent: selectedIntent,
      confidence: 0.85, // Boost confidence when LLM makes the choice
      matched_keywords: [...ruleBasedIntent.matched_keywords, 'llm_selected'],
      parameters: ruleBasedIntent.parameters,
      fuzzy_matches: ruleBasedIntent.fuzzy_matches
    };
    
  } catch (error) {
    console.error('[Hybrid Intent] LLM selection failed:', error);
    return ruleBasedIntent; // Fallback to rule-based
  }
}

/**
 * Decide whether to use LLM for intent selection based on confidence threshold
 */
export function shouldUseLLMForIntent(intentResult: IntentResult): boolean {
  // Never use LLM for these intents - rule router handles them perfectly
  const RULE_ROUTER_STRONG_INTENTS = new Set([
    'CHART_VISUALIZATION',  // Rule router has high confidence for visualization keywords
    'ROUTES_FACES_ANALYSIS', // Rule router has high confidence for route/face keywords
    'EQUIPMENT_OPTIMIZATION', // Rule router handles optimization well
    'FORECASTING',           // Rule router handles forecasting well
    'ADVISORY_QUERY'         // Rule router handles advisory well
  ]);
  
  if (RULE_ROUTER_STRONG_INTENTS.has(intentResult.intent)) {
    return false; // Trust the rule-based detection for these
  }
  
  // Use LLM if:
  // 1. Confidence is below 0.7 (medium-low confidence)
  // 2. Intent is UNKNOWN
  return intentResult.confidence < 0.7 || intentResult.intent === 'UNKNOWN';
}
