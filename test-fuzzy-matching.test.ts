import { describe, it, expect } from 'vitest';
import { routeQuestion } from './src/router/index';

describe('Fuzzy Matching Tests', () => {
  const testCases = [
    // Misspelled keywords should still work
    {
      query: "Show me excevator data for January",  // typo: excevator
      expectedTask: 'sql',
      description: 'Should handle "excevator" typo'
    },
    {
      query: "forcast production for next week",  // typo: forcast
      expectedTask: 'optimize',
      description: 'Should handle "forcast" typo'
    },
    {
      query: "What are the best practises for maintenence?",  // typo: practises, maintenence
      expectedTask: 'rag',
      description: 'Should handle multiple typos in advisory query'
    },
    {
      query: "Show me tiper performance",  // typo: tiper
      expectedTask: 'sql',
      description: 'Should handle "tiper" typo'
    },
    {
      query: "recomend equipment for today",  // typo: recomend
      expectedTask: 'optimize',
      description: 'Should handle "recomend" typo'
    },
    {
      query: "Show total tonnege",  // typo: tonnege
      expectedTask: 'sql',
      description: 'Should handle "tonnege" typo'
    },
    {
      query: "Show me producton data",  // typo: producton
      expectedTask: 'sql',
      description: 'Should handle "producton" typo'
    },
    {
      query: "visualisation of trips",  // British spelling
      expectedTask: 'sql',
      description: 'Should handle British spelling "visualisation"'
    },
    {
      query: "analyz equipment efficiency",  // typo: analyz
      expectedTask: 'sql',
      description: 'Should handle "analyz" typo'
    },
    {
      query: "What is the proceduer for maintenance?",  // typo: proceduer
      expectedTask: 'rag',
      description: 'Should handle "proceduer" typo in advisory query'
    },
    
    // Multi-word fuzzy matching
    {
      query: "Show me the best combinaton of equipment",  // typo: combinaton
      expectedTask: 'optimize',
      description: 'Should handle multi-word phrase with typo'
    },
    {
      query: "I need to selekt equipment",  // typo: selekt
      expectedTask: 'optimize',
      description: 'Should handle "selekt" typo in selection query'
    },
    
    // Edge cases - very close to keywords
    {
      query: "Show exavator trips",  // missing 'c'
      expectedTask: 'sql',
      description: 'Should handle missing character in "excavator"'
    },
    {
      query: "predickt future tonnage",  // extra 'k'
      expectedTask: 'optimize',
      description: 'Should handle extra character in "predict"'
    }
  ];

  testCases.forEach((test, index) => {
    it(`Test ${index + 1}: ${test.description}`, async () => {
      console.log(`\n📝 Testing: "${test.query}"`);
      
      const result = await routeQuestion(test.query);
      
      console.log(`   → Task: ${result.task}`);
      console.log(`   → Intent: ${result.intent}`);
      console.log(`   → Confidence: ${result.confidence}`);
      
      if (result.fuzzy_matches && result.fuzzy_matches.length > 0) {
        console.log(`   → Fuzzy matches: ${result.fuzzy_matches.join(', ')}`);
      }
      
      expect(result.task).toBe(test.expectedTask);
    });
  });
  
  // Test feedback system
  it('Feedback system should track low confidence queries', async () => {
    const weirdQuery = "xyzabc random nonsense query blah";
    const result = await routeQuestion(weirdQuery);
    
    expect(result.confidence).toBeLessThan(0.7);
    console.log(`\n🔍 Low confidence query logged: "${weirdQuery}"`);
    console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}`);
  });
});

describe('Fuzzy Matching Performance', () => {
  it('Should not significantly slow down exact matches', async () => {
    const queries = [
      "Show me production data for January",
      "What are the best practices?",
      "Forecast production",
      "I need to pick equipment",
      "Show excavator trips"
    ];
    
    const startTime = Date.now();
    
    for (const query of queries) {
      await routeQuestion(query);
    }
    
    const elapsed = Date.now() - startTime;
    const avgTime = elapsed / queries.length;
    
    console.log(`\n⏱️  Average query time: ${avgTime.toFixed(2)}ms`);
    
    // Should still be fast (under 50ms per query on average)
    expect(avgTime).toBeLessThan(50);
  });
});
