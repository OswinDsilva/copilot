# Scaling Considerations for Multi-Table Database

## Overview
This document outlines potential issues and solutions that will arise when the database schema expands beyond the current 2 tables (`production_summary` and `trip_summary_by_date`) to include additional populated tables.

---

## 1. Table Ambiguity - Which Table to Query?

### Current State
- Only 2 tables with data → router can implicitly determine which table based on query type
  - `production_summary` → production/tonnage/shift queries
  - `trip_summary_by_date` → trip-specific/route queries

### Problem with More Tables
When multiple tables exist, queries become ambiguous:

**Examples:**
- "Show me maintenance records" → Which table?
  - `equipment_maintenance`?
  - `service_logs`?
  - `maintenance_history`?

- "Show production data" → Which table?
  - `production_summary`?
  - `production_by_equipment`?
  - `production_hourly`?
  - `production_detailed`?

- Queries might need data from **multiple tables** requiring JOIN operations

### Required Changes
Router needs to:
1. Detect which table(s) the query requires
2. Extract table names from intent/parameters
3. Handle JOIN logic when data spans multiple tables
4. Manage table priority/preference when multiple tables could answer the query

---

## 2. Schema Validation Complexity

### Current State
Schema validator checks against 2 hardcoded table schemas:
```typescript
const PRODUCTION_SUMMARY_SCHEMA = ['id', 'user_id', 'date', 'shift', ...];
const TRIP_SUMMARY_SCHEMA = ['id', 'user_id', 'trip_date', 'shift', ...];
```

### Problem with More Tables
- Need to determine **which table's schema** to validate against
- Column names overlap across tables (`id`, `date`, `user_id`, `created_at`)
- Same column name might have different meanings in different tables
- Validation needs to check **all referenced tables** in multi-table queries

### Example Complexity
```typescript
// Current: Simple single-table validation
validateAgainstSchema(sql, PRODUCTION_SUMMARY_SCHEMA)

// Future: Multi-table validation required
const tables = detectTablesInQuery(query);
const validationResults = tables.map(table => ({
  table,
  isValid: validateAgainstSchema(sql, getSchema(table))
}));
```

### Required Changes
1. Dynamic schema loading based on detected tables
2. Context-aware column validation (which table does this column belong to?)
3. Foreign key relationship awareness for JOIN validation
4. Alias resolution across multiple table contexts

---

## 3. Intent Detection Ambiguity

### Current State
Intent keywords map cleanly to table concepts:
- "trips" → `trip_summary_by_date`
- "tonnage" → `production_summary`
- "excavator" → could be either table

### Problem with More Tables
Keywords become ambiguous across multiple domains:

