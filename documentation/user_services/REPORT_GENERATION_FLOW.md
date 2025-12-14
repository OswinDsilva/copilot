# Report Generation Flow Documentation

## Overview

The Mining Co-Pilot application includes a **session-based reporting system** that automatically captures user interactions (questions, answers, SQL queries, and charts) and allows users to export a formatted Markdown report of their entire conversation session.

---

## Architecture

### Components

1. **reportStore** (`src/user_services/reporting/reportStore.ts`)
   - In-memory singleton managing the current session
   - Tracks all Q&A turns and associated metadata
   - Lifecycle: `startSession()` → `addTurn()` → `endSession()`

2. **reportAssembler** (`src/user_services/reporting/reportAssembler.ts`)
   - Transforms session data into Markdown format
   - Supports both Markdown and JSON export formats

3. **reportExporter** (`src/user_services/reporting/reportExporter.ts`)
   - Converts Markdown/JSON strings to browser-downloadable Blobs
   - Triggers browser download via temporary anchor element

4. **App.tsx Integration**
   - Manages session lifecycle tied to user activity
   - Captures Q&A turns after successful database saves
   - Provides UI button for manual report export

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER STARTS CONVERSATION                                 │
│    - First message triggers session creation                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SESSION INITIALIZATION (App.tsx useEffect)               │
│    - Generate sessionId: `session_${timestamp}_${userId}`   │
│    - reportStore.startSession(sessionId, userId)            │
│    - ReportSession created in memory:                       │
│      {                                                       │
│        sessionId: string,                                    │
│        userId: string,                                       │
│        startedAt: ISO timestamp,                            │
│        turns: []                                            │
│      }                                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. USER SENDS QUESTION                                      │
│    - handleSendMessage(question) triggered                  │
│    - Router determines task (SQL/RAG/OPTIMIZE)              │
│    - Backend processes request                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ANSWER GENERATED & SAVED                                 │
│    - saveChatMessage() writes to Supabase                   │
│    - Returns savedId (unique DB message ID)                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. TURN CAPTURED IN REPORT STORE (App.tsx)                  │
│    if (savedId && reportSessionId) {                        │
│      reportStore.addTurn({                                  │
│        id: savedId,                                          │
│        question: string,                                     │
│        answer: string,                                       │
│        timestamp: ISO string,                               │
│        route: 'sql' | 'rag',                                │
│        sqlQuery?: string,                                    │
│        charts: []                                            │
│      });                                                     │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. REPEAT STEPS 3-5 FOR EACH Q&A                           │
│    - Each turn appended to session.turns[]                  │
│    - All metadata preserved (SQL queries, routes, times)    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. USER CLICKS "EXPORT REPORT" BUTTON                       │
│    - handleGenerateReport() triggered                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SESSION FINALIZED                                        │
│    const session = reportStore.endSession();                │
│    - Adds endedAt timestamp to session                      │
│    - Returns complete ReportSession object                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. MARKDOWN ASSEMBLY                                        │
│    const markdown = buildMarkdown(session);                 │
│    - Header: Session ID, date range, turn count            │
│    - Body: Each turn formatted with:                        │
│      ## Q{n}: {question}                                    │
│      **Route:** {route} | **Time:** {timestamp}            │
│      ### Answer                                             │
│      {answer}                                               │
│      (SQL query if present)                                 │
│      ---                                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. BLOB EXPORT                                             │
│     const blob = exportMarkdown(markdown);                  │
│     - Creates Blob(markdown, {type: 'text/markdown'})      │
│     - UTF-8 encoded                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. BROWSER DOWNLOAD                                        │
│     downloadBlob(blob, filename);                           │
│     - Filename: Mining_Report_YYYY-MM-DD.md                 │
│     - Creates temporary <a> element                         │
│     - Sets href to blob URL                                 │
│     - Triggers click() → browser downloads file             │
│     - Cleans up URL.revokeObjectURL()                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 12. SESSION RESTART                                         │
│     - New sessionId generated                               │
│     - reportStore.startSession(newSessionId, userId)        │
│     - User can continue conversation                        │
│     - New turns added to fresh session                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Export Format

### File Details
- **Filename Pattern**: `Mining_Report_YYYY-MM-DD.md`
- **MIME Type**: `text/markdown`
- **Encoding**: UTF-8
- **File Extension**: `.md`

### Markdown Structure

```markdown
# Mining Co-Pilot Session Report

**Session ID:** session_1702368000000_00000000
**Started:** 2025-12-12T10:30:00.000Z
**Ended:** 2025-12-12T11:45:00.000Z
**Total Turns:** 5

---

## Q1: What was the total production in January?

**Route:** sql | **Timestamp:** 2025-12-12T10:31:15.000Z

### Answer

Query executed successfully. Found 1 results.

[
  {
    "total_ton": 125000,
    "total_m3": 98000
  }
]

**SQL Query:**
```sql
SELECT SUM(qty_ton) as total_ton, SUM(qty_m3) as total_m3
FROM production_summary
WHERE date >= '2025-01-01' AND date < '2025-02-01'
```

---

## Q2: What are the best practices for equipment maintenance?

**Route:** rag | **Timestamp:** 2025-12-12T10:35:42.000Z

### Answer

Based on industry best practices:

1. **Preventive Maintenance**: Schedule regular inspections every 100 operating hours
2. **Lubrication**: Check oil levels daily before operation
3. **Documentation**: Maintain detailed service logs for all equipment

---

[Additional turns...]

---

*Report generated by Mining Co-Pilot on 2025-12-12*
```

---

## Key Implementation Details

### Session Lifecycle

1. **Creation Trigger**: First message in empty chatHistory
2. **Duration**: Until user clicks "Export Report"
3. **Persistence**: In-memory only (resets on page reload)
4. **Restart**: Automatic after export for continuous use

### Data Capture

**What's Captured:**
- ✅ Question text
- ✅ Answer text (including formatted tables, charts)
- ✅ Route taken (sql/rag/optimize)
- ✅ SQL queries (when applicable)
- ✅ Timestamps (ISO 8601)
- ✅ Turn order (sequential)

**What's NOT Captured (Phase 1):**
- ❌ Chart images/SVG exports
- ❌ Citations/sources
- ❌ Confidence scores
- ❌ LLM token usage
- ❌ Latency metrics

### Export Mechanics

**Browser Compatibility:**
- Uses standard Blob API (all modern browsers)
- Temporary anchor element for download
- No server-side processing required
- Immediate cleanup (URL.revokeObjectURL)

**File System:**
- Downloads to user's default Downloads folder
- Browser handles filename conflicts (appends numbers)
- No server storage/retention

---

## UI Integration Points

### Export Button Location
- **Position**: Top right header, next to "LLM calls" counter
- **Label**: "📊 Export Report"
- **States**:
  - Disabled: No conversation (gray, cursor-not-allowed)
  - Enabled: Active conversation (blue, hover effects)

### User Notifications
- **Success**: "Report exported: Mining_Report_YYYY-MM-DD.md" (green, 3s)
- **Error**: "Failed to export report: {error}" (red, 5s)
- **No Session**: "No report session active" (red, 3s)

### Console Logs
```javascript
[Report] Session started: session_1702368000000_00000000
[Report] Turn added: 550e8400-e29b-41d4-a716-446655440000
[Report] Exported: Mining_Report_2025-12-12.md Turns: 5
```

---

## Future Enhancements (Not Yet Implemented)

### Phase 2: Chart Integration
- Hook into ChartRenderer export callbacks
- Capture SVG data via `onExport` prop
- Store base64-encoded images in ReportTurn.charts[]
- Embed images in Markdown via data URIs

### Phase 3: Delivery Options
- Email export (Supabase Edge Function + Resend API)
- WhatsApp sharing (Twilio API integration)
- PDF generation (using markdown-pdf or similar)
- Cloud storage (save to Supabase Storage bucket)

### Phase 4: Advanced Features
- Date range filtering (export last 7 days)
- Turn cherry-picking (select specific Q&A pairs)
- Custom templates (executive summary vs technical deep-dive)
- Scheduled reports (daily/weekly automation)

---

## Code Locations

### Core Files
| File | Purpose |
|------|---------|
| `src/user_services/reporting/reportStore.ts` | Session state management |
| `src/user_services/reporting/reportTypes.ts` | TypeScript definitions |
| `src/user_services/reporting/reportAssembler.ts` | Markdown/JSON builders |
| `src/user_services/reporting/reportExporter.ts` | Blob export & download |
| `src/App.tsx` (lines 13, 38-50, 520-537, 903-937, 963-973) | Integration points |

### Integration Points in App.tsx
1. **Line 13**: Import reportStore
2. **Lines 38-50**: State + session lifecycle useEffect
3. **Lines 520-537**: Turn capture after saveChatMessage
4. **Lines 903-937**: handleGenerateReport function
5. **Lines 963-973**: Export button UI

---

## Testing Checklist

- [ ] Session starts on first message
- [ ] Each Q&A turn captured correctly
- [ ] Export button disabled when no conversation
- [ ] Markdown file downloads successfully
- [ ] Filename includes current date
- [ ] Session restarts after export
- [ ] Multiple exports in same browsing session work
- [ ] SQL queries included in report
- [ ] RAG answers formatted correctly
- [ ] Timestamps in ISO 8601 format
- [ ] No memory leaks (session cleanup)
- [ ] Console logs appear for debugging

---

## Error Handling

### Covered Scenarios
1. **No active session**: Shows error notification
2. **Export failure**: Catches and displays error message
3. **Missing imports**: Dynamic import with try-catch
4. **Invalid session data**: buildMarkdown handles gracefully

### Not Covered (Known Limitations)
- Very large sessions (>1000 turns) may cause memory issues
- Chart data capture not implemented yet
- No retry mechanism for failed exports
- No validation of Markdown output

---

## Performance Notes

- **Memory Usage**: ~1KB per turn (text only)
- **Export Time**: <100ms for typical 10-20 turn sessions
- **Network Impact**: None (client-side only)
- **Storage**: No server storage, client downloads immediately

---

*Last Updated: December 12, 2025*
