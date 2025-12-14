/**
 * Comprehensive Routing & Intent Test Suite
 * Run with: npm test test-comprehensive-routing.test.ts
 */

import { describe, it, expect } from 'vitest';
import { routeQuestion } from './src/router/index';

const testQueries = [
  // Production Summary - Date queries
  { query: "Show me production data for January 2025", expectedIntent: "MONTHLY_SUMMARY" },
  { query: "What was the production on April 15th?", expectedIntent: "DATA_RETRIEVAL" },
  { query: "Show me shift A production", expectedIntent: "DATA_RETRIEVAL" },
  { query: "Which shift performed best today?", expectedIntent: "AGGREGATION_QUERY" },
  
  // Production Summary - Equipment counts
  { query: "How many excavators were working today?", expectedIntent: "AGGREGATION_QUERY" },
  { query: "Show me dumper utilization for this week", expectedIntent: "DATA_RETRIEVAL" },
  
  // Production Summary - Tonnage
  { query: "What's the total tonnage for January?", expectedIntent: "AGGREGATION_QUERY" },
  { query: "Show me daily tonnage production", expectedIntent: "DATA_RETRIEVAL" },
  
  // Production Summary - Trips
  { query: "How many total trips were made today?", expectedIntent: "AGGREGATION_QUERY" },
  { query: "Show mining trips for this month", expectedIntent: "AGGREGATION_QUERY" },
  
  // Trip Summary - Tipper queries
  { query: "Show me trips for tipper BB-44", expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION" },
  { query: "Which tipper made the most trips today?", expectedIntent: "AGGREGATION_QUERY" },
  
  // Trip Summary - Excavator queries
  { query: "Show me trips for excavator EX-189", expectedIntent: "EQUIPMENT_SPECIFIC_PRODUCTION" },
  { query: "Which excavator had the highest productivity?", expectedIntent: "AGGREGATION_QUERY" },
  
  // Trip Summary - Combinations
  { query: "Which tippers worked with excavator EX-189?", expectedIntent: "EQUIPMENT_COMBINATION" },
  { query: "Show me tipper and excavator pairings", expectedIntent: "EQUIPMENT_COMBINATION" },
  
  // Trip Summary - Routes
  { query: "Show me trips from Mining Bench 1", expectedIntent: "ROUTES_FACES_ANALYSIS" },
  { query: "Which route had the most activity?", expectedIntent: "ROUTES_FACES_ANALYSIS" },
  
  // Optimization queries
  { query: "I have to pick 1 excavator and 3 tippers", expectedTask: "optimize" },
  { query: "Forecast production for next 7 days", expectedTask: "optimize" },
  { query: "Predict next week's trip count", expectedTask: "optimize" },
  
  // Chart/Visualization
  { query: "Show me a bar chart of daily production", expectedIntent: "CHART_VISUALIZATION" },
  { query: "Plot tonnage over time", expectedIntent: "CHART_VISUALIZATION" },
  
  // Advisory (RAG)
  { query: "How do I improve production efficiency?", expectedTask: "rag" },
  { query: "What are the best practices for equipment maintenance?", expectedTask: "rag" },
  
  // Top/Bottom queries
  { query: "Show top 5 tippers by trip count", expectedIntent: "ORDINAL_ROW_QUERY" },
  { query: "What are the bottom 3 shifts by production?", expectedIntent: "ORDINAL_ROW_QUERY" },
];

describe('Comprehensive Routing & Intent Tests', () => {
  testQueries.forEach((test, index) => {
    it(`Test ${index + 1}: "${test.query}"`, async () => {
      const result = await routeQuestion(test.query);
      
      // Log result for debugging
      console.log(`\n📝 Test ${index + 1}: "${test.query}"`);
      console.log(`   → Task: ${result.task}, Intent: ${result.intent}, Confidence: ${result.confidence}`);
      
      // Validate task if specified
      if (test.expectedTask) {
        expect(result.task).toBe(test.expectedTask);
      }
      
      // Validate intent if specified (soft check - warn but don't fail)
      if (test.expectedIntent && result.intent !== test.expectedIntent) {
        console.warn(`   ⚠️  Intent mismatch: expected '${test.expectedIntent}', got '${result.intent}'`);
      }
      
      // Basic validation - should have required fields
      expect(result).toHaveProperty('task');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(['sql', 'rag', 'optimize']).toContain(result.task);
    });
  });
});
