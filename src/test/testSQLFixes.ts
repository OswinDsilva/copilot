/**
 * Test the SQL fixes for the reported errors
 */

import { routeQuestion } from '../router';

async function testSQLFixes() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Testing SQL Generation Fixes');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Test 1: Top 5 highest production days
  console.log('Test 1: Top 5 highest production days in January 2025');
  const result1 = await routeQuestion('Show me the top 5 highest production days in January 2025 with tonnage and cubic meters');
  console.log(`✓ Intent: ${result1.intent}`);
  console.log(`✓ Confidence: ${result1.confidence}`);
  console.log(`✓ Parameters:`, result1.parameters);
  console.log(`✓ Task: ${result1.task}\n`);
  
  // Test 2: Compare production by shift
  console.log('═══════════════════════════════════════════════════');
  console.log('Test 2: Compare total and average production by shift');
  const result2 = await routeQuestion('Compare total and average production by shift for January 2025');
  console.log(`✓ Intent: ${result2.intent}`);
  console.log(`✓ Confidence: ${result2.confidence}`);
  console.log(`✓ Parameters:`, result2.parameters);
  console.log(`✓ Task: ${result2.task}\n`);
  
  // Test 3: Simple monthly query
  console.log('═══════════════════════════════════════════════════');
  console.log('Test 3: Monthly summary');
  const result3 = await routeQuestion('What was the total production in January 2025?');
  console.log(`✓ Intent: ${result3.intent}`);
  console.log(`✓ Confidence: ${result3.confidence}`);
  console.log(`✓ Parameters:`, result3.parameters);
  console.log(`✓ Task: ${result3.task}\n`);
  
  console.log('═══════════════════════════════════════════════════');
  console.log('✅ All SQL generation tests completed!');
  console.log('═══════════════════════════════════════════════════');
}

testSQLFixes().catch(console.error);
