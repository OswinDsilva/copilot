/**
 * Quick test of correlation ID and logging functionality
 */

import { routeQuestion } from '../router';

async function testCorrelationId() {
  console.log('=== Testing Correlation ID Implementation ===\n');
  
  // Test 1: Normal query (should log to console)
  console.log('Test 1: Normal confidence query');
  try {
    const result = await routeQuestion('What was the total production last month?');
    console.log(`✓ Success! Correlation ID: ${(result as any).correlation_id}`);
    console.log(`  Intent: ${result.intent}, Confidence: ${result.confidence}\n`);
  } catch (error) {
    console.log(`✗ Failed: ${(error as Error).message}\n`);
  }
  
  // Test 2: Ambiguous query (should log to failures.log)
  console.log('Test 2: Low confidence query (should log to failures.log)');
  try {
    const result = await routeQuestion('show me stuff');
    console.log(`✓ Success! Correlation ID: ${(result as any).correlation_id}`);
    console.log(`  Intent: ${result.intent}, Confidence: ${result.confidence}`);
    console.log(`  Check failures.log for this entry\n`);
  } catch (error) {
    console.log(`✗ Failed: ${(error as Error).message}\n`);
  }
  
  // Test 3: Error case (should log error with correlation ID)
  console.log('Test 3: Error handling');
  try {
    // Pass invalid data to trigger error
    const result = await routeQuestion('');
    console.log(`Result: ${JSON.stringify(result)}\n`);
  } catch (error) {
    const errorMsg = (error as Error).message;
    const match = errorMsg.match(/\[(\d+-[a-z0-9]+)\]/);
    if (match) {
      console.log(`✓ Error includes correlation ID: ${match[1]}`);
      console.log(`  Error message: ${errorMsg}`);
      console.log(`  Check failures.log for this error\n`);
    } else {
      console.log(`✗ Error missing correlation ID: ${errorMsg}\n`);
    }
  }
  
  console.log('=== Check failures.log to see logged issues ===');
}

// Run test
testCorrelationId().catch(console.error);
