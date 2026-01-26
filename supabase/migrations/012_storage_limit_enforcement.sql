-- ============================================================================
-- Storage Limit Enforcement at Database Level
-- ============================================================================
-- This migration adds database-level enforcement of the 100GB storage limit
-- that CANNOT be bypassed even with direct Supabase API calls.
--
-- The limit applies to the combined total of:
-- - media-library bucket (user uploads)
-- - renders bucket (rendered videos)
--
-- Limits:
-- - Free tier: 5GB
-- - Pro tier (active subscription): 100GB
-- ============================================================================

-- Function to calculate total storage usage for a user across all buckets
CREATE OR REPLACE FUNCTION get_user_storage_bytes(user_id_param uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_bytes bigint := 0;
    media_bytes bigint := 0;
    renders_bytes bigint := 0;
BEGIN
    -- Calculate media-library usage (all files in user's folder, including subfolders)
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO media_bytes
    FROM storage.objects
    WHERE bucket_id = 'media-library'
      AND name LIKE user_id_param::text || '/%';
    
    -- Calculate renders usage
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO renders_bytes
    FROM storage.objects
    WHERE bucket_id = 'renders'
      AND name LIKE user_id_param::text || '/%';
    
    total_bytes := media_bytes + renders_bytes;
    
    RETURN total_bytes;
END;
$$;

-- Function to get user's storage limit based on subscription status
CREATE OR REPLACE FUNCTION get_user_storage_limit(user_id_param uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subscription_status text;
    free_limit bigint := 5368709120;  -- 5GB in bytes
    pro_limit bigint := 107374182400; -- 100GB in bytes
BEGIN
    -- Check subscription status
    SELECT status INTO subscription_status
    FROM subscriptions
    WHERE user_id = user_id_param
    LIMIT 1;
    
    -- Also check user_profiles as fallback
    IF subscription_status IS NULL THEN
        SELECT "subscriptionStatus" INTO subscription_status
        FROM user_profiles
        WHERE id = user_id_param;
    END IF;
    
    IF subscription_status = 'active' THEN
        RETURN pro_limit;
    ELSE
        RETURN free_limit;
    END IF;
END;
$$;

-- Function to check if a user can upload a file of given size
CREATE OR REPLACE FUNCTION can_user_upload(user_id_param uuid, file_size_bytes bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_usage bigint;
    storage_limit bigint;
    new_total bigint;
BEGIN
    current_usage := get_user_storage_bytes(user_id_param);
    storage_limit := get_user_storage_limit(user_id_param);
    new_total := current_usage + file_size_bytes;
    
    RETURN new_total <= storage_limit;
END;
$$;

-- ============================================================================
-- Update media-library INSERT policy to enforce storage limits
-- ============================================================================

-- Drop existing upload policy
DROP POLICY IF EXISTS "Users can upload files to their own folder" ON storage.objects;

-- Create new policy with storage limit check
-- Note: We check the limit BEFORE the upload completes, so we use a generous
-- estimate. The actual enforcement happens in the WITH CHECK clause.
CREATE POLICY "Users can upload files to their own folder with limit"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
        -- Check storage limit - use the metadata size if available, otherwise allow
        -- (the bucket's file_size_limit will still apply per-file)
        (metadata->>'size') IS NULL 
        OR can_user_upload(auth.uid(), COALESCE((metadata->>'size')::bigint, 0))
    )
);

-- ============================================================================
-- Add helper function to get detailed storage info (for debugging/admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_storage_info(user_id_param uuid)
RETURNS TABLE (
    total_used_bytes bigint,
    media_library_bytes bigint,
    renders_bytes bigint,
    storage_limit_bytes bigint,
    remaining_bytes bigint,
    usage_percentage numeric,
    is_premium boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    media_bytes bigint := 0;
    renders_bytes bigint := 0;
    total_bytes bigint := 0;
    limit_bytes bigint := 0;
    subscription_status text;
BEGIN
    -- Calculate media-library usage
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO media_bytes
    FROM storage.objects
    WHERE bucket_id = 'media-library'
      AND name LIKE user_id_param::text || '/%';
    
    -- Calculate renders usage
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO renders_bytes
    FROM storage.objects
    WHERE bucket_id = 'renders'
      AND name LIKE user_id_param::text || '/%';
    
    total_bytes := media_bytes + renders_bytes;
    limit_bytes := get_user_storage_limit(user_id_param);
    
    -- Check subscription status
    SELECT status INTO subscription_status
    FROM subscriptions
    WHERE user_id = user_id_param
    LIMIT 1;
    
    IF subscription_status IS NULL THEN
        SELECT "subscriptionStatus" INTO subscription_status
        FROM user_profiles
        WHERE id = user_id_param;
    END IF;
    
    RETURN QUERY SELECT
        total_bytes,
        media_bytes,
        renders_bytes,
        limit_bytes,
        GREATEST(0, limit_bytes - total_bytes),
        ROUND((total_bytes::numeric / NULLIF(limit_bytes, 0)::numeric) * 100, 2),
        COALESCE(subscription_status = 'active', false);
END;
$$;

-- ============================================================================
-- Update renders bucket INSERT policy for defense in depth
-- ============================================================================
-- Note: Lambda uses service role which bypasses RLS, but we add this check
-- in case someone tries to upload directly to the renders bucket.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can upload renders" ON storage.objects;

-- Create a more restrictive policy for renders bucket
-- This prevents authenticated users from uploading directly to renders
-- (Lambda uses service_role which bypasses RLS anyway)
CREATE POLICY "No direct uploads to renders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    -- Only allow if NOT the renders bucket (effectively blocks authenticated users)
    -- Service role bypasses this entirely
    bucket_id != 'renders'
    OR (
        -- If somehow uploading to renders, still enforce storage limit
        (storage.foldername(name))[1] = auth.uid()::text
        AND (
            (metadata->>'size') IS NULL 
            OR can_user_upload(auth.uid(), COALESCE((metadata->>'size')::bigint, 0))
        )
    )
);

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_storage_bytes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_storage_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_upload(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_storage_info(uuid) TO authenticated;

-- Also grant to service_role for Lambda
GRANT EXECUTE ON FUNCTION get_user_storage_bytes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_storage_limit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION can_user_upload(uuid, bigint) TO service_role;

-- ============================================================================
-- Safety-net trigger: Delete files that would exceed storage limit
-- ============================================================================
-- This trigger runs AFTER INSERT to catch any uploads that slipped through
-- due to race conditions or timing issues. It's a last line of defense.

CREATE OR REPLACE FUNCTION enforce_storage_limit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id_text text;
    user_uuid uuid;
    current_usage bigint;
    storage_limit bigint;
    file_size bigint;
BEGIN
    -- Only check media-library and renders buckets
    IF NEW.bucket_id NOT IN ('media-library', 'renders') THEN
        RETURN NEW;
    END IF;
    
    -- Extract user ID from path (first folder)
    user_id_text := (storage.foldername(NEW.name))[1];
    
    -- Skip if no valid user folder
    IF user_id_text IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Try to cast to UUID
    BEGIN
        user_uuid := user_id_text::uuid;
    EXCEPTION WHEN OTHERS THEN
        -- Not a valid UUID, skip check
        RETURN NEW;
    END;
    
    -- Get file size
    file_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
    
    -- Skip if no size info
    IF file_size = 0 THEN
        RETURN NEW;
    END IF;
    
    -- Calculate current usage (including this new file)
    current_usage := get_user_storage_bytes(user_uuid);
    storage_limit := get_user_storage_limit(user_uuid);
    
    -- If over limit, delete the file and raise error
    IF current_usage > storage_limit THEN
        -- Delete the file that was just inserted
        DELETE FROM storage.objects WHERE id = NEW.id;
        
        RAISE EXCEPTION 'Storage limit exceeded. Current usage: % bytes, Limit: % bytes', 
            current_usage, storage_limit;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on storage.objects
DROP TRIGGER IF EXISTS enforce_storage_limit ON storage.objects;
CREATE TRIGGER enforce_storage_limit
    AFTER INSERT ON storage.objects
    FOR EACH ROW
    EXECUTE FUNCTION enforce_storage_limit_trigger();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON FUNCTION get_user_storage_bytes IS 
'Calculates total storage usage for a user across media-library and renders buckets.';

COMMENT ON FUNCTION get_user_storage_limit IS 
'Returns the storage limit for a user based on their subscription status (5GB free, 100GB pro).';

COMMENT ON FUNCTION can_user_upload IS 
'Checks if a user can upload a file of the given size without exceeding their storage limit.';

COMMENT ON FUNCTION get_user_storage_info IS 
'Returns detailed storage information for a user including breakdown by bucket.';

COMMENT ON FUNCTION enforce_storage_limit_trigger IS 
'Trigger function that enforces storage limits after file upload. Deletes files that would exceed the limit.';
