// llmRouter.ts
// LLM-based routing and SQL generation
// Fallback when deterministic rules can't confidently route the query

import type { RouterDecision } from '../types';
import type { IntentResult } from './services/intent';
import type { RAGSettings } from '../types';
import { routerRulesPrompt } from './prompts/routerRules.js';
import { sqlGenerationPrompt } from './prompts/sqlGenerationRules.js';
import { sanitizeSQL } from '../sql/sanitizeSQL';
import { retryWithBackoff, llmCircuitBreaker } from './helpers/errorHandling';

/**
 * Validate LLM response for router decision
 * Ensures the response has correct structure and valid values
 */
function validateRouterDecision(response: any): { valid: boolean; error?: string } {
  // Check if response is an object
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check required fields exist
  if (!('task' in response)) {
    return { valid: false, error: 'Missing required field: task' };
  }
  if (!('confidence' in response)) {
    return { valid: false, error: 'Missing required field: confidence' };
  }
  if (!('reason' in response)) {
    return { valid: false, error: 'Missing required field: reason' };
  }

  // Validate task is one of the allowed values
  const validTasks = ['sql', 'rag', 'optimize'];
  if (!validTasks.includes(response.task)) {
    return { 
      valid: false, 
      error: `Invalid task type: "${response.task}". Must be one of: ${validTasks.join(', ')}` 
    };
  }

  // Validate confidence is a number between 0 and 1
  if (typeof response.confidence !== 'number') {
    return { 
      valid: false, 
      error: `Confidence must be a number, got: ${typeof response.confidence}` 
    };
  }
  if (response.confidence < 0 || response.confidence > 1) {
    return { 
      valid: false, 
      error: `Confidence must be between 0 and 1, got: ${response.confidence}` 
    };
  }

  // Validate reason is a non-empty string
  if (typeof response.reason !== 'string' || response.reason.trim().length === 0) {
    return { 
      valid: false, 
      error: 'Reason must be a non-empty string' 
    };
  }

  return { valid: true };
}

/**
 * Route a question using LLM (OpenAI GPT) when deterministic rules fail
 * @param question User's question
 * @param intentInfo Intent analysis from normalizer
 * @param schema Database schema
 * @param settings RAG settings with API keys
 * @returns RouterDecision with task, confidence, reason
 */
export async function llmRoute(
  question: string,
  intentInfo: IntentResult,
  schema: any,
  settings?: RAGSettings
): Promise<RouterDecision> {
  const OPENAI_API_KEY = settings?.openai_api_key || import.meta.env.VITE_OPENAI_API_KEY || '';

  if (!OPENAI_API_KEY) {
    // No API key - return default SQL decision
    return {
      task: 'sql',
      confidence: 0.5,
      reason: 'No OpenAI API key configured, defaulting to SQL. Please add it in Settings.',
      original_question: question,
      route_source: 'deterministic'
    };
  }

  // Build prompt using router rules template
  const prompt = routerRulesPrompt(question, schema);

  try {
    // Use circuit breaker and retry logic for LLM call
    const decision = await llmCircuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: 'You are a query routing assistant. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.3,
              max_tokens: 500
            })
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
          }

          const data = await response.json();
          
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response structure from OpenAI API');
          }

          const content = data.choices[0].message.content.trim();

          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No valid JSON found in response');
          }

          const parsedResponse = JSON.parse(jsonMatch[0]);

          // Validate the LLM response structure
          const validation = validateRouterDecision(parsedResponse);
          if (!validation.valid) {
            console.warn(`[LLM Router] Invalid response from LLM: ${validation.error}`);
            throw new Error(`LLM returned invalid response: ${validation.error}`);
          }

          return parsedResponse as RouterDecision;
        },
        {
          operation: 'LLM Routing',
          query: question,
          intent: intentInfo.intent,
          step: 'llm_route'
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          timeout: 30000
        }
      );
    });

    // Mark that LLM was used
    decision.route_source = 'llm';

    // Add low confidence warning
    if (decision.confidence < 0.6) {
      decision.reason += ' (Low confidence - please confirm)';
    }

    // Attach original question and intent info
    decision.original_question = question;
    decision.intent = intentInfo.intent;
    decision.intent_confidence = intentInfo.confidence;
    decision.intent_keywords = intentInfo.matched_keywords;
    decision.parameters = intentInfo.parameters;

    return decision;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[LLM Router] Error:', errorMessage);

    // Enhanced fallback with error context
    let task: 'sql' | 'rag' | 'optimize';
    let reason: string;

    if (errorMessage.includes('Circuit breaker is open')) {
      reason = `LLM service temporarily unavailable (too many failures). Using intent-based fallback: ${intentInfo.intent}`;
    } else if (errorMessage.includes('timed out')) {
      reason = `LLM request timed out after 30s. Using intent-based fallback: ${intentInfo.intent}`;
    } else {
      reason = `LLM routing failed (${errorMessage}). Using intent-based fallback: ${intentInfo.intent}`;
    }

    if (intentInfo.intent === 'ADVISORY_QUERY') {
      task = 'rag';
    } else if (intentInfo.intent === 'EQUIPMENT_OPTIMIZATION' || intentInfo.intent === 'FORECASTING') {
      task = 'optimize';
    } else {
      task = 'sql';
    }

    return {
      task,
      confidence: Math.max(0.5, intentInfo.confidence),
      reason,
      keywords: intentInfo.matched_keywords,
      original_question: question,
      route_source: 'deterministic',
      intent: intentInfo.intent,
      intent_confidence: intentInfo.confidence,
      intent_keywords: intentInfo.matched_keywords,
      parameters: intentInfo.parameters
    };
  }
}

