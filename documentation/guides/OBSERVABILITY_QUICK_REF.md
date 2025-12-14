# Quick Reference: Minimal Observability

## 🎯 What You Got (15 minutes of work)

✅ **Correlation IDs** - Every request tracked  
✅ **Error Logging** - failures.log for debugging  
✅ **JSON Logs** - Easy to grep/parse  
✅ **Zero Cost** - No external services  

---

## 📋 Common Tasks

### User Reports Error
```typescript
// Error message includes correlation ID:
"[1763109895350-abc123] Router error: Something broke"

// Search logs:
Get-Content failures.log | Select-String "1763109895350-abc123"
```

### Check Low-Confidence Queries
```powershell
# View all failures
Get-Content failures.log

# Parse and group by intent
Get-Content failures.log | ForEach-Object { 
  $_ | ConvertFrom-Json 
} | Group-Object intent | Select-Object Count, Name
```

### Find Slow Queries (>1000ms)
```powershell
# Grep console logs for high latency
# (Assuming you pipe console to file)
Get-Content routes.log | Select-String "latency_ms\":[1-9][0-9]{3,}"
```

### Weekly Review
```powershell
# Count total requests
Get-Content routes.log | Select-String "route_success" | Measure-Object

# Count errors
Get-Content failures.log | Measure-Object -Line

# Top 5 failing intents
Get-Content failures.log | ForEach-Object { 
  $_ | ConvertFrom-Json 
} | Group-Object intent | Sort-Object Count -Desc | Select-Object -First 5
```

---

## 🔧 Adjust Sensitivity

Edit `src/router/helpers/thresholds.ts`:

```typescript
export const THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,  // ← Lower to log more (e.g., 0.5 or 0.4)
  LOW: 0.4,
};
```

**Lower MEDIUM = More queries logged to failures.log**

---

## 📂 Files Added

```
src/
  utils/
    correlationId.ts     - Generate unique IDs
    simpleLogger.ts      - Log failures & routes
  test/
    testCorrelationId.ts - Basic test
    testLowConfidence.ts - Low confidence test  
    observabilityDemo.ts - Demo script

failures.log             - Auto-created when needed
```

---

## 🚀 Run Tests

```powershell
# Basic test
npx tsx src/test/testCorrelationId.ts

# Demo
npx tsx src/test/observabilityDemo.ts

# Full test suite (should still pass)
npm test
```

---

## 📊 Example Log Entry

**Console (route success):**
```json
{
  "event": "route_success",
  "timestamp": "2025-11-14T08:44:55.349Z",
  "correlationId": "1763109895343-0x08f8vu9",
  "question": "What was total production in Q3?",
  "intent": "AGGREGATION_QUERY",
  "confidence": 0.8,
  "task": "sql",
  "latency_ms": 5.02
}
```

**failures.log (low confidence or error):**
```json
{
  "timestamp": "2025-11-14T08:44:55.350Z",
  "correlationId": "1763109895350-0pcpgm7ie",
  "question": "asdfghjkl",
  "intent": "UNKNOWN",
  "confidence": 0.4
}
```

---

## 🎓 When to Upgrade

### Now (Beta):
- ✅ Basic correlation IDs
- ✅ Error logging
- ✅ Console JSON logs

### 10+ Active Users:
- Add Winston (structured logging)
- Add log rotation (prevent disk fill)
- Consider external log service

### Before Production:
- Full observability (Prometheus + Grafana)
- Alerting (PagerDuty)
- Distributed tracing (OpenTelemetry)

---

## ✅ Verification

All 322 tests pass ✓  
Correlation IDs working ✓  
Errors logged with stack traces ✓  
Zero production dependencies ✓  

**You're good to ship beta!**
