import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/app/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Get the base URL for redirects
function getBaseUrl(request: NextRequest): string {
  // Use explicit app URL if set (recommended for production)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Vercel sets this automatically
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback to request origin
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { priceId } = await request.json();
    const baseUrl = getBaseUrl(request);

    console.log('Checkout request - priceId:', priceId, 'baseUrl:', baseUrl);

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
    }

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripeCustomerId')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripeCustomerId;

    // Create a new customer if they don't have one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabaseUserId: user.id,
        },
      });
      customerId = customer.id;
      console.log('Created new Stripe customer:', customerId);
    } else {
      // Ensure customer metadata has supabaseUserId (for existing customers)
      await stripe.customers.update(customerId, {
        metadata: { supabaseUserId: user.id }
      });
      console.log('Updated existing customer metadata:', customerId);
    }

    // Always upsert user_profiles to ensure row exists
    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString(),
      });
    
    if (upsertError) {
      console.error('Error upserting user_profiles:', upsertError);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${baseUrl}/subscription?success=true`,
      cancel_url: `${baseUrl}/subscription?canceled=true`,
      subscription_data: {
        metadata: {
          supabaseUserId: user.id,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

