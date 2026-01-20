'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  createCheckoutSession, 
  openCustomerPortal,
  PRICE_IDS,
  PLANS 
} from '@/app/services/subscriptionService';
import { createClient } from '@/app/utils/supabase/client';
import toast from 'react-hot-toast';
import { 
  Sparkles, 
  Check, 
  Zap, 
  Crown, 
  ArrowRight,
  Loader2,
  CreditCard,
  Settings,
  AlertCircle
} from 'lucide-react';

interface SubscriptionData {
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionPriceId: string | null;
}

// Module-level cache to prevent duplicate fetches across StrictMode remounts
let subscriptionCache: { userId: string; data: SubscriptionData; timestamp: number } | null = null
const CACHE_TTL = 5000 // 5 seconds

// Module-level flag to prevent duplicate toast notifications across remounts
let hasHandledStripeRedirect = false;

function SubscriptionPageContent() {
  const { user, loading: authLoading, usageInfo, refreshUsage } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  
  // Track if we've already fetched for this user
  const lastFetchedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Handle success/cancel from Stripe
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    // Only handle once per redirect to prevent duplicate toasts
    if (hasHandledStripeRedirect) {
      // Reset flag after URL is cleaned (no params means we've navigated away from stripe callback)
      if (!success && !canceled) {
        hasHandledStripeRedirect = false;
      }
      return;
    }

    if (success === 'true') {
      hasHandledStripeRedirect = true;
      toast.success('Subscription activated! Welcome to Pro 🎉');
      // Clear caches to force refetch after subscription change
      subscriptionCache = null;
      lastFetchedUserIdRef.current = null;
      // Refresh usage info after successful subscription (force = true bypasses cache)
      refreshUsage(true);
      // Clean URL
      router.replace('/subscription');
    } else if (canceled === 'true') {
      hasHandledStripeRedirect = true;
      toast('Checkout canceled', { icon: '↩️' });
      router.replace('/subscription');
    }
  }, [searchParams, router, refreshUsage]);

  useEffect(() => {
    const userId = user?.id;
    
    if (!authLoading && !userId) {
      router.push('/login?redirect=/subscription');
      return;
    }

    // Only fetch if user ID changed
    if (userId && userId !== lastFetchedUserIdRef.current) {
      lastFetchedUserIdRef.current = userId;
      
      // Check module-level cache first (handles StrictMode remounts)
      const now = Date.now()
      if (subscriptionCache && subscriptionCache.userId === userId && subscriptionCache.timestamp > now - CACHE_TTL) {
        setSubscriptionData(subscriptionCache.data);
        setLoading(false);
        return;
      }
      
      // Fetch subscription details from Supabase (usageInfo comes from AuthContext)
      const loadSubscriptionData = async () => {
        try {
          const supabase = createClient();
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('subscriptionStatus, subscriptionCurrentPeriodEnd, subscriptionPriceId')
            .eq('id', userId)
            .single();

          if (profile) {
            subscriptionCache = { userId, data: profile, timestamp: Date.now() };
            setSubscriptionData(profile);
          }
        } catch (error) {
          console.error('Error loading subscription data:', error);
        } finally {
          setLoading(false);
        }
      };
      loadSubscriptionData();
    }
  }, [user?.id, authLoading, router]);

  const handleSubscribe = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      // Use direct payment link for monthly plan
      if (priceId === PRICE_IDS.monthly) {
        window.location.href = 'https://buy.stripe.com/dRm3cvejjfwEe152tN04800';
        return;
      }
      await createCheckoutSession(priceId);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch (error: any) {
      toast.error(error.message || 'Failed to open billing portal');
      setPortalLoading(false);
    }
  };

  // Only wait for auth and subscription data, not usageInfo (which can fail)
  // The page can still function with subscriptionData from Supabase
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  // Derive premium status from either usageInfo or subscriptionData (fallback)
  const isPremium = usageInfo?.isPremium || subscriptionData?.subscriptionStatus === 'active';
  const periodEnd = subscriptionData?.subscriptionCurrentPeriodEnd 
    ? new Date(subscriptionData.subscriptionCurrentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;
  
  // Determine subscription billing interval
  const isYearlySubscription = subscriptionData?.subscriptionPriceId === PRICE_IDS.yearly;
  const subscriptionInterval = subscriptionData?.subscriptionPriceId 
    ? (isYearlySubscription ? 'Yearly' : 'Monthly')
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] lg:w-[800px] h-[200px] sm:h-[300px] lg:h-[400px] bg-purple-600/10 blur-[120px] rounded-full" />
        
        <div className="relative max-w-6xl mx-auto px-3 sm:px-4 py-8 sm:py-12 lg:py-16">
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4 sm:mb-6">
              <Sparkles className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400" />
              <span className="text-xs sm:text-sm font-medium text-purple-300">Upgrade Your Editing</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 px-2">
              Unlock <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Unlimited</span> AI Power
            </h1>
            <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto px-4">
              Get unlimited AI generations, advanced features, and priority support with Pro.
            </p>
          </div>

          {/* Current Usage Card */}
          <div className="max-w-md mx-auto mb-12">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-400">Your AI Usage</h3>
                {isPremium ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                    <Crown className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs font-medium text-purple-300">Pro</span>
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-500 px-2 py-1 rounded-full bg-slate-800">Free</span>
                )}
              </div>
              
              {isPremium ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-white mb-1">Unlimited</div>
                    <p className="text-sm text-slate-400">AI generations available</p>
                  </div>
                  <Zap className="w-10 h-10 text-purple-400" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold text-white">
                      {usageInfo ? `${usageInfo.used} / ${usageInfo.limit}` : '- / -'}
                    </span>
                    <span className="text-sm text-slate-400">
                      {usageInfo && typeof usageInfo.remaining === 'number' ? `${usageInfo.remaining} remaining` : ''}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        usageInfo && usageInfo.used >= (typeof usageInfo.limit === 'number' ? usageInfo.limit : 3)
                          ? 'bg-red-500'
                          : 'bg-gradient-to-r from-purple-500 to-pink-500'
                      }`}
                      style={{ 
                        width: usageInfo ? `${Math.min(100, (usageInfo.used / (typeof usageInfo.limit === 'number' ? usageInfo.limit : 3)) * 100)}%` : '0%'
                      }}
                    />
                  </div>
                  {usageInfo && !usageInfo.canGenerate && (
                    <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Upgrade to continue using AI features</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Billing Toggle */}
          {!isPremium && (
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 sm:mb-8">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                  billingCycle === 'monthly'
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base ${
                  billingCycle === 'yearly'
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                  Save 17%
                </span>
              </button>
            </div>
          )}

          {/* Pricing Cards - Only show when not premium */}
          {!isPremium && (
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
              {/* Free Plan */}
              <div className="bg-slate-900/30 backdrop-blur border border-slate-800 rounded-2xl p-6 relative">
                <h3 className="text-xl font-bold text-white mb-2">{PLANS.free.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white">$0</span>
                  <span className="text-slate-400">/month</span>
                </div>
                
                <ul className="space-y-3 mb-6">
                  {PLANS.free.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-300">
                      <Check className="w-4 h-4 text-slate-500" />
                      {feature}
                    </li>
                  ))}
                  {PLANS.free.limitations.map((limitation, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-500">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      </div>
                      {limitation}
                    </li>
                  ))}
                </ul>

                <button
                  disabled
                  className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 font-medium cursor-not-allowed"
                >
                  Current Plan
                </button>
              </div>

              {/* Pro Plan */}
              <div className="bg-gradient-to-b from-purple-900/30 to-slate-900/50 backdrop-blur border border-purple-500/30 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium rounded-bl-xl">
                  Most Popular
                </div>
                
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  {PLANS.pro.name}
                  <Crown className="w-5 h-5 text-yellow-400" />
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white">
                    ${billingCycle === 'yearly' 
                      ? (PLANS.pro.yearlyPrice / 12).toFixed(2) 
                      : PLANS.pro.monthlyPrice.toFixed(2)}
                  </span>
                  <span className="text-slate-400">/month</span>
                  {billingCycle === 'yearly' && (
                    <span className="ml-2 text-sm text-slate-500 line-through">
                      ${PLANS.pro.monthlyPrice}/mo
                    </span>
                  )}
                </div>
                
                <ul className="space-y-3 mb-6">
                  {PLANS.pro.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-200">
                      <Check className="w-4 h-4 text-purple-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(
                    billingCycle === 'yearly' ? PRICE_IDS.yearly : PRICE_IDS.monthly
                  )}
                  disabled={checkoutLoading !== null}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Upgrade to Pro
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {billingCycle === 'yearly' && (
                  <p className="text-center text-sm text-slate-400 mt-3">
                    Billed annually at ${PLANS.pro.yearlyPrice}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Subscription Management for Pro Users */}
          {isPremium && (
            <div className="max-w-md mx-auto mt-8">
              <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-400" />
                  Subscription Details
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Status</span>
                    <span className="text-green-400 font-medium capitalize">
                      {subscriptionData?.subscriptionStatus || 'Active'}
                    </span>
                  </div>
                  {subscriptionInterval && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Plan</span>
                      <span className="text-white font-medium">
                        {subscriptionInterval} Subscription
                      </span>
                    </div>
                  )}
                  {periodEnd && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Next billing date</span>
                      <span className="text-white">{periodEnd}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="w-full mt-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all flex items-center justify-center gap-2"
                >
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Settings className="w-4 h-4" />
                      Manage Billing & Cancel
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-slate-500 mt-3">
                  Update payment method, change plan, or cancel anytime
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    }>
      <SubscriptionPageContent />
    </Suspense>
  );
}