**Equipment queries:**
- "equipment" could mean:
  - `equipment_inventory` (what equipment exists)
  - `equipment_maintenance` (maintenance records)
  - `equipment_assignments` (who's using what)
  - `equipment_specifications` (technical details)
  - `equipment_performance` (productivity metrics)

**Cost queries:**
- "cost" could mean:
  - `fuel_costs`
  - `maintenance_costs`
  - `operational_costs`
  - `labor_costs`
  - `total_cost_analysis`

### Required Changes
Need additional parameters to disambiguate:
```typescript
// Current
parameters: {
  machine_types: ['excavator']
}

// Future - need sub-categorization
parameters: {
  query_domain: 'equipment',
  query_type: 'maintenance',  // NEW: disambiguate intent
  table_hint: 'equipment_maintenance',  // NEW: routing hint
  machine_types: ['excavator']
}
```

### Proposed Solution
Intent sub-categorization system:
```typescript
const INTENTS = [
  { 
    intent: 'EQUIPMENT_INVENTORY_QUERY', 
    keywords: ['available equipment', 'equipment list', 'what equipment'],
    tables: ['equipment_inventory'] 
  },
  { 
    intent: 'EQUIPMENT_MAINTENANCE_QUERY', 
    keywords: ['maintenance', 'service', 'repair', 'breakdown'],
    tables: ['equipment_maintenance', 'service_logs'] 
  },
  { 
    intent: 'EQUIPMENT_PERFORMANCE_QUERY', 
    keywords: ['productivity', 'efficiency', 'utilization'],
    tables: ['equipment_performance', 'production_summary'] 
  }
]
```

---

## 4. SQL Generation Complexity

### Current State
Simple single-table SELECT statements:
```sql
SELECT * FROM production_summary WHERE date = '2025-01-15';
SELECT * FROM trip_summary_by_date WHERE shift = 'A';
```

### Problem with More Tables
Need to generate complex multi-table queries:

**JOIN queries:**
```sql
SELECT 
  p.date,
  p.qty_ton,
  e.name AS equipment_name,
  e.capacity,
  m.last_service_date,
  m.next_service_due
FROM production_summary p
JOIN equipment_inventory e ON p.excavator = e.equipment_id
LEFT JOIN equipment_maintenance m ON e.equipment_id = m.equipment_id
WHERE p.date BETWEEN '2025-01-01' AND '2025-01-31'
  AND m.next_service_due < CURRENT_DATE + INTERVAL '7 days';
```

**Subqueries:**
```sql
SELECT * FROM production_summary 
WHERE excavator IN (
  SELECT equipment_id 
  FROM equipment_maintenance 
  WHERE last_service_date < CURRENT_DATE - INTERVAL '30 days'
);
```

**Aggregations across tables:**
```sql
SELECT 
  e.equipment_id,
  SUM(p.qty_ton) as total_production,
  SUM(c.fuel_cost + c.maintenance_cost) as total_cost,
  SUM(p.qty_ton) / SUM(c.fuel_cost + c.maintenance_cost) as cost_efficiency
FROM production_summary p
JOIN equipment_inventory e ON p.excavator = e.equipment_id
JOIN costs c ON e.equipment_id = c.equipment_id AND p.date = c.date
GROUP BY e.equipment_id;
```

### Required Changes
LLM prompt needs to include:
1. **Complete relationship schema:**
   - Foreign key mappings
   - Primary key definitions
   - Cardinality (one-to-many, many-to-many)

2. **JOIN patterns and best practices:**
   - When to use INNER vs LEFT vs RIGHT JOIN
   - Performance considerations
   - How to avoid Cartesian products

3. **Query optimization hints:**
   - When to use subqueries vs JOINs
   - When to break into multiple queries
   - Index awareness

---

## 5. Parameter Extraction Context Dependency

### Current State
Parameters extracted without table context:
```typescript
// "Show me trips for January"
parameters: { 
  month: 1 
} 
// Implicitly uses trip_summary_by_date.trip_date
```

### Problem with More Tables
Date columns exist in multiple tables with different meanings:

**Example: "Show me trips for January"**
Could reference:
- `trip_summary_by_date.trip_date` (when trip occurred)
- `trip_details.departure_date` (when trip started)
- `trip_assignments.scheduled_date` (when trip was planned)
- `trip_costs.billing_date` (when cost was recorded)

**Example: "Show me equipment from last month"**
Could reference:
- `equipment_inventory.purchase_date` (when acquired)
- `equipment_assignments.assignment_date` (when assigned)
- `equipment_maintenance.service_date` (when serviced)
- `equipment_performance.measurement_date` (performance metric date)

### Required Changes
Table-aware parameter extraction:
```typescript
extractParameters(text, detectedTable) {
  const params = {};
  
  if (parseDate(text)) {
    // Table-specific date field mapping
    const dateField = getDateFieldForTable(detectedTable);
    params[dateField] = parseDate(text);
  }
  
  return params;
}

function getDateFieldForTable(table) {
  const dateFieldMap = {
    'trip_summary_by_date': 'trip_date',
    'trip_details': 'departure_date',
    'equipment_maintenance': 'service_date',
    'production_summary': 'date'
  };
  return dateFieldMap[table] || 'date';
}
```

---

## 6. Calculation Keyword Ambiguity

### Current State
Calculation keywords map clearly:
- "total tonnage" → `SUM(qty_ton)` from `production_summary`
- "trip count" → `SUM(trip_count)` from `trip_summary_by_date`

### Problem with More Tables
Aggregation targets become ambiguous:

**"Total cost":**
- `SUM(fuel_costs.amount)`?
- `SUM(maintenance_costs.amount)`?
- `SUM(operational_costs.amount)`?
- `SUM(fuel_costs.amount + maintenance_costs.amount + operational_costs.amount)` (combine all)?

**"Average utilization":**
- `AVG(equipment_usage.hours_operated / equipment_usage.hours_available)`?
- `AVG(shift_performance.productive_time / shift_performance.total_time)`?
- `AVG(route_efficiency.actual_trips / route_efficiency.planned_trips)`?

**"Maximum production":**
- `MAX(production_summary.qty_ton)`?
- `MAX(production_detailed.hourly_production)`?
- `MAX(production_by_equipment.equipment_output)`?

### Required Changes
1. **Intent-specific calculation mapping:**
```typescript
const CALCULATION_MAPPINGS = {
  'total_cost': {
    'fuel': 'SUM(fuel_costs.amount)',
    'maintenance': 'SUM(maintenance_costs.amount)',
    'all': 'SUM(fuel_costs.amount + maintenance_costs.amount + operational_costs.amount)'
  },
  'utilization': {
    'equipment': 'AVG(equipment_usage.hours_operated / equipment_usage.hours_available)',
    'shift': 'AVG(shift_performance.productive_time / shift_performance.total_time)'
  }
}
```

2. **Clarification prompts** when ambiguous:
   - "Do you want total cost for fuel only, or all costs?"
   - "Show utilization for equipment or shifts?"

---

## 7. Performance & Query Optimization

### Current State
- Small tables with simple queries
- No performance concerns
- All queries return quickly

### Problem with More Tables
1. **Expensive JOIN operations:**
   - Multi-table JOINs on large datasets
   - Cartesian products if relationships misconfigured
   - Missing indexes on foreign keys

2. **Data volume concerns:**
   - "Show me all data" → From which tables? Could return millions of rows
   - Need pagination for large result sets
   - Memory constraints on frontend

3. **Query complexity:**
   - Nested subqueries might be slow
   - Multiple aggregations across large tables
   - Window functions over large datasets

### Required Changes

**1. Query cost estimation:**
```typescript
function estimateQueryCost(tables, operations) {
  let cost = 0;
  
  tables.forEach(table => {
    cost += getTableRowCount(table);
  });
  
  if (operations.includes('JOIN')) cost *= 2;
  if (operations.includes('GROUP BY')) cost *= 1.5;
  if (operations.includes('SUBQUERY')) cost *= 1.5;
  
  return cost;
}

function shouldOptimize(queryCost) {
  return queryCost > COST_THRESHOLD;
}
```

**2. Optimization suggestions:**
```typescript
if (queryCost > HIGH_COST_THRESHOLD) {
  suggestions.push('Consider adding date range filter');
  suggestions.push('Use aggregate table instead: production_summary_monthly');
  suggestions.push('Query might take 30+ seconds, continue?');
}
```

**3. Result set limits:**
```typescript
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;

// Automatically add LIMIT if not specified
if (!query.includes('LIMIT')) {
  query += ` LIMIT ${DEFAULT_LIMIT}`;
}
```

**4. Materialized view suggestions:**
```typescript
// Detect frequently accessed multi-table queries
// Suggest creating materialized views or aggregate tables
const SUGGESTED_VIEWS = {
  'production_with_costs': `
    CREATE MATERIALIZED VIEW production_with_costs AS
    SELECT p.*, c.fuel_cost, c.maintenance_cost
    FROM production_summary p
    JOIN costs c ON p.date = c.date AND p.excavator = c.equipment_id
  `,
  'equipment_utilization_summary': `
    CREATE MATERIALIZED VIEW equipment_utilization_summary AS
    SELECT 
      equipment_id,
      DATE_TRUNC('month', date) as month,
      AVG(hours_operated / hours_available) as avg_utilization
    FROM equipment_usage
    GROUP BY equipment_id, DATE_TRUNC('month', date)
  `
}
```

---

## Recommended Implementation Strategy

### Phase 1: Foundation (Before Adding Tables)
1. **Create table metadata registry:**
```typescript
const TABLE_REGISTRY = {
  'production_summary': {
    columns: [...],
    primaryKey: 'id',
    dateColumn: 'date',
    commonQueries: ['tonnage', 'production', 'shift'],
    relatedTables: ['equipment_inventory'],
    estimatedRows: 100000
  },
  // ... other tables
}
```

2. **Implement table detection in parameters:**
```typescript
function detectTables(query, intent) {
  const tables = [];
  
  // Keyword-based detection
  if (/maintenance|service|repair/i.test(query)) {
    tables.push('equipment_maintenance');
  }
  
  // Intent-based detection
  if (intent === 'COST_ANALYSIS') {
    tables.push('costs', 'fuel_costs', 'maintenance_costs');
  }
  
  return tables;
}
```

3. **Build relationship map:**
```typescript
const TABLE_RELATIONSHIPS = {
  'production_summary': {
    'equipment_inventory': {
      joinType: 'INNER',
      on: 'production_summary.excavator = equipment_inventory.equipment_id'
    }
  },
  'equipment_maintenance': {
    'equipment_inventory': {
      joinType: 'LEFT',
      on: 'equipment_maintenance.equipment_id = equipment_inventory.equipment_id'
    }
  }
}
```

### Phase 2: Incremental Table Addition
1. Add tables one at a time
2. Update TABLE_REGISTRY for each new table
3. Add intent keywords for new table domains
4. Test routing with new table scenarios
5. Monitor query performance and adjust

### Phase 3: Advanced Features
1. Implement query cost estimation
2. Add materialized views for common multi-table queries
3. Build query optimization suggestions
4. Create clarification dialog for ambiguous queries
5. Implement result pagination and streaming

---

## Testing Strategy

### Test Coverage Needed
1. **Single table queries** (existing coverage)
2. **Two-table JOIN queries**
3. **Three+ table JOIN queries**
4. **Ambiguous queries** requiring clarification
5. **Performance tests** with large result sets
6. **Schema validation** across multiple tables
7. **Parameter extraction** with table context

### Example Test Cases
```typescript
// Ambiguous query - needs clarification
{ 
  query: "Show me costs for January",
  expectedBehavior: "request_clarification",
  clarificationOptions: ["fuel costs", "maintenance costs", "all costs"]
}

// Multi-table query
{ 
  query: "Show excavators that need maintenance",
  expectedTables: ["equipment_inventory", "equipment_maintenance"],
  expectedJoinType: "LEFT JOIN"
}

// Performance concern
{ 
  query: "Show all production data",
  expectedWarning: "Large result set, consider adding filters"
}
```

---

## Key Takeaways

1. **Table detection** is the foundational challenge - solve this first
2. **Intent sub-categorization** will be critical for disambiguation
3. **Schema registry** should be implemented before adding more tables
4. **Query optimization** will become important with table growth
5. **Incremental approach** recommended - add tables gradually, test thoroughly
6. **User clarification** dialogs will improve accuracy for ambiguous queries

---

## Next Steps

**Immediate (Before Adding Tables):**
- [ ] Create `TABLE_REGISTRY` metadata structure
- [ ] Implement table detection in parameter extraction
- [ ] Build `TABLE_RELATIONSHIPS` foreign key map
- [ ] Add table hints to intent detection

**Short-term (First New Tables):**
- [ ] Implement multi-table schema validation
- [ ] Update LLM prompts with relationship information
- [ ] Add JOIN generation logic to SQL builder
- [ ] Create comprehensive multi-table test suite

**Long-term (Full Schema):**
- [ ] Query cost estimation and optimization
- [ ] Materialized view management
- [ ] Clarification dialog system
- [ ] Performance monitoring and analytics
