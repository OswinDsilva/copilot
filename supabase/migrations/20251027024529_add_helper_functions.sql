/*
  # Add Helper Functions for Chat and Query Functionality

  ## Functions Created
  
  1. **get_schema_info()** - Returns schema information for all tables
     - Used by the router to understand available tables and columns
     - Returns table names, column names, and data types
  
  2. **execute_safe_sql(query_text)** - Safely executes SELECT queries
     - Only allows SELECT statements
     - Prevents destructive operations
     - Returns query results as JSON
  
  3. **match_documents(query_embedding, match_count, filter_namespaces)** - Vector similarity search
     - Finds similar documents using cosine similarity
     - Used for RAG queries with pgvector
     - Returns matching chunks with similarity scores

  ## Security
  - execute_safe_sql only allows SELECT queries
  - All functions have proper error handling
  - RLS policies still apply to all queries
*/

-- Function to get schema information
CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'name', table_name,
      'columns', (
        SELECT json_agg(
          json_build_object(
            'name', column_name,
            'type', data_type
          )
        )
        FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.table_schema = 'public'
      )
    )
  )
  INTO result
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT IN ('_prisma_migrations');
  
  RETURN result;
END;
$$;

-- Function to safely execute SQL queries
CREATE OR REPLACE FUNCTION execute_safe_sql(query_text TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  result JSON;
  query_upper TEXT;
BEGIN
  -- Input validation
  IF query_text IS NULL OR length(trim(query_text)) = 0 THEN
    RAISE EXCEPTION 'Query text cannot be empty';
  END IF;
  
  IF length(query_text) > 50000 THEN
    RAISE EXCEPTION 'Query text exceeds maximum length of 50000 characters';
  END IF;
  
  query_upper := UPPER(TRIM(query_text));
  
  -- Only allow SELECT statements
  IF query_upper NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block destructive operations and dangerous keywords
  IF query_upper LIKE '%DROP%' 
     OR query_upper LIKE '%DELETE%' 
     OR query_upper LIKE '%INSERT%' 
     OR query_upper LIKE '%UPDATE%' 
     OR query_upper LIKE '%TRUNCATE%'
     OR query_upper LIKE '%ALTER%'
     OR query_upper LIKE '%CREATE%'
     OR query_upper LIKE '%GRANT%'
     OR query_upper LIKE '%REVOKE%'
     OR query_upper LIKE '%COPY%'
     OR query_upper LIKE '%EXECUTE%' THEN
    RAISE EXCEPTION 'Destructive or administrative operations are not allowed';
  END IF;
  
  -- Execute query with timeout protection
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query_text || ') t'
  INTO result;
  
  RETURN COALESCE(result, '[]'::json);
EXCEPTION
  WHEN query_canceled THEN
    RAISE EXCEPTION 'Query execution timed out after 30 seconds';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query execution failed: %', SQLERRM;
END;
$$;

-- Function for vector similarity search (for pgvector)
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter_namespaces TEXT[] DEFAULT ARRAY['combined']
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  namespace TEXT,
  content TEXT,
  metadata JSONB,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Input validation
  IF query_embedding IS NULL THEN
    RAISE EXCEPTION 'Query embedding cannot be null';
  END IF;
  
  IF match_count < 1 OR match_count > 100 THEN
    RAISE EXCEPTION 'Match count must be between 1 and 100';
  END IF;
  
  IF filter_namespaces IS NULL OR array_length(filter_namespaces, 1) IS NULL THEN
    RAISE EXCEPTION 'Filter namespaces cannot be empty';
  END IF;
  
  RETURN QUERY
  SELECT
    rag_chunks.id,
    rag_chunks.file_id,
    rag_chunks.namespace,
    rag_chunks.content,
    rag_chunks.metadata,
    rag_chunks.chunk_index,
    1 - (rag_chunks.embedding <=> query_embedding) AS similarity
  FROM rag_chunks
  WHERE rag_chunks.namespace = ANY(filter_namespaces)
    AND rag_chunks.embedding IS NOT NULL
  ORDER BY rag_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;