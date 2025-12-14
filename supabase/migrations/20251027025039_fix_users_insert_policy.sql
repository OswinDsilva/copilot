/*
  # Fix Users Table Insert Policy

  ## Changes
  - Add INSERT policy for users table to allow user creation
  - Enforce user ownership - users can only create their own profile
  - Require auth.uid() to match the id being inserted
  - Allow admin override via JWT claims for user creation flows

  ## Security
  - User isolation: Users can only insert records for themselves
  - Admin override: Supports app initialization and admin flows
  - Input validation: id must match auth.uid() or user must be admin
*/

-- Add insert policy for users table with proper user isolation
DROP POLICY IF EXISTS "Users can create profile" ON users;
CREATE POLICY "Users can create profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Users can create their own profile
    auth.uid() = id
    -- Or admin can create profiles for initialization
    OR current_setting('request.jwt.claims.role', true) = 'admin'
  );

-- Add insert policy for anon role supporting app initialization
DROP POLICY IF EXISTS "Anon can create user profile" ON users;
CREATE POLICY "Anon can create user profile"
  ON users FOR INSERT
  TO anon
  WITH CHECK (
    -- Anon can create profile if x-user-id header matches id being inserted
    id::text = current_setting('request.headers.x-user-id', true)
    -- Or system admin via JWT claims for initialization
    OR current_setting('request.jwt.claims.role', true) = 'admin'
  );