-- Create projects table with camelCase naming convention
-- This table stores project state/information for persistence across devices

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "projectName" TEXT NOT NULL DEFAULT 'Untitled Project',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastModified" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "projectData" JSONB NOT NULL
);

-- Create index on userId for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects("userId");

-- Create index on lastModified for sorting
CREATE INDEX IF NOT EXISTS idx_projects_last_modified ON projects("lastModified" DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own projects
CREATE POLICY "Users can view their own projects"
  ON projects
  FOR SELECT
  USING (auth.uid() = "userId");

-- Policy: Users can insert their own projects
CREATE POLICY "Users can insert their own projects"
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = "userId");

-- Policy: Users can update their own projects
CREATE POLICY "Users can update their own projects"
  ON projects
  FOR UPDATE
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete their own projects"
  ON projects
  FOR DELETE
  USING (auth.uid() = "userId");

