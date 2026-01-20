import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Use service role for webhook to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Helper to safely convert Stripe timestamp to ISO string
function safeTimestampToISO(timestamp: any): string | null {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// GET handler to test if endpoint is reachable
export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook endpoint is reachable',
    webhookSecretConfigured: !!webhookSecret,
    supabaseConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY
  });
}

export async function POST(request: NextRequest) {
  console.log('\n\n========================================');
  console.log('=== WEBHOOK RECEIVED AT', new Date().toISOString(), '===');
  console.log('========================================\n');
  
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  
  console.log('Signature present:', !!sig);
  console.log('Webhook secret configured:', !!webhookSecret);
  console.log('Webhook secret starts with:', webhookSecret?.substring(0, 10));

  let event: Stripe.Event;

  // SECURITY: Always verify webhook signature
  // In development, you can use Stripe CLI to forward webhooks with valid signatures:
  // stripe listen --forward-to localhost:3000/api/stripe/webhook
  if (!sig) {
    console.error('Missing Stripe signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('Webhook event type:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('=== handleCheckoutCompleted ===');
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  console.log('customerId:', customerId, 'subscriptionId:', subscriptionId);

  // Get the user ID from customer metadata
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    console.log('Customer was deleted');
    return;
  }

  let supabaseUserId = customer.metadata?.supabaseUserId;
  console.log('supabaseUserId from metadata:', supabaseUserId);
  
  // Fallback: Look up user by stripeCustomerId if metadata is missing
  if (!supabaseUserId) {
    console.log('No metadata, trying to find user by stripeCustomerId...');
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('stripeCustomerId', customerId)
      .single();
    
    if (profile) {
      supabaseUserId = profile.id;
      console.log('Found user by stripeCustomerId:', supabaseUserId);
      
      // Update the customer metadata for future webhooks
      await stripe.customers.update(customerId, {
        metadata: { supabaseUserId }
      });
    }
  }

  if (!supabaseUserId) {
    console.error('Could not find user for customer:', customerId);
    return;
  }

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
  console.log('Subscription status:', subscription.status);

  const periodEnd = safeTimestampToISO((subscription as any).current_period_end);
  const updateData = {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPriceId: subscription.items.data[0]?.price.id,
    ...(periodEnd && { subscriptionCurrentPeriodEnd: periodEnd }),
    updatedAt: new Date().toISOString(),
  };
  console.log('Updating user_profiles with:', updateData);

  const { data, error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', supabaseUserId)
    .select();

  if (error) {
    console.error('Supabase update error:', error);
  } else {
    console.log('Update result:', data);
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  
  // Get user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripeCustomerId', customerId)
    .single();

  if (!profile) {
    console.error('No user found for customer:', customerId);
    return;
  }

  const periodEnd = safeTimestampToISO((subscription as any).current_period_end);
  await supabase
    .from('user_profiles')
    .update({
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionPriceId: subscription.items.data[0]?.price.id,
      ...(periodEnd && { subscriptionCurrentPeriodEnd: periodEnd }),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', profile.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Get user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripeCustomerId', customerId)
    .single();

  if (!profile) {
    console.error('No user found for customer:', customerId);
    return;
  }

  const periodEnd = safeTimestampToISO((subscription as any).current_period_end);
  await supabase
    .from('user_profiles')
    .update({
      subscriptionStatus: 'canceled',
      ...(periodEnd && { subscriptionCurrentPeriodEnd: periodEnd }),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', profile.id);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!(invoice as any).subscription) return;
  
  const customerId = invoice.customer as string;
  
  // Get user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripeCustomerId', customerId)
    .single();

  if (!profile) return;

  // Reset AI generations on successful payment (new billing period)
  await supabase
    .from('user_profiles')
    .update({
      aiGenerationsUsed: 0,
      aiGenerationsResetAt: new Date().toISOString(),
      subscriptionStatus: 'active',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', profile.id);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!(invoice as any).subscription) return;
  
  const customerId = invoice.customer as string;
  
  // Get user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripeCustomerId', customerId)
    .single();

  if (!profile) return;

  await supabase
    .from('user_profiles')
    .update({
      subscriptionStatus: 'past_due',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', profile.id);
}

