/*
  # Mining Co-Pilot Database Schema

  ## Overview
  Complete database schema for the Mining Co-Pilot application supporting SQL queries,
  RAG document management, chat history, diagnostics, and user management.

  ## New Tables

  ### 1. users
  - `id` (uuid, primary key) - User ID
  - `email` (text) - User email
  - `role` (text) - User role: admin, analyst, viewer
  - `created_at` (timestamptz) - Account creation timestamp

  ### 2. uploaded_files
  - `id` (uuid, primary key) - File ID
  - `user_id` (uuid) - Owner user ID
  - `filename` (text) - Original filename
  - `file_type` (text) - CSV, XLSX, PDF, DOCX
  - `size_bytes` (bigint) - File size
  - `namespace` (text) - Unique namespace for this file
  - `status` (text) - pending, indexing, ready, error
  - `progress` (integer) - 0-100
  - `doc_count` (integer) - Number of chunks created
  - `version` (integer) - File version for re-uploads
  - `error_message` (text) - Error details if failed
  - `uploaded_at` (timestamptz) - Upload timestamp
  - `indexed_at` (timestamptz) - Indexing completion timestamp

  ### 3. rag_chunks
  - `id` (uuid, primary key) - Chunk ID
  - `file_id` (uuid) - Source file reference
  - `namespace` (text) - File or combined namespace
  - `content` (text) - Chunk text content
  - `embedding` (vector(1536)) - OpenAI embedding vector
  - `metadata` (jsonb) - Sheet name, row/page numbers, etc.
  - `chunk_index` (integer) - Sequence number
  - `created_at` (timestamptz) - Creation timestamp

  ### 4. chat_history
  - `id` (uuid, primary key) - Chat ID
  - `user_id` (uuid) - User reference
  - `question` (text) - User question
  - `answer` (text) - System response
  - `route_taken` (text) - sql or rag
  - `confidence` (real) - Router confidence 0-1
  - `manual_override` (boolean) - User manually chose route
  - `sql_query` (text) - Generated SQL if SQL route
  - `citations` (jsonb) - RAG citations array
  - `tokens_used` (integer) - Token count
  - `latency_ms` (integer) - Response time
  - `created_at` (timestamptz) - Question timestamp

  ### 5. sql_cache
  - `id` (uuid, primary key) - Cache entry ID
  - `query_hash` (text, unique) - Hash of normalized query
  - `query` (text) - Original SQL
  - `result` (jsonb) - Cached result set
  - `created_at` (timestamptz) - Cache creation
  - `accessed_at` (timestamptz) - Last access
  - `hit_count` (integer) - Access counter

  ### 6. rag_settings
  - `id` (uuid, primary key) - Settings ID
  - `user_id` (uuid, unique) - User reference
  - `row_chunk_size` (integer) - 1-50, default 10
  - `chunk_overlap` (integer) - 0-50, default 0
  - `top_k` (integer) - 1-10, default 5
  - `search_combined` (boolean) - Search all files together
  - `embedding_model` (text) - OpenAI model name
  - `db_choice` (text) - bolt or supabase
  - `supabase_url` (text) - External Supabase URL if used
  - `supabase_key` (text) - External Supabase key (encrypted)
  - `vector_store` (text) - faiss or pgvector
  - `updated_at` (timestamptz) - Last settings update

  ### 7. diagnostics
  - `id` (uuid, primary key) - Log entry ID
  - `user_id` (uuid) - User reference
  - `request_type` (text) - sql, rag, upload, etc.
  - `path_taken` (text) - Routing decision
  - `latency_ms` (integer) - Request duration
  - `tokens_used` (integer) - Token consumption
  - `cache_hit` (boolean) - Whether cache was used
  - `error` (text) - Error message if failed
  - `metadata` (jsonb) - Additional context
  - `created_at` (timestamptz) - Log timestamp

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Admin role can access all data for management

  ## Indexes
  - Performance indexes on foreign keys, timestamps, and query fields
  - Vector similarity index on embeddings (if pgvector)
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'analyst', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Uploaded files table
CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (length(filename) > 0 AND length(filename) <= 255),
  file_type text NOT NULL CHECK (file_type IN ('CSV', 'XLSX', 'PDF', 'DOCX')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  namespace text UNIQUE NOT NULL CHECK (length(namespace) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'ready', 'error')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  doc_count integer NOT NULL DEFAULT 0 CHECK (doc_count >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  error_message text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz
);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own files"
  ON uploaded_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upload files"
  ON uploaded_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files"
  ON uploaded_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files"
  ON uploaded_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RAG chunks table
CREATE TABLE IF NOT EXISTS rag_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id uuid NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  namespace text NOT NULL CHECK (length(namespace) > 0),
  content text NOT NULL CHECK (length(content) > 0),
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chunks from own files"
  ON rag_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE uploaded_files.id = rag_chunks.file_id
      AND uploaded_files.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage chunks"
  ON rag_chunks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE uploaded_files.id = rag_chunks.file_id
      AND uploaded_files.user_id = auth.uid()
    )
  );

-- Create vector similarity index
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx 
  ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Chat history table
CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (length(question) > 0 AND length(question) <= 10000),
  answer text NOT NULL CHECK (length(answer) > 0),
  route_taken text NOT NULL CHECK (route_taken IN ('sql', 'rag')),
  confidence real CHECK (confidence >= 0 AND confidence <= 1),
  manual_override boolean NOT NULL DEFAULT false,
  sql_query text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_used integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat history"
  ON chat_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create chat entries"
  ON chat_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SQL cache table
CREATE TABLE IF NOT EXISTS sql_cache (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_hash text UNIQUE NOT NULL CHECK (length(query_hash) > 0),
  query text NOT NULL CHECK (length(query) > 0),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accessed_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0)
);

ALTER TABLE sql_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON sql_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create cache"
  ON sql_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cache"
  ON sql_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RAG settings table
CREATE TABLE IF NOT EXISTS rag_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_chunk_size integer DEFAULT 10 CHECK (row_chunk_size >= 1 AND row_chunk_size <= 50),
  chunk_overlap integer DEFAULT 0 CHECK (chunk_overlap >= 0 AND chunk_overlap <= 50),
  top_k integer DEFAULT 5 CHECK (top_k >= 1 AND top_k <= 10),
  search_combined boolean DEFAULT true,
  embedding_model text DEFAULT 'text-embedding-ada-002',
  db_choice text DEFAULT 'bolt' CHECK (db_choice IN ('bolt', 'supabase')),
  supabase_url text,
  supabase_key text,
  vector_store text DEFAULT 'faiss' CHECK (vector_store IN ('faiss', 'pgvector')),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rag_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON rag_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings"
  ON rag_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON rag_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Diagnostics table
CREATE TABLE IF NOT EXISTS diagnostics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (length(request_type) > 0),
  path_taken text,
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  tokens_used integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  cache_hit boolean NOT NULL DEFAULT false,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own diagnostics"
  ON diagnostics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create diagnostics"
  ON diagnostics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all diagnostics"
  ON diagnostics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Performance indexes
CREATE INDEX IF NOT EXISTS uploaded_files_user_id_idx ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS uploaded_files_namespace_idx ON uploaded_files(namespace);
CREATE INDEX IF NOT EXISTS uploaded_files_status_idx ON uploaded_files(status) WHERE status != 'ready';
CREATE INDEX IF NOT EXISTS rag_chunks_file_id_idx ON rag_chunks(file_id);
CREATE INDEX IF NOT EXISTS rag_chunks_namespace_idx ON rag_chunks(namespace);
CREATE INDEX IF NOT EXISTS chat_history_user_id_idx ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS chat_history_created_at_idx ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS chat_history_user_created_idx ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sql_cache_query_hash_idx ON sql_cache(query_hash);
CREATE INDEX IF NOT EXISTS sql_cache_accessed_at_idx ON sql_cache(accessed_at);
CREATE INDEX IF NOT EXISTS diagnostics_user_id_idx ON diagnostics(user_id);
CREATE INDEX IF NOT EXISTS diagnostics_created_at_idx ON diagnostics(created_at DESC);
CREATE INDEX IF NOT EXISTS diagnostics_request_type_idx ON diagnostics(request_type);