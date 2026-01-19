-- Storage policies for media-library bucket
-- This migration sets up proper Row Level Security (RLS) policies for user file storage
-- with the following constraints:
-- 1. Users can only access their own files (stored in user_id/ folder)
-- 2. Maximum file size: 1GB (1073741824 bytes)
-- 3. Only video and audio files are allowed (no images)

-- First, ensure the media-library bucket exists and is private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'media-library',
    'media-library',
    false,  -- Private bucket
    1073741824,  -- 1GB in bytes
    ARRAY[
        -- Video MIME types
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/ogg',
        'video/3gpp',
        'video/3gpp2',
        -- Audio MIME types
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/aac',
        'audio/flac',
        'audio/x-m4a',
        'audio/mp4',
        'audio/webm'
    ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 1073741824,
    allowed_mime_types = ARRAY[
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/ogg',
        'video/3gpp',
        'video/3gpp2',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/aac',
        'audio/flac',
        'audio/x-m4a',
        'audio/mp4',
        'audio/webm'
    ]::text[];

-- Drop existing policies if they exist (for clean migration)
DROP POLICY IF EXISTS "Users can upload files to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Policy: Users can upload files to their own folder
-- The file path must start with the user's ID (e.g., "user_id/filename.mp4")
CREATE POLICY "Users can upload files to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view/download their own files
CREATE POLICY "Users can view their own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'media-library'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
