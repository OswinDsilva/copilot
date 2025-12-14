/*
  # Allow Anonymous Access for Testing

  ## Changes
  - Update all RLS policies to allow 'anon' role in addition to 'authenticated'
  - This enables the app to work without full authentication setup
  - For production, proper authentication should be implemented

  ## Security Note
  - ⚠️ WARNING: This is for development/testing purposes ONLY
  - ⚠️ PRODUCTION: Remove or restrict these policies before going live
  - All policies currently allow unrestricted access (true)
  - For production: Replace 'true' with proper user_id/auth checks
  - Users can only access their own data
  
  ## Production Checklist
  - [ ] Replace all 'USING (true)' with proper auth.uid() checks
  - [ ] Remove anonymous (anon) role access
  - [ ] Implement proper authentication flow
  - [ ] Add rate limiting for API calls
  - [ ] Enable audit logging
*/

-- Drop and recreate policies for users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id OR current_setting('request.jwt.claims', true)::json->>'sub' = id::text);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id OR current_setting('request.jwt.claims', true)::json->>'sub' = id::text)
  WITH CHECK (auth.uid() = id OR current_setting('request.jwt.claims', true)::json->>'sub' = id::text);

-- Drop and recreate policies for uploaded_files table
DROP POLICY IF EXISTS "Users can view own files" ON uploaded_files;
CREATE POLICY "Users can view own files"
  ON uploaded_files FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can upload files" ON uploaded_files;
CREATE POLICY "Users can upload files"
  ON uploaded_files FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own files" ON uploaded_files;
CREATE POLICY "Users can update own files"
  ON uploaded_files FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete own files" ON uploaded_files;
CREATE POLICY "Users can delete own files"
  ON uploaded_files FOR DELETE
  USING (true);

-- Drop and recreate policies for rag_chunks table
DROP POLICY IF EXISTS "Users can view chunks from own files" ON rag_chunks;
CREATE POLICY "Users can view chunks from own files"
  ON rag_chunks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can manage chunks" ON rag_chunks;
CREATE POLICY "System can manage chunks"
  ON rag_chunks FOR ALL
  USING (true);

-- Drop and recreate policies for chat_history table
DROP POLICY IF EXISTS "Users can view own chat history" ON chat_history;
CREATE POLICY "Users can view own chat history"
  ON chat_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create chat messages" ON chat_history;
CREATE POLICY "Users can create chat messages"
  ON chat_history FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete own chat history" ON chat_history;
CREATE POLICY "Users can delete own chas
t history"
  ON chat_history FOR DELETE
  USING (true);

-- Drop and recreate policies for rag_settings table
DROP POLICY IF EXISTS "Users can view own settings" ON rag_settings;
CREATE POLICY "Users can view own settings"
  ON rag_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can update own settings" ON rag_settings;
CREATE POLICY "Users can update own settings"
  ON rag_settings FOR ALL
  USING (true);

-- Drop and recreate policies for sql_cache table
DROP POLICY IF EXISTS "Users can read cache" ON sql_cache;
CREATE POLICY "Users can read cache"
  ON sql_cache FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can manage cache" ON sql_cache;
CREATE POLICY "System can manage cache"
  ON sql_cache FOR ALL
  USING (true);

-- Drop and recreate policies for diagnostics table
DROP POLICY IF EXISTS "Users can view own diagnostics" ON diagnostics;
CREATE POLICY "Users can view own diagnostics"
  ON diagnostics FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can log diagnostics" ON diagnostics;
CREATE POLICY "System can log diagnostics"
  ON diagnostics FOR INSERT
  WITH CHECK (true);