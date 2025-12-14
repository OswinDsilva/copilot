# Test Coverage Strategy for Mining Co-Pilot Router System

## Executive Summary

**Current State**: ~900 lines of production router code with **0% test coverage**

**Goal**: Achieve 70-80% test coverage for critical router functionality with comprehensive unit and integration tests.

**Timeline**: 3 phases over 2-3 weeks

---

## Current Test Infrastructure

### ✅ What We Have
- **Vitest 1.0.0** installed and configured
- React plugin enabled for component testing
- Test scripts in `package.json`:
  - `npm test` - Run tests once
  - `npm run test:watch` - Run tests in watch mode
- 1 existing component test: `DataTab.test.tsx` (98 lines)
  - Tests table dropdown functionality
  - Pattern we can follow for new tests

### ❌ What's Missing
- **No backend/router unit tests** (0 `.test.ts` files)
- **No service layer tests** (intent, database, router)
- **No helper function tests** (dateParser, tableNormalizer, dateUtils)
- **No integration tests** (end-to-end routing pipeline)
- **No coverage reporting** configured
- **No CI/CD test integration**

---

## Phase 1: Core Helper Functions (HIGH PRIORITY) 🔴

**Timeline**: Week 1 (3-5 days)
**Lines to Test**: ~680 lines
**Target Coverage**: 85%

### 1.1 Date Parser Tests (`dateParser.test.ts`)

**Module**: `src/router/helpers/dateParser.ts` (458 lines)
**Functions to Test**: 8 critical parsing functions

```typescript
// Test file: src/router/helpers/__tests__/dateParser.test.ts

describe('parseQuarter', () => {
  ✓ Parse "Q1 2024" → { type: 'quarter', quarter: 1, year: 2024 }
  ✓ Parse "first quarter of 2023" → quarter 1
  ✓ Parse "second quarter" → current year
  ✓ Handle invalid quarters (Q0, Q5)
  ✓ Handle edge cases (no year specified)
});

describe('parseRelativeDate', () => {
  ✓ Parse "last month" → previous month date range
  ✓ Parse "this year" → current year date range
  ✓ Parse "last 45 days" → 45-day lookback
  ✓ Parse "last quarter" → previous quarter dates
  ✓ Handle "yesterday", "today", "this week"
  ✓ Boundary testing (year rollover, month boundaries)
});

describe('parseMonth', () => {
  ✓ Parse "January 2024" → month 1, year 2024
  ✓ Parse "Jan 2024" → abbreviation handling
  ✓ Parse "January" → current year implied
  ✓ Handle all 12 months (full names + abbreviations)
  ✓ Case-insensitive matching
});

describe('parseDateRange', () => {
  ✓ Parse "from January to March 2024"
  ✓ Parse "between Jan 1 and Mar 31"
  ✓ Parse "January to March" (current year)
  ✓ Handle reverse ranges (auto-correct)
  ✓ Handle same start/end date
});

describe('parseYear', () => {
  ✓ Parse "2024" → year 2024
  ✓ Parse "in 2023" → extract year
  ✓ Handle 2-digit years (23 → 2023)
  ✓ Validate reasonable year range (1900-2100)
});

describe('parseDate', () => {
  ✓ Route to correct parser (quarter → parseQuarter)
  ✓ Handle multiple date patterns in one query
  ✓ Prioritize specific over generic patterns
  ✓ Return null for unparseable dates
});

describe('dateToSQLFilter', () => {
  ✓ Convert quarter to SQL WHERE clause
  ✓ Convert month to SQL WHERE clause
  ✓ Convert date range to BETWEEN clause
  ✓ Convert relative dates to date arithmetic
  ✓ Handle column name parameter
});

describe('getQuarterDateRange', () => {
  ✓ Q1 → Jan 1 to Mar 31
  ✓ Q2 → Apr 1 to Jun 30
  ✓ Q3 → Jul 1 to Sep 30
  ✓ Q4 → Oct 1 to Dec 31
  ✓ Handle leap years (Q1 Feb 29)
});
```

**Test Cases from Priority 7 Documentation**:
All 10+ documented test cases should be executable tests.

**Mock Requirements**: None (pure functions)

---

