import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

const FREE_TIER_LIMIT = 3;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { generationType, metadata } = await request.json();

    // Get current profile with subscription status
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('aiGenerationsUsed, subscriptionStatus')
      .eq('id', user.id)
      .single();

    const currentUsage = profile?.aiGenerationsUsed || 0;
    const subscriptionStatus = profile?.subscriptionStatus || 'free';
    const isPremium = subscriptionStatus === 'active';

    // Check if user can generate (block if at or over limit for free users)
    if (!isPremium && currentUsage >= FREE_TIER_LIMIT) {
      return NextResponse.json(
        { error: 'AI generation limit reached. Please upgrade to Pro for unlimited generations.' },
        { status: 403 }
      );
    }

    // Update usage count
    await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        aiGenerationsUsed: currentUsage + 1,
        updatedAt: new Date().toISOString(),
      });

    // Log the generation
    await supabase
      .from('ai_generation_logs')
      .insert({
        userId: user.id,
        generationType: generationType || 'video_analysis',
        metadata: metadata || {},
      });

    return NextResponse.json({ success: true, newCount: currentUsage + 1 });
  } catch (error: any) {
    console.error('Increment usage error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

