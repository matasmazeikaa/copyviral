'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { checkAIUsage, UsageInfo } from '../services/subscriptionService'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: (redirectTo?: string) => Promise<void>
  signOut: () => Promise<void>
  // Subscription related
  usageInfo: UsageInfo | null
  isPremium: boolean
  canUseAI: boolean
  refreshUsage: (force?: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Module-level cache to prevent duplicate fetches across StrictMode remounts
let usageCache: { userId: string; data: UsageInfo; timestamp: number } | null = null
const CACHE_TTL = 5000 // 5 seconds

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  
  // Track user ID to prevent duplicate fetches on object reference changes
  const lastUserIdRef = useRef<string | null>(null)
  const isFetchingRef = useRef(false)

  const refreshUsage = useCallback(async (force = false) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) return
    
    // Check module-level cache (handles StrictMode remounts)
    const now = Date.now()
    if (!force && usageCache && usageCache.timestamp > now - CACHE_TTL) {
      setUsageInfo(usageCache.data)
      return
    }
    
    try {
      isFetchingRef.current = true
      const usage = await checkAIUsage()
      usageCache = { userId: user?.id || '', data: usage, timestamp: now }
      setUsageInfo(usage)
    } catch (error) {
      console.error('Error fetching usage info:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [user?.id]) // Include user?.id for cache key

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // Fetch usage info only when user ID actually changes
  useEffect(() => {
    const currentUserId = user?.id ?? null
    
    // Only fetch if user ID actually changed
    if (currentUserId === lastUserIdRef.current) return
    lastUserIdRef.current = currentUserId
    
    if (currentUserId) {
      refreshUsage()
    } else {
      setUsageInfo(null)
    }
  }, [user?.id, refreshUsage])

  const signInWithGoogle = async (redirectTo?: string) => {
    const redirectUrl = redirectTo || '/'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectUrl)}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      },
    })
    if (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      throw error
    }
    // Clear caches
    usageCache = null
    setUsageInfo(null)
    router.push('/login')
  }

  const isPremium = usageInfo?.isPremium || false
  const canUseAI = usageInfo?.canGenerate ?? true // Default to true if not loaded yet

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signInWithGoogle, 
      signOut,
      usageInfo,
      isPremium,
      canUseAI,
      refreshUsage
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
