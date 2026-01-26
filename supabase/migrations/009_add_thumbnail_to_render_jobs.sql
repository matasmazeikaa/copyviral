-- Add thumbnail_url column to render_jobs table for video preview thumbnails
ALTER TABLE render_jobs 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Comment for documentation
COMMENT ON COLUMN render_jobs.thumbnail_url IS 'URL to the video thumbnail image stored in Supabase Storage';