### 1.2 Table Normalizer Tests (`tableNormalizer.test.ts`)

**Module**: `src/router/helpers/tableNormalizer.ts` (222 lines)
**Functions to Test**: 5 SQL normalization functions

```typescript
// Test file: src/router/helpers/__tests__/tableNormalizer.test.ts

describe('normalizeTableName', () => {
  ✓ "Production_Summary" → "production_summary"
  ✓ "PRODUCTION_SUMMARY" → "production_summary"
  ✓ "production_summary" → "production_summary" (no change)
  ✓ "trips" → "trip_summary_by_date" (alias mapping)
  ✓ "Trips" → "trip_summary_by_date" (case + alias)
  ✓ Unknown tables → return original
});

describe('normalizeTableReferences', () => {
  // FROM clause tests
  ✓ "FROM Production_Summary" → "FROM production_summary"
  ✓ "FROM trips" → "FROM trip_summary_by_date"
  ✓ "FROM Production_Summary ps" → preserve alias
  ✓ "FROM production_summary AS ps" → preserve AS clause
  
  // JOIN clause tests
  ✓ "JOIN Production_Summary" → normalize
  ✓ "LEFT JOIN trips" → normalize with alias mapping
  ✓ "INNER JOIN Production_Summary ps" → preserve alias
  
  // UPDATE clause tests
  ✓ "UPDATE Production_Summary SET" → normalize
  ✓ "UPDATE trips SET" → normalize with alias
  
  // INSERT clause tests
  ✓ "INSERT INTO Production_Summary" → normalize
  ✓ "INSERT INTO trips" → normalize with alias
  
  // DELETE clause tests
  ✓ "DELETE FROM Production_Summary" → normalize
  
  // Complex multi-table queries
  ✓ Handle multiple tables in same query
  ✓ Handle subqueries with table references
  ✓ Preserve string literals (don't normalize 'Production_Summary' in quotes)
});

describe('validateTableReferences', () => {
  ✓ Valid table → return true
  ✓ Invalid table → return false + warning
  ✓ Case-insensitive validation
  ✓ Alias-aware validation
});

describe('extractTableNames', () => {
  ✓ Extract single table from FROM
  ✓ Extract multiple tables from JOINs
  ✓ Extract tables from UPDATE/INSERT/DELETE
  ✓ Handle aliases (exclude from table list)
  ✓ Handle subqueries
});

describe('Edge Cases', () => {
  ✓ Empty SQL string
  ✓ SQL with no table references
  ✓ Malformed SQL (missing keywords)
  ✓ SQL comments (-- and /* */)
  ✓ Case sensitivity in table names
  ✓ Special characters in table names
  ✓ Very long SQL queries (> 10KB)
});
```

**Test Cases from Priority 8 Documentation**:
All 10+ documented test cases should be executable tests.

**Mock Requirements**: Mock `supabaseAdmin.from().select()` for table existence checks

---

## Phase 2: Service Layer Tests (MEDIUM PRIORITY) 🟡

**Timeline**: Week 2 (5-7 days)
**Lines to Test**: ~700 lines
**Target Coverage**: 70%

### 2.1 Intent Detection Tests (`intent.test.ts`)

**Module**: `src/router/services/intent.ts` (431 lines after refactor)
**Function**: `normalizeUserQuery(userInput: string): IntentResult`

