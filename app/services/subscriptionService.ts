import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export interface UsageInfo {
  canGenerate: boolean;
  isPremium: boolean;
  used: number;
  limit: number | 'unlimited';
  remaining: number | 'unlimited';
}

export interface SubscriptionInfo {
  status: 'free' | 'active' | 'canceled' | 'past_due';
  currentPeriodEnd?: string;
  priceId?: string;
}

/**
 * Check if user can use AI features
 */
export async function checkAIUsage(): Promise<UsageInfo> {
  const response = await fetch('/api/ai/check-usage');
  
  if (!response.ok) {
    throw new Error('Failed to check AI usage');
  }
  
  return response.json();
}

/**
 * Increment AI usage after a successful generation
 */
export async function incrementAIUsage(
  generationType: string = 'video_analysis',
  metadata?: Record<string, any>
): Promise<{ success: boolean; newCount: number }> {
  const response = await fetch('/api/ai/increment-usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ generationType, metadata }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to increment AI usage');
  }
  
  return response.json();
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(priceId: string): Promise<void> {
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priceId }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }
  
  const { url } = await response.json();
  
  // Redirect to Stripe checkout
  if (url) {
    window.location.href = url;
  }
}

/**
 * Open customer portal for subscription management
 */
export async function openCustomerPortal(): Promise<void> {
  const response = await fetch('/api/stripe/portal', {
    method: 'POST',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to open customer portal');
  }
  
  const { url } = await response.json();
  
  if (url) {
    window.location.href = url;
  }
}

// Price IDs - Update these with your actual Stripe price IDs
export const PRICE_IDS = {
  monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY || 'price_monthly',
  yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY || 'price_yearly',
};

// Storage limits in bytes
export const STORAGE_LIMITS = {
  free: 5 * 1024 * 1024 * 1024, // 5GB
  pro: 100 * 1024 * 1024 * 1024, // 100GB
};

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      '3 AI generations per month',
      'Basic video editing',
      'Export in 720p',
      'Community support',
      '5GB storage',
    ],
    limitations: [
      'Limited AI features',
      'Watermark on exports',
      '720p max resolution',
    ],
  },
  pro: {
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    features: [
      'Unlimited AI generations',
      'Advanced video editing',
      'Export in 1080p Full HD',
      'Priority support',
      'No watermarks',
      '100GB cloud storage',
      'Advanced AI features',
    ],
  },
};

// Export resolution limits
export const EXPORT_RESOLUTIONS = {
  free: '720p',
  pro: '1080p',
} as const;

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get storage limit based on subscription status
 */
export function getStorageLimit(isPremium: boolean): number {
  return isPremium ? STORAGE_LIMITS.pro : STORAGE_LIMITS.free;
}

export interface StorageLimitInfo {
  isPremium: boolean;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usagePercentage: number;
  fileCount: number;
  maxFileSize: number;
}

export interface UploadValidation {
  canUpload: boolean;
  error?: string;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  newTotalAfterUpload?: number;
}

/**
 * Check storage limit from backend (server-side validation)
 */
export async function checkStorageLimit(): Promise<StorageLimitInfo> {
  const response = await fetch('/api/storage/check-limit');
  
  if (!response.ok) {
    throw new Error('Failed to check storage limit');
  }
  
  return response.json();
}

/**
 * Validate if a file can be uploaded (server-side validation)
 */
export async function validateUpload(fileSize: number): Promise<UploadValidation> {
  const response = await fetch('/api/storage/check-limit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileSize }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    return {
      canUpload: false,
      error: data.error || 'Failed to validate upload',
      usedBytes: data.usedBytes || 0,
      limitBytes: data.limitBytes || 0,
      remainingBytes: data.remainingBytes || 0,
    };
  }
  
  return data;
}
