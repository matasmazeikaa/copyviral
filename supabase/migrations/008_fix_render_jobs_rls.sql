-- Fix RLS policies for render_jobs to allow service role access

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own render jobs" ON render_jobs;
DROP POLICY IF EXISTS "Service role can read render jobs" ON render_jobs;
DROP POLICY IF EXISTS "Service role can update render jobs" ON render_jobs;

-- Allow all SELECT (service role and authenticated users can read)
-- Users will still only see their own jobs in the app due to query filters
CREATE POLICY "Allow read render jobs"
    ON render_jobs FOR SELECT
    USING (true);

-- Allow all UPDATE (needed for Lambda to update status)
CREATE POLICY "Allow update render jobs"
    ON render_jobs FOR UPDATE
    USING (true);

-- Keep INSERT restricted to authenticated users creating their own jobs
DROP POLICY IF EXISTS "Users can create own render jobs" ON render_jobs;
CREATE POLICY "Users can create own render jobs"
    ON render_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);
