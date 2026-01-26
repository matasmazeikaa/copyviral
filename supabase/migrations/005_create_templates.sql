-- Create unified templates table for both community and personal templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('community', 'personal')),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Template',
  description TEXT,
  "thumbnailUrl" TEXT,
  "viewCount" INTEGER DEFAULT 0,
  "sourceUrl" TEXT,
  "templateData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive" BOOLEAN DEFAULT true,
  category TEXT DEFAULT 'general',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraint: personal templates must have userId, community templates must not
  CONSTRAINT valid_template_ownership CHECK (
    (type = 'personal' AND "userId" IS NOT NULL) OR
    (type = 'community' AND "userId" IS NULL)
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates("userId") WHERE "userId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category) WHERE type = 'community';
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates("isActive") WHERE type = 'community';
CREATE INDEX IF NOT EXISTS idx_templates_updated ON templates("updatedAt" DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active community templates (public read)
CREATE POLICY "Anyone can view active community templates"
  ON templates
  FOR SELECT
  USING (type = 'community' AND "isActive" = true);

-- Policy: Users can view their own personal templates
CREATE POLICY "Users can view their own templates"
  ON templates
  FOR SELECT
  USING (type = 'personal' AND auth.uid() = "userId");

-- Policy: Users can insert their own personal templates
CREATE POLICY "Users can insert their own templates"
  ON templates
  FOR INSERT
  WITH CHECK (type = 'personal' AND auth.uid() = "userId");

-- Policy: Users can update their own personal templates
CREATE POLICY "Users can update their own templates"
  ON templates
  FOR UPDATE
  USING (type = 'personal' AND auth.uid() = "userId")
  WITH CHECK (type = 'personal' AND auth.uid() = "userId");

-- Policy: Users can delete their own personal templates
CREATE POLICY "Users can delete their own templates"
  ON templates
  FOR DELETE
  USING (type = 'personal' AND auth.uid() = "userId");

-- Note: Insert/Update/Delete for community templates should be done via service role key
-- No user-level policies needed for community template modification

-- Add comments for documentation
COMMENT ON TABLE templates IS 'Unified templates table for both community and personal templates';
COMMENT ON COLUMN templates.type IS 'Template type: community (admin-curated) or personal (user-created)';
COMMENT ON COLUMN templates."userId" IS 'Owner user ID (required for personal, null for community)';
COMMENT ON COLUMN templates."templateData" IS 'JSONB containing slots (timing/position) and textElements';
COMMENT ON COLUMN templates."viewCount" IS 'View count for community templates';
COMMENT ON COLUMN templates."isActive" IS 'Whether template is active/visible (mainly for community templates)';
