"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AIAnalysisContextType {
    isAnalyzing: boolean;
    loadingStage: 'downloading' | 'analyzing' | 'processing';
    pendingUrl: string | null;
    startAnalysis: (url: string) => void;
    setLoadingStage: (stage: 'downloading' | 'analyzing' | 'processing') => void;
    completeAnalysis: () => void;
}

const AIAnalysisContext = createContext<AIAnalysisContextType | null>(null);

export function AIAnalysisProvider({ children }: { children: ReactNode }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [loadingStage, setLoadingStage] = useState<'downloading' | 'analyzing' | 'processing'>('downloading');
    const [pendingUrl, setPendingUrl] = useState<string | null>(null);

    const startAnalysis = useCallback((url: string) => {
        setPendingUrl(url);
        setIsAnalyzing(true);
        setLoadingStage('downloading');
    }, []);

    const completeAnalysis = useCallback(() => {
        setIsAnalyzing(false);
        setPendingUrl(null);
    }, []);

    return (
        <AIAnalysisContext.Provider value={{
            isAnalyzing,
            loadingStage,
            pendingUrl,
            startAnalysis,
            setLoadingStage,
            completeAnalysis,
        }}>
            {children}
        </AIAnalysisContext.Provider>
    );
}

export function useAIAnalysis() {
    const context = useContext(AIAnalysisContext);
    if (!context) {
        throw new Error('useAIAnalysis must be used within an AIAnalysisProvider');
    }
    return context;
}
