# Minimal Correlation ID Implementation

## ✅ What Was Added

### 1. **Correlation ID Generator** (`src/utils/correlationId.ts`)
- Generates unique IDs: `timestamp-randomString` (e.g., `1763109711159-kwuqmfhew`)
- Used to track every request through the system

### 2. **Simple Logger** (`src/utils/simpleLogger.ts`)
- **`logFailure()`**: Writes low-confidence queries and errors to `failures.log`
- **`logRoute()`**: Logs successful routes to console in JSON format

### 3. **Router Integration** (`src/router/index.ts`)
- Every request gets a unique correlation ID
- Correlation ID attached to the response: `(result as any).correlation_id`
- Low confidence queries (< 0.6) logged to `failures.log`
- All routes logged to console for easy grepping
- Errors include correlation ID: `[1763109711159-abc123] Router error: ...`

---

## 🎯 How It Works

### Normal Query:
```typescript
const result = await routeQuestion('What was production last month?');
console.log(result.correlation_id); // "1763109711159-kwuqmfhew"
```

**Console output:**
```json
{
  "event": "route_success",
  "timestamp": "2025-11-14T08:41:51.166Z",
  "correlationId": "1763109711159-kwuqmfhew",
  "question": "What was production last month?",
  "intent": "AGGREGATION_QUERY",
  "confidence": 0.8,
  "task": "sql",
  "latency_ms": 5.49
}
```

---

### Low Confidence Query:
```typescript
const result = await routeQuestion('show me stuff');
// If confidence < 0.6, writes to failures.log
```

**failures.log entry:**
```json
{
  "timestamp": "2025-11-14T08:41:51.170Z",
  "correlationId": "1763109711166-odrbwunmc",
  "question": "show me stuff",
  "intent": "DATA_RETRIEVAL",
  "confidence": 0.5
}
```

---

### Error Query:
```typescript
try {
  await routeQuestion(invalidInput);
} catch (error) {
  console.log(error.message); 
  // "[1763109711171-abc123] Router error: Something went wrong"
}
```

**failures.log entry:**
```json
{
  "timestamp": "2025-11-14T08:41:51.172Z",
  "correlationId": "1763109711171-o82lndy4z",
  "question": "...",
  "error": "Something went wrong",
  "stack": "Error: Something went wrong\n    at ..."
}
```

---

## 📊 Usage Examples

### View All Routes (Console Logs):
```powershell
# If running in development, console shows JSON logs
# You can grep/filter them

# In production, redirect console to file:
npm start > routes.log 2>&1
```

### Check Low-Confidence Queries:
```powershell
# View failures.log
Get-Content failures.log

# Parse as JSON and analyze
Get-Content failures.log | ForEach-Object { 
  $_ | ConvertFrom-Json 
} | Where-Object { $_.confidence -lt 0.5 } | Format-Table
```

### Find Error by Correlation ID:
```powershell
# User reports error with ID: 1763109711171-o82lndy4z
Get-Content failures.log | Select-String "1763109711171-o82lndy4z"
```

### Count Issues by Intent:
```powershell
Get-Content failures.log | ForEach-Object { 
  $_ | ConvertFrom-Json 
} | Group-Object intent | Select-Object Count, Name
```

---

## 🎁 Benefits for Beta

1. **Debuggable Errors**
   - Users can report correlation ID from error message
   - You can find exact request in logs

2. **Quality Monitoring**
   - `failures.log` shows which queries confuse the system
   - Review weekly to improve intent detection

3. **Performance Tracking**
   - Every log includes `latency_ms`
   - Grep for slow queries: `Select-String "latency_ms\":[5-9][0-9]{3}"`

4. **Zero Overhead**
   - No external services
   - No cost
   - Just local files and console logs

---

## 📝 Next Steps

### For Beta (Now):
- ✅ Correlation IDs working
- ✅ Errors logged with stack traces
- ✅ Low confidence queries tracked
- ✅ Console JSON logs for easy grepping

### When You Scale (10+ Users):
- Add Winston for structured logging with rotation
- Consider log aggregation (if queries > 1000/day)

### Before Production:
- Implement full observability from the guide

---

## 🔧 Configuration

To adjust what gets logged, edit `THRESHOLDS.MEDIUM` in `src/router/helpers/thresholds.ts`:

```typescript
export const THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,  // ← Lower this to log more queries (e.g., 0.5)
  LOW: 0.4,
};
```

---

## ✅ Testing

Run the test:
```powershell
npx tsx src/test/testCorrelationId.ts
```

Expected output:
- Console shows JSON logs for each request
- Each request has unique correlation ID
- Low confidence queries (if any) written to `failures.log`
- Errors include correlation ID in message

---

## 📦 What Changed

**New Files:**
- `src/utils/correlationId.ts` - ID generation
- `src/utils/simpleLogger.ts` - Logging utilities
- `src/test/testCorrelationId.ts` - Test script

**Modified Files:**
- `src/router/index.ts` - Added correlation ID, logging, error handling
- `src/router/helpers/debug.ts` - Fixed import.meta.env check

**Files Created:**
- `failures.log` - Auto-created when low-confidence query occurs

---

**Total implementation time: ~15 minutes**  
**Total lines of code added: ~80**  
**Cost: $0**  
**Value: Can now debug production issues!**
