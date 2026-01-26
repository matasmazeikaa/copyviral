-- Create storage bucket for rendered videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'renders',
    'renders',
    true,  -- Public bucket for easy downloads
    524288000,  -- 500MB max file size
    ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the renders bucket

-- Allow authenticated users to read their own renders
CREATE POLICY "Users can view own renders"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'renders' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role to upload renders (Lambda uses service key)
-- Note: Service role bypasses RLS, but we add this for clarity
CREATE POLICY "Service role can upload renders"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'renders');

-- Allow service role to update/overwrite renders
CREATE POLICY "Service role can update renders"
ON storage.objects FOR UPDATE
USING (bucket_id = 'renders');

-- Allow users to delete their own renders
CREATE POLICY "Users can delete own renders"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'renders' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Public read access for download URLs
-- Since bucket is public, anyone with the URL can download
CREATE POLICY "Public can read renders"
ON storage.objects FOR SELECT
USING (bucket_id = 'renders');
