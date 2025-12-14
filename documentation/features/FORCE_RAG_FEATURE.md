# Force RAG Feature

## Overview
Added a checkbox below the chat input that allows users to force queries to use RAG (document search) instead of letting the router decide between SQL and RAG.

## UI Changes

### ChatTab Component
**Location**: Below the chat input field

**Visual**:
```
┌─────────────────────────────────────────────────┐
│  [Input text box...........................] [Send] │
│  ☐ Force RAG (search documents instead of SQL)    │
└─────────────────────────────────────────────────┘
```

**Features**:
- Checkbox with clear label
- Hover effect for better UX
- Disabled when loading
- Persists state during typing
- Resets automatically after sending

## Backend Changes

### ChatTab.tsx
1. Added `forceRAG` state
2. Pass `'rag'` to `onSendMessage` when checkbox is checked
3. Pass `undefined` when unchecked (router decides)

### App.tsx
1. Already had `route` parameter support
2. Updated to include proper namespaces when forcing RAG:
   - Searches both 'combined' and 'production_summary' namespaces
   - Confidence set to 1.0
   - Reason: "User forced route via checkbox"
   - Sets `manual_override: true` in chat history

## How It Works

### Normal Flow (Checkbox Unchecked)
1. User types question
2. Clicks Send
3. Router analyzes question
4. Decides: SQL or RAG
5. Executes chosen route

### Force RAG Flow (Checkbox Checked)
1. User types question
2. User checks "Force RAG" checkbox
3. Clicks Send
4. **Router is skipped**
5. **Always uses RAG** with both namespaces
6. Searches documents for answer

## Use Cases

### When to Use Force RAG

✅ **Testing document search**:
- Verify RAG is working
- Test indexed data retrieval
- Debug search issues

✅ **Known data in documents**:
- Production summary queries
- Historical data analysis
- Document-based questions

✅ **Avoid SQL for specific queries**:
- Complex questions better suited for RAG
- When router might choose wrong path
- Natural language questions about data

### When NOT to Use Force RAG

❌ **Real-time data**:
- "How many trips today?" (not in documents)
- Current equipment status
- Live database queries

❌ **Aggregations**:
- "Total by shift" (needs GROUP BY)
- Calculations across tables
- Complex JOINs

❌ **Metadata queries**:
- "List tables"
- "Show schema"
- Database structure questions

## Examples

### Example 1: Force Production Query to RAG
**Scenario**: You know production data is indexed and want RAG results

**Steps**:
1. Check "Force RAG" checkbox
2. Type: "Show me production data for April"
3. Send

**Result**:
- Skips router
- Searches production_summary + combined namespaces
- Returns formatted answer from indexed data
- Shows "Route: RAG" with manual override flag

### Example 2: Normal Router Decision
**Scenario**: Let the system decide

**Steps**:
1. Leave checkbox unchecked
2. Type: "How many trips today?"
3. Send

**Result**:
- Router analyzes question
- Detects "count" keyword → chooses SQL
- Generates COUNT query
- Returns trip count

### Example 3: Force SQL Question to RAG (Testing)
**Scenario**: Test if RAG can answer SQL-type questions

**Steps**:
1. Check "Force RAG" checkbox
2. Type: "How many trips today?"
3. Send

**Result**:
- Forces RAG search
- May say "Not enough evidence" if trips aren't indexed
- Useful for testing what's in your documents

## Technical Details

### State Management
```typescript
const [forceRAG, setForceRAG] = useState(false);
```

### Message Sending
```typescript
onSendMessage(question, forceRAG ? 'rag' : undefined);
```

### Decision Object
```typescript
{
  task: 'rag',
  confidence: 1.0,
  reason: 'User forced route via checkbox',
  namespaces: ['combined', 'production_summary']
}
```

### Chat History Tracking
```typescript
manual_override: true  // Saved in database
```

## Benefits

### For Users
1. **Control**: Override router decisions
2. **Testing**: Verify RAG functionality
3. **Debugging**: Understand what's indexed
4. **Flexibility**: Choose best approach

### For Developers
1. **Testing**: Easy to test RAG without modifying router
2. **Debugging**: Isolate RAG vs SQL issues
3. **Demonstration**: Show RAG capabilities
4. **Feedback**: Track when users override router

## UI/UX Considerations

### Visual Design
- Clear, descriptive label
- Subtle gray text (not intrusive)
- Blue accent color when checked
- Smooth hover transition

### Accessibility
- Keyboard accessible (Space/Enter to toggle)
- Clear focus state
- Disabled state when loading
- Semantic HTML (label + input)

### User Guidance
- Label explains what it does
- "Force RAG (search documents instead of SQL)"
- No technical jargon
- Self-explanatory

## Future Enhancements

### Potential Improvements
1. **Remember last setting**: LocalStorage
2. **Show namespace selector**: Choose which namespaces to search
3. **Add Force SQL checkbox**: Opposite of Force RAG
4. **Tooltip**: Explain when to use Force RAG
5. **Smart defaults**: Auto-check for production queries
6. **Visual indicator**: Show when override is active in results

### Advanced Features
1. **Custom namespace input**: Let users specify namespaces
2. **Override history**: Track how often users override
3. **Smart suggestions**: "Try Force RAG for this question?"
4. **A/B testing**: Compare RAG vs SQL results

## Files Modified

1. `src/components/ChatTab.tsx`
   - Added forceRAG state
   - Added checkbox UI
   - Pass route override to parent

2. `src/App.tsx`
   - Updated decision object with namespaces
   - Set proper reason for forced route
   - Track manual_override in database

## Summary

✅ Checkbox added below chat input
✅ Forces RAG when checked
✅ Skips router entirely
✅ Searches all relevant namespaces
✅ Tracks manual override in history
✅ Clean, accessible UI
✅ Built and tested successfully

The feature gives users control over routing while maintaining the smart router for normal queries!
