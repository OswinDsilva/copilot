/**
 * Context-Aware Follow-Up Detection
 * 
 * Detects when a query is a follow-up/modification of a previous question
 * and inherits intent/parameters from conversation history.
 * 
 * Examples:
 * Q1: "tell me best tipper-excavator combos for 1200 tons"
 * Q2: "and what if I need to do it with only 8 pairs?" ← FOLLOW-UP
 * 
 * Q1: "show production for January"
 * Q2: "what about February?" ← FOLLOW-UP
 */

import type { ChatMessage } from '../../types';

export interface FollowUpContext {
  isFollowUp: boolean;
  previousIntent?: string;
  previousQuestion?: string;
  previousParameters?: Record<string, any>;
  followUpType?: 'modification' | 'clarification' | 'constraint' | 'alternative';
  confidence: number;
}

/**
 * Patterns that indicate a follow-up question
 */
const FOLLOW_UP_PATTERNS = [
  // Conjunctions starting questions
  /^(and|but|also|plus)\s+/i,
  
  // "What if" variations
  /^(what if|and if|but if|suppose|assuming)\s+/i,
  
  // "What about" variations  
  /^(what about|how about|and about)\s+/i,
  
  // Constraint modifications
  /^(with only|with just|using only|using just|limited to|without|exclude|excluding|no|not using)\s+/i,
  
  // Continuation phrases
  /^(then|next|now|after that|do it|run it|try it)\s+/i,
  
  // Comparative/alternative
  /^(instead|rather|alternatively|or)\s+/i,
  
  // Referential pronouns (but only at start)
  /^(that|this|those|these)\s+(one|option|combination|pair)/i,
  
  // Very short questions (likely follow-ups)
  /^(why|how|when|where|which one)\??\s*$/i,

  // Numeric-led constraint updates (e.g. "2500 tons already mined...", "100 trips left...")
  /^\s*\d+\s*(?:tons?|tonnes?|m3|trips?)\b/i,

  // Shift-only replies (common after clarification prompt)
  /^\s*[ABC]\s*$/i,
  /^\s*shift\s*[ABC]\s*$/i,

  // Equipment breakdown replies (common follow-up)
  /^\s*[A-Z]{2,}-?\d+\s+(?:broke\s*down|is\s+broken|broken|down|failed)\b/i,
];

/**
 * Patterns that indicate it's NOT a follow-up (standalone questions)
 */
const STANDALONE_PATTERNS = [
  // Full questions with subjects
  /^(show|get|find|list|display|give|tell me|what is|what are|who|where is|when did)/i,
  
  // Explicit new context
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  /\b(2024|2025|2026)\b/i,
  // REMOVED: Equipment IDs check here because "without BB-42" contains an ID but IS a follow-up
  /\b(shift\s+[abc])\b/i,
];

/**
 * Detect if current question is a follow-up to previous conversation
 */
