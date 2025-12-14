/*
  # Add File Storage and Processing Support

  ## Changes
  1. Add storage_path column to uploaded_files table
  2. Create storage bucket for uploaded files with public access
  3. Add error_message column for better error tracking

  ## Notes
  - Storage bucket 'uploaded-files' will store actual file content
  - storage_path tracks location in bucket
  - error_message helps debug processing failures
*/

-- Add storage_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_files' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE uploaded_files ADD COLUMN storage_path TEXT;
  END IF;
END $$;

-- Add error_message column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_files' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE uploaded_files ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- Create storage bucket for uploaded files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploaded-files', 
  'uploaded-files', 
  true,
  104857600, -- 100MB limit
  ARRAY['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- Set up storage policies with size restrictions
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public Access" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
  DROP POLICY IF EXISTS "Public can read" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploaded-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Public can read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'uploaded-files');

-- Update default settings if not exists
INSERT INTO rag_settings (
  user_id,
  row_chunk_size,
  chunk_overlap,
  top_k,
  search_combined,
  embedding_model,
  db_choice,
  vector_store
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  10,
  0,
  5,
  true,
  'text-embedding-ada-002',
  'bolt',
  'faiss'
)
ON CONFLICT (user_id) DO NOTHING;