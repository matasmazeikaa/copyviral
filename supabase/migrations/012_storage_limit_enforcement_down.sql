-- ============================================================================
-- REVERT: Storage Limit Enforcement at Database Level
-- ============================================================================
-- Run this to undo migration 012_storage_limit_enforcement.sql
-- ============================================================================

-- Drop the trigger
DROP TRIGGER IF EXISTS enforce_storage_limit ON storage.objects;

-- Drop the trigger function
DROP FUNCTION IF EXISTS enforce_storage_limit_trigger();

-- Drop the new policies
DROP POLICY IF EXISTS "Users can upload files to their own folder with limit" ON storage.objects;
DROP POLICY IF EXISTS "No direct uploads to renders" ON storage.objects;

-- Restore original media-library upload policy
CREATE POLICY "Users can upload files to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Restore original renders upload policy
CREATE POLICY "Service role can upload renders"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'renders');

-- Drop helper functions
DROP FUNCTION IF EXISTS get_user_storage_info(uuid);
DROP FUNCTION IF EXISTS can_user_upload(uuid, bigint);
DROP FUNCTION IF EXISTS get_user_storage_limit(uuid);
DROP FUNCTION IF EXISTS get_user_storage_bytes(uuid);
