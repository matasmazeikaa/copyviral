-- Render jobs table for tracking Lambda video renders
CREATE TABLE IF NOT EXISTS render_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    
    -- Input data (stored as JSONB for flexibility)
    input_data JSONB NOT NULL,
    
    -- Output
    download_url TEXT,
    file_size_bytes BIGINT,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- For batch exports
    batch_id UUID,
    batch_index INTEGER
);

-- Index for user queries
CREATE INDEX idx_render_jobs_user_id ON render_jobs(user_id);
CREATE INDEX idx_render_jobs_status ON render_jobs(status);
CREATE INDEX idx_render_jobs_batch_id ON render_jobs(batch_id);

-- RLS policies
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own render jobs
CREATE POLICY "Users can view own render jobs"
    ON render_jobs FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own render jobs
CREATE POLICY "Users can create own render jobs"
    ON render_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Service role can read all render jobs (for Lambda)
CREATE POLICY "Service role can read render jobs"
    ON render_jobs FOR SELECT
    USING (true);

-- Service role can update render jobs (for Lambda)
CREATE POLICY "Service role can update render jobs"
    ON render_jobs FOR UPDATE
    USING (true);

-- Service role can delete render jobs
CREATE POLICY "Service role can delete render jobs"
    ON render_jobs FOR DELETE
    USING (true);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_render_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER render_jobs_updated_at
    BEFORE UPDATE ON render_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_render_jobs_updated_at();