```typescript
// Test file: src/router/services/__tests__/intent.test.ts

describe('Three-Tier Hierarchy', () => {
  ✓ Exclude TIER_3 when TIER_1 matches
  ✓ Allow TIER_2 even when TIER_1 matches
  ✓ Fall back to TIER_3 for generic queries
  ✓ Tier priority in tiebreaker (TIER_1 > TIER_2 > TIER_3)
});

describe('Enhanced Scoring System', () => {
  ✓ Multi-word phrases get 3x weight
  ✓ Discriminator keywords boost score
  ✓ Exact phrase matching
  ✓ Case-insensitive keyword matching
});

describe('Five-Stage Tiebreaker', () => {
  ✓ Stage 1: Highest score wins
  ✓ Stage 2: Lowest tier number wins
  ✓ Stage 3: Most matched keywords wins
  ✓ Stage 4: Total keyword length wins
  ✓ Stage 5: Alphabetical order (deterministic)
});

describe('Parameter Extraction', () => {
  ✓ Extract year (2024)
  ✓ Extract quarter (Q1, first quarter)
  ✓ Extract month (January, Jan)
  ✓ Extract shift (A, B, C)
  ✓ Extract equipment IDs (EX-189, TIP-45)
  ✓ Extract top/bottom N queries
  ✓ Extract numeric filters (>, <, BETWEEN)
  ✓ Extract date ranges (from...to)
  ✓ Extract relative dates (last month, this year)
  ✓ Use parsed_date object for complex dates
});

describe('Specific Intents', () => {
  ✓ EQUIPMENT_SPECIFIC_PRODUCTION
  ✓ GET_TRIP_DATA
  ✓ SHIFT_COMPARISON
  ✓ TOP_BOTTOM_QUERY
  ✓ EQUIPMENT_COMBINATION
  ✓ FORECASTING
  ✓ All 25+ intent types
});

describe('Determinism', () => {
  ✓ Same query → same result (10 iterations)
  ✓ Parameter extraction consistency
  ✓ Case variations produce same result
});
```

**Mock Requirements**:
- Mock `parseDate()` for isolated parameter testing
- No external dependencies in pure intent detection

---

### 2.2 Database Service Tests (`database.test.ts`)

**Module**: `src/router/services/database.ts`
**Focus**: SQL validation pipeline (4 steps)

```typescript
// Test file: src/router/services/__tests__/database.test.ts

describe('Validation Pipeline', () => {
  describe('Step 0: Table Normalization', () => {
    ✓ Normalize table names before other validation
    ✓ Map aliases correctly
    ✓ Preserve valid tables
  });
  
  describe('Step 1: Equipment ID Anti-Pattern', () => {
    ✓ Detect "equipment_id = 'literal'" pattern
    ✓ Log warning for anti-pattern
    ✓ Allow "equipment_id IN (...)" pattern
  });
  
  describe('Step 2: Column Alias Addition', () => {
    ✓ Add "total_" prefix to SUM()
    ✓ Add "avg_" prefix to AVG()
    ✓ Add "count_" prefix to COUNT()
    ✓ Add "max_" prefix to MAX()
    ✓ Add "min_" prefix to MIN()
    ✓ Preserve existing aliases
  });
  
  describe('Step 3: Ambiguous Column Fixing', () => {
    ✓ Detect ambiguous column errors
    ✓ Add table qualifiers automatically
    ✓ Handle multi-table queries
  });
  
  describe('Pipeline Integration', () => {
    ✓ Steps execute in correct order (0→1→2→3)
    ✓ Failed step doesn't block subsequent steps
    ✓ All steps log validation results
  });
});

describe('SQL Execution', () => {
  ✓ Execute valid SQL successfully
  ✓ Handle SQL errors gracefully
  ✓ Return structured results
  ✓ Log execution time
});
```

**Mock Requirements**:
- Mock `supabaseAdmin.rpc('execute_sql', ...)`
- Mock console.warn/console.error for validation logging
- Mock table normalization functions

---

## Phase 3: Integration & Advanced Tests (LOW PRIORITY) 🟢

**Timeline**: Week 3 (5-7 days)
**Target Coverage**: 60%

### 3.1 End-to-End Router Tests (`router.integration.test.ts`)

```typescript
// Test file: src/router/__tests__/router.integration.test.ts

describe('Full Routing Pipeline', () => {
  ✓ User query → Intent detection → SQL generation → Execution → Results
  ✓ Rule router success (simple query)
  ✓ LLM router fallback (complex query)
  ✓ Cache hit scenario
  ✓ Cache miss scenario
  ✓ Error recovery and retry
});

describe('Routing Decision Logic', () => {
  ✓ Use rule router for high-confidence intents (> 0.7)
  ✓ Use LLM router for low-confidence intents (< 0.7)
  ✓ Handle routing failures
});
```

**Mock Requirements**:
- Mock OpenAI API calls
- Mock Supabase database calls
- Mock cache layer

---

### 3.2 Override Function Tests (`overrides.test.ts`)

**Module**: `src/router/helpers/overrides.ts`

