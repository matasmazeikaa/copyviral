'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Sparkles, ArrowRight, Film, Wand2 } from 'lucide-react'
import Logo from '@/app/components/Logo'

function LoginPageContent() {
  const { user, loading, signInWithGoogle } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  useEffect(() => {
    if (!loading && user) {
      router.push(redirect)
    }
  }, [user, loading, router, redirect])

  useEffect(() => {
    if (error) {
      const message = errorDescription 
        ? decodeURIComponent(errorDescription)
        : 'Authentication failed. Please try again.'
      toast.error(message, { duration: 5000 })
    }
  }, [error, errorDescription])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle(redirect)
    } catch (error) {
      toast.error('Failed to sign in with Google. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="min-h-screen -mt-16 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] lg:w-[800px] h-[200px] sm:h-[300px] lg:h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[300px] sm:w-[400px] lg:w-[600px] h-[150px] sm:h-[200px] lg:h-[300px] bg-pink-600/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4 sm:mb-6">
            <Logo iconOnly height={56} className="sm:scale-110" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 px-2">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">CopyViral</span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg">Sign in to start creating viral videos</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 backdrop-blur rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium mb-1">Authentication Error</p>
            <p className="text-red-300/80 text-xs">
              {errorDescription 
                ? decodeURIComponent(errorDescription)
                : 'Please check your configuration and try again.'}
            </p>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-xl">
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-3.5 sm:py-4 px-5 sm:px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Features preview */}
          <div className="space-y-2.5 sm:space-y-3 mt-5 sm:mt-6">
            <div className="flex items-center gap-2.5 sm:gap-3 text-slate-400">
              <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Wand2 className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400" />
              </div>
              <span className="text-xs sm:text-sm">AI-powered video analysis</span>
            </div>
            <div className="flex items-center gap-2.5 sm:gap-3 text-slate-400">
              <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Film className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400" />
              </div>
              <span className="text-xs sm:text-sm">Copy viral video styles instantly</span>
            </div>
            <div className="flex items-center gap-2.5 sm:gap-3 text-slate-400">
              <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400" />
              </div>
              <span className="text-xs sm:text-sm">Create trending content effortlessly</span>
            </div>
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-xs sm:text-sm text-slate-500 mt-4 sm:mt-6 px-2">
          By signing in, you agree to our{' '}
          <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}