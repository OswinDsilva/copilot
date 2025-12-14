/**
 * Fuzzy String Matching Utilities
 * Handles typos, common misspellings, and phonetic variations
 */

// Short domain-specific terms that should use fuzzy matching despite being < 6 chars
export const FUZZY_SHORT_TERMS = new Set([
  'tipper', 'chart', 'route', 'best', 'which', 'show', 'list',
  'trip', 'face', 'haul', 'pit', 'mine', 'shift', 'plan',
  'data', 'view', 'get', 'find'
]);

// Dynamic threshold based on word length (longer words tolerate more edit distance)
export function getDynamicThreshold(term: string): number {
  const len = term.length;
  if (len >= 10) return 0.70; // "excavator", "maintenance", "visualization"
  if (len >= 7) return 0.78;  // "tipper", "production", "forecast"
  if (len >= 5) return 0.82;  // "chart", "route", "shift"
  return 0.85; // very short words (rare with whitelist)
}

// Levenshtein distance calculation (edit distance)
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + 1   // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Calculate similarity ratio (0-1, where 1 is exact match)
export function similarityRatio(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

// Domain-specific common misspellings for mining operations
const COMMON_MISSPELLINGS: Record<string, string[]> = {
  'excavator': ['excevator', 'exavator', 'excavater', 'excevater', 'excaveter'],
  'tipper': ['tiper', 'typer', 'tipr', 'tippr'],
  'which': ['wich', 'whic', 'whch'],
  'chart': ['chrt', 'cahrt'],
  'route': ['rout', 'roote', 'rute', 'roue'],
  'display': ['displya', 'disply', 'diplay'],
  'performance': ['performace', 'preformance', 'perfomance', 'performnce'],
  'forecast': ['forcast', 'forcaste', 'forecat', 'forecst'],
  'maintenance': ['maintenence', 'maintanance', 'maintenace', 'maintennance'],
  'production': ['producton', 'produktion', 'productoin', 'prodction'],
  'tonnage': ['tonnege', 'tonage', 'tonnaje', 'tonnnage'],
  'recommend': ['recomend', 'reccomend', 'rekommend', 'recomned'],
  'equipment': ['equipement', 'equiptment', 'equipmant', 'equipent', 'equipmnt', 'equpment'],
  'efficiency': ['eficiency', 'efficency', 'efficiancy', 'effeciency'],
  'optimal': ['optmal', 'optimel', 'optiaml', 'optiml'],
  'predict': ['predit', 'prdict', 'predickt'],
  'visualization': ['visualisation', 'visualizaton', 'visulaization', 'visulization', 'vizualization'],
  'procedure': ['proceedure', 'proceduer', 'proceedur', 'procedre', 'procedue'],
  'analyze': ['analyse', 'analize', 'analyz'],
  'combination': ['combinaton', 'conbination', 'combintion', 'combnation'],
  'utilization': ['utilizaton', 'utilzation', 'utlization']
};

// Build reverse lookup for fast misspelling correction
const MISSPELLING_CORRECTIONS = new Map<string, string>();
for (const [correct, misspellings] of Object.entries(COMMON_MISSPELLINGS)) {
  for (const misspelling of misspellings) {
    MISSPELLING_CORRECTIONS.set(misspelling.toLowerCase(), correct);
  }
}

/**
 * Correct known misspellings in text
 */
export function correctKnownMisspellings(text: string): string {
  const words = text.toLowerCase().split(/\b/);
  const corrected = words.map(word => {
    const correction = MISSPELLING_CORRECTIONS.get(word);
    return correction || word;
  });
  return corrected.join('');
}

/**
 * Fuzzy keyword matching with configurable threshold
 */
export function fuzzyKeywordMatch(
  text: string, 
  keyword: string, 
  threshold: number = 0.85
): boolean {
  const textLower = text.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // First try exact match (fast path)
  const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (regex.test(text)) {
    return true;
  }
  
  // Check known misspellings
  const correctedText = correctKnownMisspellings(textLower);
  if (regex.test(correctedText)) {
    return true;
  }
  
  // For multi-word keywords, split and match each word
  const keywordWords = keywordLower.split(/\s+/);
  if (keywordWords.length > 1) {
    // All words in keyword must fuzzy match somewhere in text
    return keywordWords.every(kw => 
      textLower.split(/\s+/).some(textWord => 
        similarityRatio(textWord, kw) >= threshold
      )
    );
  }
  
  // Single word - try fuzzy match against each word in text
  const textWords = textLower.split(/\b/);
  for (const textWord of textWords) {
    if (textWord.length < 3) continue; // Skip very short words
    
    // Use dynamic threshold based on keyword length if no explicit threshold provided
    const actualThreshold = threshold === 0.85 ? getDynamicThreshold(keywordLower) : threshold;
    
    if (similarityRatio(textWord, keywordLower) >= actualThreshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find best fuzzy match from a list of keywords
 */
export function findBestFuzzyMatch(
  text: string,
  keywords: string[]
): { keyword: string; score: number } | null {
  const textLower = text.toLowerCase();
  let bestMatch: { keyword: string; score: number } | null = null;
  
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    
    // Try exact match first
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      return { keyword, score: 1.0 };
    }
    
    // Calculate best word-level match
    const keywordWords = keywordLower.split(/\s+/);
    const textWords = textLower.split(/\b/).filter(w => w.length >= 3);
    
    let totalScore = 0;
    let matchCount = 0;
    
    for (const kw of keywordWords) {
      let bestWordScore = 0;
      for (const tw of textWords) {
        const score = similarityRatio(tw, kw);
        bestWordScore = Math.max(bestWordScore, score);
      }
      totalScore += bestWordScore;
      if (bestWordScore >= 0.85) matchCount++;
    }
    
    const avgScore = totalScore / keywordWords.length;
    const coverage = matchCount / keywordWords.length;
    const finalScore = (avgScore * 0.7) + (coverage * 0.3);
    
    if (!bestMatch || finalScore > bestMatch.score) {
      bestMatch = { keyword, score: finalScore };
    }
  }
  
  return bestMatch && bestMatch.score >= 0.75 ? bestMatch : null;
}

/**
 * Feedback loop: Track unmatched queries for learning
 */
interface FeedbackEntry {
  query: string;
  timestamp: Date;
  detectedIntent: string;
  confidence: number;
  correctedIntent?: string;
  notes?: string;
}

class FeedbackLogger {
  private entries: FeedbackEntry[] = [];
  private readonly maxEntries = 1000;
  
  /**
   * Log a query that had low confidence or was corrected
   */
  log(entry: Omit<FeedbackEntry, 'timestamp'>): void {
    this.entries.push({
      ...entry,
      timestamp: new Date()
    });
    
    // Keep only recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    
    // Console log for development
    if (entry.confidence < 0.5) {
      console.warn('[Fuzzy Match] Low confidence query:', {
        query: entry.query,
        intent: entry.detectedIntent,
        confidence: entry.confidence
      });
    }
  }
  
  /**
   * Get queries that need review (low confidence or unknown)
   */
  getNeedsReview(): FeedbackEntry[] {
    return this.entries.filter(e => 
      e.confidence < 0.6 || 
      e.detectedIntent === 'UNKNOWN'
    );
  }
  
  /**
   * Extract potential new misspellings to add to dictionary
   */
  suggestMisspellings(): Array<{ original: string; suggestion: string; count: number }> {
    const suggestions = new Map<string, { original: string; suggestion: string; count: number }>();
    
    // Find patterns in low-confidence queries
    for (const entry of this.entries) {
      if (entry.confidence < 0.7 && entry.correctedIntent) {
        const words = entry.query.toLowerCase().split(/\s+/);
        
        // Look for words that might be misspellings
        for (const word of words) {
          if (word.length < 4) continue;
          
          // Check against known correct words
          for (const [correct, misspellings] of Object.entries(COMMON_MISSPELLINGS)) {
            if (similarityRatio(word, correct) > 0.75 && 
                word !== correct && 
                !misspellings.includes(word)) {
              const key = `${word}->${correct}`;
              const existing = suggestions.get(key);
              if (existing) {
                existing.count++;
              } else {
                suggestions.set(key, { original: word, suggestion: correct, count: 1 });
              }
            }
          }
        }
      }
    }
    
    return Array.from(suggestions.values())
      .filter(s => s.count >= 2) // Only suggest if seen multiple times
      .sort((a, b) => b.count - a.count);
  }
  
  /**
   * Get all feedback entries (for analysis)
   */
  getAllEntries(): FeedbackEntry[] {
    return [...this.entries];
  }
  
  /**
   * Export feedback data for analysis
   */
  export(): string {
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      totalQueries: this.entries.length,
      lowConfidenceCount: this.entries.filter(e => e.confidence < 0.6).length,
      unknownIntentCount: this.entries.filter(e => e.detectedIntent === 'UNKNOWN').length,
      entries: this.entries
    }, null, 2);
  }
}

// Singleton instance
export const feedbackLogger = new FeedbackLogger();

/**
 * Add a new misspelling to the dictionary (for runtime learning)
 */
export function addMisspelling(correct: string, misspelling: string): void {
  if (!COMMON_MISSPELLINGS[correct]) {
    COMMON_MISSPELLINGS[correct] = [];
  }
  
  if (!COMMON_MISSPELLINGS[correct].includes(misspelling)) {
    COMMON_MISSPELLINGS[correct].push(misspelling);
    MISSPELLING_CORRECTIONS.set(misspelling.toLowerCase(), correct);
    
    console.log(`[Fuzzy Match] Added new misspelling: "${misspelling}" -> "${correct}"`);
  }
}

/**
 * Get misspelling suggestions based on feedback
 */
export function getMisspellingSuggestions(): Array<{ original: string; suggestion: string; count: number }> {
  return feedbackLogger.suggestMisspellings();
}