```typescript
// Test file: src/router/helpers/__tests__/overrides.test.ts

describe('equipmentSpecificProductionSQL', () => {
  ✓ Generate SQL for single equipment ID
  ✓ Generate SQL for multiple equipment IDs
  ✓ Handle date filters
  ✓ Handle shift filters
});

describe('aggregationSummarySQL', () => {
  ✓ Generate GROUP BY queries
  ✓ Handle aggregation functions (SUM, AVG, COUNT)
  ✓ Add correct column aliases
});

describe('shiftComparisonSQL', () => {
  ✓ Compare two shifts
  ✓ Compare three shifts
  ✓ Handle date filters in comparison
});

describe('dateRangeAggregationSQL', () => {
  ✓ Generate date range queries
  ✓ Handle custom date ranges
  ✓ Apply aggregation functions
});
```

---

### 3.3 Utility Tests (`dateUtils.test.ts`, `validation.test.ts`)

**Low priority** - These are smaller utility modules

---

## Phase 4: Coverage Reporting & CI/CD 🎯

### Add Coverage Reporting

```json
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});
```

### Add Coverage Script

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### CI/CD Integration

**GitHub Actions** (`.github/workflows/test.yml`):
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Testing Best Practices

### 1. Test Structure (AAA Pattern)
```typescript
it('should parse Q1 2024 correctly', () => {
  // Arrange
  const input = 'Q1 2024';
  
  // Act
  const result = parseQuarter(input);
  
  // Assert
  expect(result).toEqual({
    type: 'quarter',
    quarter: 1,
    year: 2024,
  });
});
```

### 2. Use Descriptive Test Names
```typescript
✅ it('should normalize Production_Summary to production_summary')
❌ it('test1')
```

### 3. Test Edge Cases First
```typescript
- Empty strings
- Null/undefined
- Invalid input
- Boundary conditions
- Error scenarios
```

### 4. Mock External Dependencies
```typescript
import { vi } from 'vitest';

// Mock Supabase
vi.mock('../utils/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [] }))
    }))
  }
}));
```

### 5. Use Test Fixtures
```typescript
// __tests__/fixtures/sampleQueries.ts
export const SAMPLE_QUERIES = {
  quarterQuery: 'show Q1 2024 production',
  equipmentQuery: 'show production for EX-189',
  complexQuery: 'compare shift A and B production for Q1 2024',
};
```

### 6. Snapshot Testing for SQL
```typescript
it('should generate correct SQL for equipment query', () => {
  const sql = equipmentSpecificProductionSQL(['EX-189']);
  expect(sql).toMatchSnapshot();
});
```

---

## Coverage Targets

| Module | Priority | Target Coverage | Est. Test Lines |
|--------|----------|-----------------|-----------------|
| `dateParser.ts` | 🔴 HIGH | 85% | 400 lines |
| `tableNormalizer.ts` | 🔴 HIGH | 85% | 300 lines |
| `intent.ts` | 🟡 MEDIUM | 75% | 500 lines |
| `database.ts` | 🟡 MEDIUM | 70% | 300 lines |
| `overrides.ts` | 🟢 LOW | 65% | 200 lines |
| `dateUtils.ts` | 🟢 LOW | 60% | 100 lines |
| **TOTAL** | | **75%** | **~1,800 lines** |

---

## Implementation Timeline

### Week 1: Core Helpers (HIGH PRIORITY)
- ✅ Day 1: Create `dateParser.test.ts` (200 lines)
- ✅ Day 2: Complete `dateParser.test.ts` (400 lines total)
- ✅ Day 3: Create `tableNormalizer.test.ts` (300 lines)
- ✅ Day 4: Run tests, fix bugs, achieve 85% coverage
- ✅ Day 5: Code review, refactor based on test findings

### Week 2: Service Layer (MEDIUM PRIORITY)
- ✅ Day 1-2: Create `intent.test.ts` (500 lines)
- ✅ Day 3-4: Create `database.test.ts` (300 lines)
- ✅ Day 5: Integration testing, fix issues

### Week 3: Integration & Polish (LOW PRIORITY)
- ✅ Day 1-2: Create `router.integration.test.ts`
- ✅ Day 3: Create `overrides.test.ts`
- ✅ Day 4: Add coverage reporting
- ✅ Day 5: CI/CD setup, documentation

