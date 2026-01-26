-- Issue reports table for user feedback and bug reports
CREATE TABLE IF NOT EXISTS issue_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL CHECK (char_length(description) <= 1024),
    attachment_path TEXT,
    attachment_type TEXT CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'video')),
    page_url TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user queries and status filtering
CREATE INDEX idx_issue_reports_user_id ON issue_reports(user_id);
CREATE INDEX idx_issue_reports_status ON issue_reports(status);
CREATE INDEX idx_issue_reports_created_at ON issue_reports(created_at DESC);

-- RLS policies
ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own issue reports
CREATE POLICY "Users can view own issue reports"
    ON issue_reports FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own issue reports
CREATE POLICY "Users can create own issue reports"
    ON issue_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role can read all issue reports (for admin dashboard)
CREATE POLICY "Service role can read all issue reports"
    ON issue_reports FOR SELECT
    USING (true);

-- Service role can update issue reports (for status changes)
CREATE POLICY "Service role can update issue reports"
    ON issue_reports FOR UPDATE
    USING (true);

-- Create storage bucket for issue attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'issue-attachments',
    'issue-attachments',
    false,
    52428800, -- 50MB limit
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'video/quicktime'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for issue-attachments bucket
CREATE POLICY "Users can upload issue attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'issue-attachments' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own issue attachments"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'issue-attachments' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Service role can view all issue attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'issue-attachments');
