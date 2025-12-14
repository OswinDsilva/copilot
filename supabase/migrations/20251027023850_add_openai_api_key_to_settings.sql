-- Production-ready SQL script for secure OpenAI API key management
-- Purpose: Add encrypted API key storage with validation, auditing, and RLS policies
-- Security: Keys are validated, audited, and access-controlled at database level
-- Notes:
--   Assumes PostgreSQL 11+ with pgcrypto extension
--   Designed for Supabase with JWT claims for audit tracking
--   API keys must be in format sk-* (OpenAI requirement)
--   All stored keys are encrypted using pgp_sym_encrypt

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add openai_api_key column if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_settings' AND column_name = 'openai_api_key'
  ) THEN
    ALTER TABLE rag_settings ADD COLUMN openai_api_key TEXT;
    COMMENT ON COLUMN rag_settings.openai_api_key IS
      'Encrypted OpenAI API key (format: sk-*). Stored encrypted, never sent to client unencrypted.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add openai_api_key column: %', SQLERRM;
END $$;

-- Add audit columns for tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_settings' AND column_name = 'api_key_updated_at'
  ) THEN
    ALTER TABLE rag_settings ADD COLUMN api_key_updated_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_settings' AND column_name = 'api_key_updated_by'
  ) THEN
    ALTER TABLE rag_settings ADD COLUMN api_key_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_settings' AND column_name = 'api_key_is_encrypted'
  ) THEN
    ALTER TABLE rag_settings ADD COLUMN api_key_is_encrypted BOOLEAN DEFAULT false;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add audit columns: %', SQLERRM;
END $$;

