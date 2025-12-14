/*
  # Add Full-Text Search to RAG Chunks

  1. Changes
    - Add GIN index on content column for full-text search
    - This enables fast text search on chunk content
    
  2. Purpose
    - Allow efficient searching of RAG chunks by text content
    - Supports queries like "April", "January", "production"
*/

CREATE INDEX IF NOT EXISTS rag_chunks_content_fts_idx 
ON rag_chunks 
USING GIN (to_tsvector('english', content));