/**
 * Generate SQL using Two-Stage approach for better accuracy
 * 
 * Stage 1: Schema Resolution - LLM determines tables/columns
 * Stage 2: SQL Generation - LLM generates SQL with validated schema
 * 
 * This prevents column hallucination by validating against actual schema
 * 
 * @param decision Router decision with intent and parameters
 * @param schema Database schema (unused - we use hardcoded schema for validation)
 * @param settings RAG settings with API keys
 * @param chatHistory Recent conversation history
 * @returns SQL query string
 */
export async function generateSQLFromIntent(
  decision: RouterDecision,
  schema: any,
  settings?: RAGSettings,
  chatHistory?: Array<{ question: string; answer: string; route_taken?: string }>
): Promise<string> {
  const userQuestion = decision.original_question || decision.keywords?.join(' ') || '';

  // PHASE 2: Try SQL builder first (fast, deterministic, no LLM needed)
  if (decision.intent && decision.parameters) {
    const { buildSQL } = await import('./sqlBuilder');
    const builtSQL = buildSQL(decision.intent, decision.parameters, userQuestion);
    
    if (builtSQL) {
      console.log(`[SQL Builder] Generated SQL for intent: ${decision.intent}`);
      return builtSQL;
    }
    
    console.log(`[SQL Builder] No match for intent: ${decision.intent}, falling back to Two-Stage LLM`);
  }

  // Use Two-Stage SQL Generation for better accuracy
  const OPENAI_API_KEY = settings?.openai_api_key || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || '';

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please add it in Settings > Configuration > API Configuration');
  }

  try {
    // Import and use Two-Stage generator
    const { twoStageSQLGenerate } = await import('./services/twoStageSQLGenerator');
    
    const sql = await twoStageSQLGenerate(
      userQuestion,
      decision.parameters || {},
      OPENAI_API_KEY
    );
    
    return sql;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Two-Stage SQL] Error:', errorMessage);
    
    // Fallback to legacy single-stage generation
    console.log('[Two-Stage SQL] Falling back to legacy generation...');
    return await legacySQLGenerate(userQuestion, decision, schema, settings, chatHistory);
  }
}

/**
 * Legacy single-stage SQL generation (fallback)
 */
async function legacySQLGenerate(
  userQuestion: string,
  decision: RouterDecision,
  schema: any,
  settings?: RAGSettings,
  chatHistory?: Array<{ question: string; answer: string; route_taken?: string }>
): Promise<string> {
  const OPENAI_API_KEY = settings?.openai_api_key || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || '';

  // Format recent conversation history (last 3 exchanges)
  const recentHistory = chatHistory ? chatHistory.slice(-3) : [];
  let conversationContext = '';
  if (recentHistory.length > 0) {
    conversationContext = '\n\nCONVERSATION HISTORY (for context):\n';
    recentHistory.forEach((msg, idx) => {
      conversationContext += `Q${idx + 1}: ${msg.question}\nA${idx + 1}: ${msg.answer.substring(0, 200)}...\n\n`;
    });
  }

  // Structure the query using structured query analyzer
  const { structureQuery } = await import('./structureQuery');
  const structured = structureQuery(
    userQuestion,
    decision.intent || 'UNKNOWN',
    decision.parameters || {}
  );

  // Build comprehensive SQL generation prompt
  const prompt = sqlGenerationPrompt(
    structured,
    decision,
    schema,
    conversationContext
  );

  // Call OpenAI
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a SQL query generator. Respond only with SQL, no markdown or explanation.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  let generatedSQL = data.choices[0].message.content.trim();
  generatedSQL = sanitizeSQL(generatedSQL);
  
  return generatedSQL;
}