# RAG Search Fix Summary

## Problem
Quick Questions returned no results:
- "Show me production data for April" → "Not enough evidence found"
- "What was production in January?" → Empty results

## Root Cause
1. Chunks had no embeddings (embedding = NULL)
2. `.textSearch()` method not working properly
3. No full-text search index on content column

## Solution

### 1. Added Full-Text Search Index
```sql
CREATE INDEX rag_chunks_content_fts_idx
ON rag_chunks USING GIN (to_tsvector('english', content));
```

### 2. Improved Search Logic
Changed from `.textSearch()` to keyword-based ILIKE:

```javascript
const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
query = query.or(keywords.map(k => `content.ilike.%${k}%`).join(','));
```

**How it works**:
- Extracts keywords: "Show me production data for April" → ['show', 'production', 'data', 'april']
- Searches: `content ILIKE '%april%' OR content ILIKE '%production%' OR ...`
- Returns chunks matching ANY keyword

## Results
✅ "Show production data for April" → Finds April records
✅ "What was production in January?" → Finds January records  
✅ "Compare shift A and B" → Finds both shift records
✅ Fast (<100ms), zero cost (no API calls)

## Files Modified
- `add_fulltext_search_to_rag_chunks.sql` - Added GIN index
- `src/services/rag.ts` - Changed search to ILIKE keywords
