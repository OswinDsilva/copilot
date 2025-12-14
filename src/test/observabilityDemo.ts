/**
 * Demo: Correlation ID in Action
 * Shows how correlation IDs help with debugging
 */

import { routeQuestion } from '../router';

async function demo() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Minimal Observability Demo');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Scenario 1: User makes a normal request
  console.log('📊 Scenario 1: Normal Query\n');
  const result1 = await routeQuestion('What was total production in Q3 2024?');
  console.log(`✓ Correlation ID: ${(result1 as any).correlation_id}`);
  console.log(`✓ Intent: ${result1.intent}`);
  console.log(`✓ Confidence: ${result1.confidence}`);
  console.log(`✓ Task: ${result1.task}\n`);
  
  // Scenario 2: User reports an issue
  console.log('═══════════════════════════════════════════════════');
  console.log('💬 User: "The app crashed when I asked about trucks"\n');
  
  try {
    // Simulate query that might fail
    const result2 = await routeQuestion('trucks');
    console.log(`✓ Query succeeded`);
    console.log(`✓ Correlation ID: ${(result2 as any).correlation_id}`);
    console.log(`✓ If user saw an error, they can report this ID ↑\n`);
  } catch (error) {
    const errorMsg = (error as Error).message;
    const match = errorMsg.match(/\[(\d+-[a-z0-9]+)\]/);
    
    console.log('❌ Error occurred!');
    console.log(`   Message: ${errorMsg}`);
    if (match) {
      console.log(`   Correlation ID: ${match[1]}`);
      console.log(`\n🔍 You can now:`);
      console.log(`   1. Search logs for: ${match[1]}`);
      console.log(`   2. Find exact error in failures.log`);
      console.log(`   3. See full stack trace\n`);
    }
  }
  
  // Scenario 3: Weekly review
  console.log('═══════════════════════════════════════════════════');
  console.log('📈 Weekly Review: Check failures.log\n');
  console.log('PowerShell command:');
  console.log('Get-Content failures.log | ConvertFrom-Json | Group-Object intent\n');
  console.log('This shows which intents have low confidence.\n');
  
  console.log('═══════════════════════════════════════════════════');
  console.log('✅ Benefits:');
  console.log('   • Every request has a unique ID');
  console.log('   • Errors are traceable');
  console.log('   • Low confidence queries logged');
  console.log('   • Console logs are JSON (easy to grep)');
  console.log('   • Zero cost, zero external dependencies');
  console.log('═══════════════════════════════════════════════════');
}

demo().catch(console.error);