---

## Next Steps

### Immediate Actions (Today)
1. ✅ Install coverage provider: `npm install -D @vitest/coverage-v8`
2. ✅ Create first test file: `dateParser.test.ts`
3. ✅ Run tests: `npm test`
4. ✅ Fix any discovered bugs

### This Week
1. Complete Phase 1 (dateParser + tableNormalizer tests)
2. Achieve 85% coverage for helper functions
3. Document any bugs found during testing

### Next 2 Weeks
1. Complete Phase 2 (intent + database tests)
2. Add coverage reporting
3. Set up CI/CD pipeline

---

## Benefits of This Approach

### 1. **Risk Reduction**
- Catch bugs before production
- Prevent regressions when adding new features
- Validate documented edge cases automatically

### 2. **Confidence**
- Know that date parsing works correctly
- Verify table normalization handles all cases
- Ensure validation pipeline catches errors

### 3. **Documentation**
- Tests serve as executable documentation
- Show how to use each function
- Demonstrate expected behavior

### 4. **Faster Development**
- Catch bugs immediately in watch mode
- Refactor with confidence
- TDD for new features

### 5. **Production Readiness**
- Industry-standard coverage (70-80%)
- Automated testing in CI/CD
- Quality assurance before deployment

---

## Example: Starting with Date Parser Tests

Here's what the first test file will look like:

```typescript
// src/router/helpers/__tests__/dateParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseQuarter, parseRelativeDate, parseMonth } from '../dateParser';

describe('parseQuarter', () => {
  it('should parse Q1 2024', () => {
    const result = parseQuarter('Q1 2024');
    expect(result).toEqual({
      type: 'quarter',
      quarter: 1,
      year: 2024,
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    });
  });

  it('should parse first quarter of 2023', () => {
    const result = parseQuarter('first quarter of 2023');
    expect(result.quarter).toBe(1);
    expect(result.year).toBe(2023);
  });

  it('should handle second quarter', () => {
    const result = parseQuarter('second quarter');
    expect(result.quarter).toBe(2);
    expect(result.year).toBe(new Date().getFullYear());
  });

  it('should return null for invalid quarter', () => {
    const result = parseQuarter('Q5 2024');
    expect(result).toBeNull();
  });
});

// Run with: npm test
// Run with coverage: npm run test:coverage
// Run in watch mode: npm run test:watch
```

---

## Questions to Consider

1. **Should we aim for 70% or 80% coverage?**
   - Recommendation: 75% overall, 85% for critical functions

2. **Do we need E2E tests now or later?**
   - Recommendation: Start with unit tests, add E2E in Phase 3

3. **Should we use TDD for future features?**
   - Recommendation: Yes, write tests before implementation

4. **How do we handle flaky tests?**
   - Use deterministic mocks
   - Avoid time-dependent tests
   - Use test fixtures

5. **What about performance tests?**
   - Add in Phase 4 if needed
   - Focus on correctness first

---

## Success Metrics

### After Week 1
- ✅ 85% coverage for `dateParser.ts` and `tableNormalizer.ts`
- ✅ All Priority 7 & 8 test cases executable
- ✅ 0 critical bugs found

### After Week 2
- ✅ 75% coverage for `intent.ts` and `database.ts`
- ✅ Validation pipeline fully tested
- ✅ Parameter extraction verified

### After Week 3
- ✅ 75% overall test coverage
- ✅ CI/CD pipeline running tests automatically
- ✅ Coverage reports generated
- ✅ All team members can run tests locally

---

## Conclusion

This strategy provides a **phased, pragmatic approach** to testing:

1. **Start with high-value targets** (dateParser, tableNormalizer)
2. **Build incrementally** (don't try to do everything at once)
3. **Focus on critical functionality** first
4. **Add coverage reporting** for visibility
5. **Integrate into CI/CD** for automation

**Estimated total effort**: 15-20 days of work
**Estimated test code**: ~1,800 lines
**Expected coverage**: 75%+ across router system
**Risk reduction**: High (catch 80%+ of bugs before production)

Would you like me to start implementing Phase 1 (dateParser and tableNormalizer tests) now?
