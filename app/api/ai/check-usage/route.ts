import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

const FREE_TIER_LIMIT = 3;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with subscription info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('subscriptionStatus, aiGenerationsUsed')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is ok for new users
      console.error('Profile error:', profileError);
    }

    const subscriptionStatus = profile?.subscriptionStatus || 'free';
    const aiGenerationsUsed = profile?.aiGenerationsUsed || 0;
    const isPremium = subscriptionStatus === 'active';

    const canGenerate = isPremium || aiGenerationsUsed < FREE_TIER_LIMIT;
    const remaining = isPremium ? 'unlimited' : Math.max(0, FREE_TIER_LIMIT - aiGenerationsUsed);

    return NextResponse.json({
      canGenerate,
      isPremium,
      used: aiGenerationsUsed,
      limit: isPremium ? 'unlimited' : FREE_TIER_LIMIT,
      remaining,
    });
  } catch (error: any) {
    console.error('Check usage error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

