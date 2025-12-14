/**
 * Routing and Intent System Constants
 * 
 * Centralized configuration for all magic numbers and thresholds
 * used throughout the routing system.
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIDENCE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

export const CONFIDENCE_THRESHOLDS = {
  /** Very high confidence - use deterministic routing without LLM validation */
  VERY_HIGH: 0.99,
  
  /** High confidence - deterministic routing preferred */
  HIGH: 0.95,
  
  /** Good confidence - suitable for most SQL queries */
  GOOD: 0.90,
  
  /** Ambiguity detection - when second-best intent is too close to best */
  AMBIGUITY_RATIO: 0.7,
  
  /** Maximum confidence for ambiguous queries (apply penalty) */
  AMBIGUOUS_MAX: 0.75,
  
  /** Minimum base for ambiguity penalty calculation */
  AMBIGUITY_PENALTY_BASE: 0.6,
  
  /** Scale factor for ambiguity penalty */
  AMBIGUITY_PENALTY_SCALE: 0.4,
} as const;

// ═══════════════════════════════════════════════════════════════════
// EQUIPMENT & OPTIMIZATION CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

export const EQUIPMENT_CONSTRAINTS = {
  /** Minimum number of equipment pairs needed for combination queries */
  MIN_PAIRS_FOR_COMBINATION: 2,
  
  /** Default number of days for production forecasting */
  DEFAULT_FORECAST_DAYS: 7,
} as const;

// ═══════════════════════════════════════════════════════════════════
// TIMEOUT & PERFORMANCE
// ═══════════════════════════════════════════════════════════════════

export const TIMEOUTS = {
  /** Backend initialization timeout (ms) */
  INIT_TIMEOUT: 2000,
  
  /** Short notification display duration (ms) */
  NOTIFICATION_SHORT: 3000,
  
  /** Long notification display duration (ms) */
  NOTIFICATION_LONG: 5000,
} as const;

// ═══════════════════════════════════════════════════════════════════
// UI & FORMATTING
// ═══════════════════════════════════════════════════════════════════

export const UI_CONSTANTS = {
  /** JSON indentation for query results */
  JSON_INDENT: 2,
} as const;

// ═══════════════════════════════════════════════════════════════════
// REGEX PATTERNS (Pre-compiled for performance)
// ═══════════════════════════════════════════════════════════════════

export const PATTERNS = {
  /** Match excavator count (singular or plural) */
  EXCAVATOR: /(\d+)\s+excavators?/i,
  
  /** Match tipper count (singular or plural) */
  TIPPER: /(\d+)\s+tippers?/i,
  
  /** Match forecast/prediction requests */
  FORECAST: /forecast|predict/i,
  
  /** Match number of days */
  DAYS: /(\d+)\s+days?/i,
} as const;
