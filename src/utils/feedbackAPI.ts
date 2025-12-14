/**
 * Feedback API for Fuzzy Matching System
 * Provides endpoints to view and manage fuzzy matching feedback
 */

import { 
  feedbackLogger, 
  getMisspellingSuggestions, 
  addMisspelling 
} from '../router/helpers/fuzzyMatch';

export interface FeedbackAPI {
  /**
   * Get queries that need review (low confidence or unknown intent)
   */
  getNeedsReview(): Array<{
    query: string;
    detectedIntent: string;
    confidence: number;
    timestamp: Date;
  }>;
  
  /**
   * Get suggested new misspellings based on patterns
   */
  getSuggestedMisspellings(): Array<{
    original: string;
    suggestion: string;
    count: number;
  }>;
  
  /**
   * Add a new misspelling to the dictionary
   */
  addMisspelling(correct: string, misspelling: string): void;
  
  /**
   * Export all feedback data as JSON
   */
  exportFeedback(): string;
  
  /**
   * Get feedback statistics
   */
  getStats(): {
    totalQueries: number;
    lowConfidenceCount: number;
    unknownIntentCount: number;
    averageConfidence: number;
  };
}

class FeedbackAPIImpl implements FeedbackAPI {
  getNeedsReview() {
    return feedbackLogger.getNeedsReview().map(entry => ({
      query: entry.query,
      detectedIntent: entry.detectedIntent,
      confidence: entry.confidence,
      timestamp: entry.timestamp
    }));
  }
  
  getSuggestedMisspellings() {
    return getMisspellingSuggestions();
  }
  
  addMisspelling(correct: string, misspelling: string): void {
    addMisspelling(correct, misspelling);
  }
  
  exportFeedback(): string {
    return feedbackLogger.export();
  }
  
  getStats() {
    const entries = feedbackLogger.getAllEntries();
    const totalQueries = entries.length;
    const lowConfidenceCount = entries.filter(e => e.confidence < 0.6).length;
    const unknownIntentCount = entries.filter(e => e.detectedIntent === 'UNKNOWN').length;
    const averageConfidence = totalQueries > 0
      ? entries.reduce((sum, e) => sum + e.confidence, 0) / totalQueries
      : 0;
    
    return {
      totalQueries,
      lowConfidenceCount,
      unknownIntentCount,
      averageConfidence: Math.round(averageConfidence * 100) / 100
    };
  }
}

// Export singleton instance
export const feedbackAPI = new FeedbackAPIImpl();

// Console commands for development (call from browser console)
if (typeof window !== 'undefined') {
  (window as any).fuzzyFeedback = {
    needsReview: () => feedbackAPI.getNeedsReview(),
    suggestions: () => feedbackAPI.getSuggestedMisspellings(),
    stats: () => feedbackAPI.getStats(),
    export: () => {
      const data = feedbackAPI.exportFeedback();
      console.log(data);
      // Auto-download
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fuzzy-feedback-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    addMisspelling: (correct: string, misspelling: string) => {
      feedbackAPI.addMisspelling(correct, misspelling);
      console.log(`✅ Added: "${misspelling}" → "${correct}"`);
    }
  };
  
  console.log(`
  🔍 Fuzzy Matching Feedback System Loaded
  
  Available commands:
  - fuzzyFeedback.stats()         : View statistics
  - fuzzyFeedback.needsReview()   : Queries needing review
  - fuzzyFeedback.suggestions()   : Misspelling suggestions
  - fuzzyFeedback.export()        : Export all data
  - fuzzyFeedback.addMisspelling('correct', 'typo') : Add misspelling
  `);
}