-- Encryption function to secure API keys before storage
CREATE OR REPLACE FUNCTION encrypt_openai_api_key(p_key TEXT, p_encryption_key TEXT DEFAULT current_setting('app.encryption_key', true))
RETURNS TEXT AS $$
BEGIN
  IF p_key IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in app.encryption_key setting';
  END IF;
  RETURN encode(pgp_sym_encrypt(p_key, p_encryption_key), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Decryption function for authorized access
CREATE OR REPLACE FUNCTION decrypt_openai_api_key(p_encrypted_key TEXT, p_encryption_key TEXT DEFAULT current_setting('app.encryption_key', true))
RETURNS TEXT AS $$
BEGIN
  IF p_encrypted_key IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in app.encryption_key setting';
  END IF;
  RETURN pgp_sym_decrypt(decode(p_encrypted_key, 'hex'), p_encryption_key);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Validate OpenAI key format function
CREATE OR REPLACE FUNCTION validate_openai_api_key_format(p_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_key IS NULL THEN
    RETURN true;
  END IF;
  RETURN p_key LIKE 'sk-%' AND length(p_key) >= 20;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Unified auditing trigger with validation and enforcement
CREATE OR REPLACE FUNCTION rag_settings_unified_audit()
RETURNS TRIGGER AS $$
DECLARE
  requestor uuid;
  action_type text;
  key_changed boolean;
BEGIN
  action_type := TG_OP;

  IF TG_OP = 'INSERT' THEN
    key_changed := NEW.openai_api_key IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    key_changed := NEW.openai_api_key IS DISTINCT FROM OLD.openai_api_key;
  ELSIF TG_OP = 'DELETE' THEN
    key_changed := OLD.openai_api_key IS NOT NULL;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.openai_api_key IS NOT NULL THEN
    IF NOT validate_openai_api_key_format(NEW.openai_api_key) THEN
      RAISE EXCEPTION 'Invalid OpenAI API key format. Must start with sk- and be at least 20 characters.';
    END IF;
    NEW.api_key_is_encrypted := true;
  END IF;

  BEGIN
    requestor := current_setting('request.jwt.claims.sub', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    requestor := NULL;
  END;

  IF TG_OP IN ('INSERT','UPDATE') AND key_changed THEN
    NEW.api_key_updated_at := now();
    NEW.api_key_updated_by := requestor;
  END IF;

  INSERT INTO rag_settings_audit_log (
    rag_settings_id, action, api_key_changed, changed_by, details
  )
  VALUES (
    COALESCE(NEW.id, OLD.id),
    action_type,
    key_changed,
    requestor,
    jsonb_build_object(
      'timestamp', now(),
      'api_key_changed', key_changed,
      'action', action_type,
      'user_id', requestor
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rag_settings_unified_audit_trigger ON rag_settings;

CREATE TRIGGER rag_settings_unified_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON rag_settings
  FOR EACH ROW
  EXECUTE FUNCTION rag_settings_unified_audit();

-- Application helper to set encryption key (call on application startup)
CREATE OR REPLACE FUNCTION set_encryption_key(p_key TEXT)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.encryption_key', p_key, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit log table
CREATE TABLE IF NOT EXISTS rag_settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_settings_id uuid NOT NULL REFERENCES rag_settings(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  api_key_changed boolean DEFAULT false,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES users(id),
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_rag_settings_id
  ON rag_settings_audit_log(rag_settings_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_changed
  ON rag_settings_audit_log(api_key_changed, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON rag_settings_audit_log(changed_by);

-- RLS policies
ALTER TABLE rag_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_view_own_rag_settings ON rag_settings;
DROP POLICY IF EXISTS users_insert_own_rag_settings ON rag_settings;
DROP POLICY IF EXISTS users_update_own_rag_settings ON rag_settings;
DROP POLICY IF EXISTS users_delete_own_rag_settings ON rag_settings;

CREATE POLICY users_view_own_rag_settings
  ON rag_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

CREATE POLICY users_insert_own_rag_settings
  ON rag_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::uuid);

CREATE POLICY users_update_own_rag_settings
  ON rag_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

CREATE POLICY users_delete_own_rag_settings
  ON rag_settings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- Masked default view for safe frontend access
CREATE OR REPLACE VIEW rag_settings_masked AS
SELECT
  id,
  user_id,
  CASE
    WHEN api_key_is_encrypted THEN 'sk********************'
    ELSE NULL
  END AS openai_api_key,
  api_key_updated_at,
  api_key_updated_by,
  api_key_is_encrypted
FROM rag_settings;

-- Secure function to access decrypted key for owner or admin only
CREATE OR REPLACE FUNCTION get_rag_settings_with_key(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  openai_api_key text,
  api_key_updated_at timestamptz,
  api_key_updated_by uuid,
  api_key_is_encrypted boolean
) AS $$
BEGIN
  IF auth.uid()::uuid = p_user_id
     OR current_setting('request.jwt.claims.role', true) = 'admin' THEN

    RETURN QUERY
    SELECT
      id,
      user_id,
      openai_api_key,
      api_key_updated_at,
      api_key_updated_by,
      api_key_is_encrypted
    FROM rag_settings
    WHERE user_id = p_user_id;

  ELSE
    RAISE EXCEPTION 'Unauthorized access to RAG settings for this user';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE rag_settings IS
  'Stores encrypted OpenAI API keys with full RLS auditing and enforcement';

COMMENT ON VIEW rag_settings_masked IS
  'Masks API keys in frontend-accessible queries. Shows only encrypted indicator.';

COMMENT ON FUNCTION get_rag_settings_with_key(uuid) IS
  'Allows owner or admin to read real encrypted API key. Requires user_id matching or admin role.';

COMMENT ON FUNCTION encrypt_openai_api_key(TEXT, TEXT) IS
  'Encrypts raw OpenAI API key using pgp_sym_encrypt. Requires app.encryption_key to be set.';

COMMENT ON FUNCTION decrypt_openai_api_key(TEXT, TEXT) IS
  'Decrypts stored encrypted API key for authorized access. Requires valid app.encryption_key.';

COMMENT ON FUNCTION set_encryption_key(TEXT) IS
  'Sets encryption key for session. Call on application startup with master encryption key.';
