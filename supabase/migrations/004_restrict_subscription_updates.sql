 -- Migration: Restrict user_profiles update policy to prevent subscription manipulation
-- Users should NOT be able to modify subscription-related fields directly

-- ============================================
-- PART 1: Add CHECK constraint for valid subscription statuses
-- ============================================

-- First, fix any invalid subscription statuses (like 'pro') to 'free'
UPDATE user_profiles 
SET "subscriptionStatus" = 'free' 
WHERE "subscriptionStatus" NOT IN ('free', 'active', 'canceled', 'past_due');

-- Add CHECK constraint to enforce valid subscription statuses
ALTER TABLE user_profiles 
DROP CONSTRAINT IF EXISTS valid_subscription_status;

ALTER TABLE user_profiles 
ADD CONSTRAINT valid_subscription_status 
CHECK ("subscriptionStatus" IN ('free', 'active', 'canceled', 'past_due'));

-- ============================================
-- PART 2: Restrict RLS update policy
-- ============================================

-- Drop the overly permissive update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;

-- Create a restricted update policy
-- Users can only update non-sensitive fields (email, updatedAt)
-- Subscription fields can ONLY be updated by service role (webhooks)
CREATE POLICY "Users can update their own profile (restricted)"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Ensure subscription fields are not being changed by checking they match current values
    -- This effectively blocks direct updates to these fields from client
    AND (
      -- Allow update only if subscription fields remain unchanged
      "subscriptionStatus" = (SELECT "subscriptionStatus" FROM user_profiles WHERE id = auth.uid())
      AND "subscriptionId" = (SELECT "subscriptionId" FROM user_profiles WHERE id = auth.uid())
      AND "subscriptionPriceId" = (SELECT "subscriptionPriceId" FROM user_profiles WHERE id = auth.uid())
      AND "subscriptionCurrentPeriodEnd" = (SELECT "subscriptionCurrentPeriodEnd" FROM user_profiles WHERE id = auth.uid())
      AND "stripeCustomerId" = (SELECT "stripeCustomerId" FROM user_profiles WHERE id = auth.uid())
      AND "aiGenerationsUsed" = (SELECT "aiGenerationsUsed" FROM user_profiles WHERE id = auth.uid())
      AND "aiGenerationsResetAt" = (SELECT "aiGenerationsResetAt" FROM user_profiles WHERE id = auth.uid())
    )
  );

-- Note: Service role (used by webhooks and server-side API routes) bypasses RLS entirely,
-- so it can still update subscription fields. This policy only restricts direct client access.
