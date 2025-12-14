/**
 * Test the new task-based priority routing
 */

import { routeQuestion } from '../router';

async function testTaskBasedRouting() {
  const tests = [
    // PRIORITY 0 - OPTIMIZE
    { query: 'Which excavator should I use for this job?', expectedTask: 'optimize' },
    { query: 'Predict production for next month', expectedTask: 'optimize' },
    
    // PRIORITY 1 - VISUALIZATION
    { query: 'Show shift A, B, C production with different colors', expectedTask: 'sql', expectedReason: /visualization/i },
    { query: 'Plot production over time', expectedTask: 'sql', expectedReason: /visualization/i },
    { query: 'Draw a bar chart of tonnage by shift', expectedTask: 'sql', expectedReason: /visualization/i },
    
    // PRIORITY 2 - CALCULATIONS
    { query: 'What is the average production in January?', expectedTask: 'sql', expectedReason: /calculation|aggregation/i },
    { query: 'Calculate total trips for excavator EX-001', expectedTask: 'sql', expectedReason: /calculation|aggregation/i },
    { query: 'Show top 5 production days', expectedTask: 'sql', expectedReason: /calculation|aggregation/i },
    
    // PRIORITY 3 - ADVISORY
    { query: 'How do I optimize equipment allocation?', expectedTask: 'rag', expectedReason: /advisory|procedural/i },
    { query: 'What is the best practice for shift scheduling?', expectedTask: 'rag', expectedReason: /advisory|procedural/i },
    
    // PRIORITY 4 - DATA RETRIEVAL
    { query: 'Show me the 19th row', expectedTask: 'sql', expectedReason: /ordinal/i },
    { query: 'List all trips in January 2025', expectedTask: 'sql', expectedReason: /time-based|data retrieval/i },
  ];

  console.log('═══════════════════════════════════════════════════');
  console.log('  Task-Based Priority Routing Test');
  console.log('═══════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const decision = await routeQuestion(test.query);
    const taskMatch = decision.task === test.expectedTask;
    const reasonMatch = !test.expectedReason || test.expectedReason.test(decision.reason);
    
    if (taskMatch && reasonMatch) {
      console.log(`✅ "${test.query}"`);
      console.log(`   → Task: ${decision.task}, Reason: ${decision.reason}\n`);
      passed++;
    } else {
      console.log(`❌ "${test.query}"`);
      console.log(`   Expected: task="${test.expectedTask}", reason matching ${test.expectedReason}`);
      console.log(`   Got: task="${decision.task}", reason="${decision.reason}"\n`);
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════');
}

testTaskBasedRouting().catch(console.error);
