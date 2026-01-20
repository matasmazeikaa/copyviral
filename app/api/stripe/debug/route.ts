import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/app/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(request: NextRequest) {
  try {
    // Require authentication for debug endpoint
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 });
    }

    // List all active prices
    const prices = await stripe.prices.list({
      active: true,
      limit: 10,
    });

    // Get account info to verify connection
    const account = await stripe.accounts.retrieve();

    return NextResponse.json({
      connected: true,
      accountId: account.id,
      mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
      prices: prices.data.map(p => ({
        id: p.id,
        product: p.product,
        unitAmount: p.unit_amount,
        currency: p.currency,
        recurring: p.recurring,
      })),
    });
  } catch (error: any) {
    console.error('Stripe debug error:', error);
    return NextResponse.json({
      connected: false,
      error: error.message,
    }, { status: 500 });
  }
}
