-- Create media_folders table to track user folders in the media library
-- This avoids the need for placeholder files in storage (which don't work with MIME type restrictions)

CREATE TABLE IF NOT EXISTS media_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_path TEXT, -- NULL for root-level folders, otherwise the parent folder path
    full_path TEXT NOT NULL, -- Full path including this folder name
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique folder paths per user
    UNIQUE(user_id, full_path)
);

-- Create index for faster lookups
CREATE INDEX idx_media_folders_user_id ON media_folders(user_id);
CREATE INDEX idx_media_folders_parent_path ON media_folders(user_id, parent_path);

-- Enable RLS
ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own folders
CREATE POLICY "Users can view their own folders"
ON media_folders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create folders for themselves
CREATE POLICY "Users can create their own folders"
ON media_folders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own folders
CREATE POLICY "Users can delete their own folders"
ON media_folders
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
