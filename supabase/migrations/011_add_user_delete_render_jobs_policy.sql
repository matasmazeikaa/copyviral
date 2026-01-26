-- Add RLS policy for users to delete their own render jobs
-- The existing "Service role can delete render jobs" policy with USING(true) 
-- was intended for service role but doesn't properly allow regular users to delete

-- Drop the old confusingly-named policy
DROP POLICY IF EXISTS "Service role can delete render jobs" ON render_jobs;

-- Create proper policy for users to delete their own render jobs
CREATE POLICY "Users can delete own render jobs"
    ON render_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- Also allow service role (admin client) to delete any render job
-- This uses a function that checks if the current role is service_role
CREATE POLICY "Service role can delete any render jobs"
    ON render_jobs FOR DELETE
    USING (auth.role() = 'service_role');