export function detectFollowUp(
  currentQuestion: string,
  chatHistory: ChatMessage[]
): FollowUpContext {
  // No history = can't be a follow-up
  if (!chatHistory || chatHistory.length === 0) {
    return { isFollowUp: false, confidence: 0 };
  }
  
  // Get last interaction
  const lastInteraction = chatHistory[chatHistory.length - 1];
  
  const previousMessage = lastInteraction;
  const questionLower = currentQuestion.toLowerCase().trim();
  
  // Check standalone patterns first (higher priority)
  for (const pattern of STANDALONE_PATTERNS) {
    if (pattern.test(currentQuestion)) {
      return { 
        isFollowUp: false, 
        confidence: 0,
        previousQuestion: previousMessage.question,
        previousIntent: previousMessage.detected_intent
      };
    }
  }
  
  // Check follow-up patterns
  let matchedPattern: RegExp | null = null;
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(currentQuestion)) {
      matchedPattern = pattern;
      break;
    }
  }
  
  // Determine follow-up type based on content
  let followUpType: FollowUpContext['followUpType'] = 'modification';
  
  if (/^(why|how|explain)/i.test(questionLower)) {
    followUpType = 'clarification';
  } else if (/\b(only|just|limited|constrain|maximum|minimum|at most|at least)\b/i.test(questionLower)) {
    followUpType = 'constraint';
  } else if (/^(what about|how about|instead|rather|alternatively)/i.test(questionLower)) {
    followUpType = 'alternative';
  }
  
  // Very short questions are likely follow-ups
  const isVeryShort = currentQuestion.split(/\s+/).length <= 8;
  
  // Calculate confidence
  let confidence = 0;
  if (matchedPattern) confidence += 0.6;
  if (isVeryShort) confidence += 0.2;
  if (!questionLower.includes('?') && !questionLower.startsWith('show')) confidence += 0.1;
  if (questionLower.startsWith('and ') || questionLower.startsWith('but ')) confidence += 0.1;
  
  const isFollowUp = confidence >= 0.5;
  
  if (!isFollowUp) {
    return { 
      isFollowUp: false, 
      confidence,
      previousQuestion: previousMessage.question
    };
  }
  
  return {
    isFollowUp: true,
    previousIntent: previousMessage.detected_intent,
    previousQuestion: previousMessage.question,
    previousParameters: previousMessage.parameters,
    followUpType,
    confidence
  };
}

/**
 * Merge parameters from follow-up with previous question
 * Follow-up parameters override previous ones
 */
export function mergeFollowUpParameters(
  currentParams: Record<string, any>,
  previousParams: Record<string, any> = {}
): Record<string, any> {
  return {
    ...previousParams,    // Previous parameters as base
    ...currentParams,     // Current parameters override
    _isFollowUp: true,    // Mark as follow-up
  };
}

/**
 * Extract constraint modifications from follow-up question
 * Examples:
 * - "with only 8 pairs" → { constraint: 'limit', value: 8, unit: 'pairs' }
 * - "using just 5 equipment" → { constraint: 'limit', value: 5, unit: 'equipment' }
 */
export function extractFollowUpConstraints(question: string): Record<string, any> {
  const constraints: Record<string, any> = {};

  const normalizeShiftToken = (s: string): string => {
    const t = String(s).trim().toUpperCase();
    if (t === '1') return 'A';
    if (t === '2') return 'B';
    if (t === '3') return 'C';
    return t;
  };

  // Shift-only answer ("A", "B", "C") or "shift A"
  const shiftOnly = question.match(/^\s*([ABC123])\s*$/i);
  if (shiftOnly) {
    constraints.shift = normalizeShiftToken(shiftOnly[1]);
  }
  const shiftPhrase = question.match(/\bshift\s*([ABC123])\b/i);
  if (shiftPhrase) {
    constraints.shift = normalizeShiftToken(shiftPhrase[1]);
  }

  // Remaining trips constraint ("100 trips left")
  const remainingTripsMatch = question.match(/(\d+)\s+trips?\s+(?:left|remaining)/i);
  if (remainingTripsMatch) {
    constraints.remaining_trips = parseInt(remainingTripsMatch[1], 10);
  }

  // Partial progress ("2500 tons already mined" / "... done" / "... produced")
  const minedMatch = question.match(/(\d+)\s*(tons?|tonnes?|m3)\s+(?:already\s+)?(?:mined|done|completed|produced)/i);
  if (minedMatch) {
    constraints.mined_amount = parseInt(minedMatch[1], 10);
    const unitRaw = minedMatch[2].toLowerCase();
    constraints.unit = unitRaw.startsWith('m') ? 'm3' : 'ton';
  }
  if (/half\s+(?:the\s+)?target/i.test(question)) {
    constraints.mined_fraction = 0.5;
  }

  // Equipment breakdown -> treat as exclusion
  const brokenIds = Array.from(question.matchAll(/\b([A-Z]{2,3}-\d+)\b\s+(?:broke\s*down|is\s+broken|broken|down|failed)/gi)).map(m => m[1].toUpperCase());
  if (brokenIds.length > 0) {
    constraints.exclude_equipment = Array.from(new Set([...(constraints.exclude_equipment || []), ...brokenIds]));
  }
  
  // Extract "only N" or "just N" patterns
  const limitMatch = question.match(/\b(only|just|limited to|at most|maximum of?)\s+(\d+)\s+(\w+)/i);
  if (limitMatch) {
    constraints.limit = parseInt(limitMatch[2], 10);
    constraints.unit = limitMatch[3].toLowerCase();
  }
  
  // Extract minimum constraints
  const minMatch = question.match(/\b(at least|minimum of?|no less than)\s+(\d+)\s+(\w+)/i);
  if (minMatch) {
    constraints.minimum = parseInt(minMatch[2], 10);
    constraints.unit = minMatch[3].toLowerCase();
  }
  
  // Extract "without" constraints - handle multiple items
  // Matches: "without BB-42", "without BB-42 and EX-141", "exclude BB-42, EX-141"
  const withoutMatch = question.match(/\b(without|exclude|excluding|no)\s+([a-z0-9\-\s,]+)/i);
  if (withoutMatch) {
    const rawExclusions = withoutMatch[2];
    // Extract all equipment IDs from the exclusion string
    const excludedIds = rawExclusions.match(/\b([A-Z]{2,3}-\d+)\b/gi);
    
    if (excludedIds && excludedIds.length > 0) {
      constraints.exclude_equipment = excludedIds.map(id => id.toUpperCase());
    }
  }
  
  return constraints;
}

