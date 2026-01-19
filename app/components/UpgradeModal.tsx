'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Crown, Sparkles, X, Zap, ArrowRight } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  usedCount?: number;
  limitCount?: number;
}

export default function UpgradeModal({ 
  isOpen, 
  onClose, 
  usedCount = 3, 
  limitCount = 3 
}: UpgradeModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleUpgrade = () => {
    onClose();
    router.push('/subscription');
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full sm:max-w-md sm:mx-4 bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-800 shadow-2xl shadow-purple-500/10 overflow-hidden safe-bottom">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-purple-500/20 blur-[80px]" />
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative p-6 pt-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center">
                <Crown className="w-4 h-4 text-yellow-900" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              AI Limit Reached
            </h2>
            <p className="text-slate-400">
              You&apos;ve used all {limitCount} free AI generations this month.
            </p>
          </div>

          {/* Usage indicator */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Monthly usage</span>
              <span className="text-sm font-medium text-red-400">{usedCount}/{limitCount} used</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-6">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              Unlock with Pro:
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                'Unlimited AI generations',
                'Advanced video analysis',
                'Priority processing',
                'No watermarks on exports'
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleUpgrade}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
            >
              Upgrade to Pro
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 mt-4">
            Starting at $9.99/month • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