/**
 * Use LLM to resolve ambiguous follow-up context
 * Analyzes both user's and agent's last response to determine intent
 */
export async function resolveFollowUpWithLLM(
  currentQuestion: string,
  chatHistory: ChatMessage[],
  apiKey: string
): Promise<{ intent: string; parameters: Record<string, any>; confidence: number }> {
  if (!apiKey) return { intent: 'UNKNOWN', parameters: {}, confidence: 0 };

  // Get last interaction
  const lastInteraction = chatHistory[chatHistory.length - 1];

  if (!lastInteraction) return { intent: 'UNKNOWN', parameters: {}, confidence: 0 };

  const prompt = `
    You are a context resolver for a mining assistant.
    
    Current Question: "${currentQuestion}"
    
    Context:
    - User's Last Question: "${lastInteraction.question}" (Intent: ${lastInteraction.detected_intent})
    - Assistant's Last Response: "${lastInteraction.answer}"
    
    Task:
    Determine if the Current Question is a follow-up that modifies the User's Last Question.
    If there is a conflict between the User's intent and the Assistant's response context, PREFER THE USER'S INTENT.
    
    CRITICAL: You MUST merge the parameters from the User's Last Question with any new constraints in the Current Question.
    For example, if the previous question had "shift" and "target", and the new one has "exclude", the result MUST contain "shift", "target", AND "exclude".
    Do NOT return only the new parameters. Return the COMPLETE set of parameters needed to execute the request.
    
    Return a JSON object with:
    - intent: The resolved intent (e.g., EQUIPMENT_OPTIMIZATION, SQL_QUERY, etc.)
    - parameters: The COMPLETE merged parameters (old + new)
    - confidence: Number between 0 and 1
    
    Example:
    User: "Optimize for Shift C to mine 5000 tons" (Params: { shift: "C", target: 5000 })
    Assistant: "Here is the plan..."
    Current: "Do it without BB-42"
    Result: { "intent": "EQUIPMENT_OPTIMIZATION", "parameters": { "shift": "C", "target": 5000, "exclude_equipment": ["BB-42"] }, "confidence": 0.95 }
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('LLM Follow-up resolution failed:', error);
    return { intent: 'UNKNOWN', parameters: {}, confidence: 0 };
  }
}
