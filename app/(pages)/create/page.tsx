'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { saveProjectToSupabase } from '../../services/projectService';
import { storeProject, useAppDispatch } from '../../store';
import { addProject, setCurrentProject } from '../../store/slices/projectsSlice';
import { ProjectState } from '../../types';
import { toast } from 'react-hot-toast';
import { Loader2, Sparkles, Film, Link as LinkIcon } from 'lucide-react';

function CreateFromLinkContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const dispatch = useAppDispatch();
    const { user, loading: authLoading } = useAuth();
    
    const [status, setStatus] = useState<'initializing' | 'creating' | 'redirecting' | 'error'>('initializing');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasTriggered = useRef(false);
    const redirectingToLogin = useRef(false);
    
    const videoUrl = searchParams.get('url');

    useEffect(() => {
        // Wait for auth to complete loading
        if (authLoading) return;
        
        // Prevent duplicate execution
        if (hasTriggered.current) return;
        
        // Prevent running again after login redirect initiated
        if (redirectingToLogin.current) return;
        
        const createProjectAndRedirect = async () => {
            // Validate URL parameter exists
            if (!videoUrl) {
                setStatus('error');
                setErrorMessage('No video URL provided. Please provide a video URL.');
                return;
            }

            // Check user authentication
            if (!user) {
                // Mark that we're redirecting to login to prevent re-runs
                redirectingToLogin.current = true;
                // Redirect to login with return URL (login page uses 'redirect' param)
                // Use window.location.href for full page navigation to preserve URL encoding
                const currentPath = window.location.pathname + window.location.search;
                window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
                return;
            }

            hasTriggered.current = true;
            setStatus('creating');

            try {
                // Generate project name from URL
                let projectName = 'Video Remix';
                try {
                    const parsedUrl = new URL(videoUrl.includes('://') ? videoUrl : `https://${videoUrl}`);
                    const hostname = parsedUrl.hostname.replace('www.', '');
                    if (hostname.includes('instagram')) {
                        projectName = 'Instagram Remix';
                    }
                } catch {
                    // Keep default name
                }

                // Create new project
                const newProject: ProjectState = {
                    id: crypto.randomUUID(),
                    projectName,
                    createdAt: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    mediaFiles: [],
                    textElements: [],
                    currentTime: 0,
                    isPlaying: false,
                    isMuted: false,
                    duration: 0,
                    activeSection: 'AI',
                    activeElement: 'AI',
                    activeElementIndex: 0,
                    filesID: [],
                    zoomLevel: 1,
                    timelineZoom: 100,
                    enableMarkerTracking: true,
                    resolution: { width: 1080, height: 1920 },
                    fps: 30,
                    aspectRatio: '9:16',
                    history: [],
                    future: [],
                    exportSettings: {
                        resolution: '1080p',
                        quality: 'high',
                        speed: 'fastest',
                        fps: 30,
                        format: 'mp4',
                        includeSubtitles: false,
                    },
                };

                // Save to Supabase
                const savedId = await saveProjectToSupabase(newProject, user.id);
                
                if (!savedId) {
                    throw new Error('Failed to create project in database');
                }

                // Store locally
                await storeProject(newProject);
                dispatch(addProject(newProject));
                dispatch(setCurrentProject(newProject.id));

                setStatus('redirecting');

                // Redirect to project with autoAnalyze parameter
                const encodedUrl = encodeURIComponent(videoUrl);
                router.replace(`/projects/${newProject.id}?autoAnalyze=${encodedUrl}`);

            } catch (error) {
                console.error('Error creating project:', error);
                setStatus('error');
                setErrorMessage(error instanceof Error ? error.message : 'Failed to create project');
                toast.error('Failed to create project');
            }
        };

        createProjectAndRedirect();
    }, [videoUrl, user, authLoading, router, dispatch]);

    // Loading states with beautiful UI
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative z-10 text-center px-6">
                {status === 'error' ? (
                    <div className="bg-slate-900/80 backdrop-blur border border-red-500/30 rounded-2xl p-8 max-w-md mx-auto">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                            <LinkIcon className="w-8 h-8 text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
                        <p className="text-slate-400 mb-6">{errorMessage}</p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                ) : (
                    <div className="bg-slate-900/80 backdrop-blur border border-purple-500/20 rounded-2xl p-8 max-w-md mx-auto">
                        {/* Animated icon */}
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 rounded-full border-2 border-dashed border-purple-500/40 animate-spin" style={{ animationDuration: '8s' }} />
                            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                {status === 'initializing' && <Loader2 className="w-8 h-8 text-white animate-spin" />}
                                {status === 'creating' && <Film className="w-8 h-8 text-white animate-pulse" />}
                                {status === 'redirecting' && <Sparkles className="w-8 h-8 text-white animate-pulse" />}
                            </div>
                        </div>
                        
                        <h2 className="text-xl font-bold text-white mb-2">
                            {status === 'initializing' && 'Preparing...'}
                            {status === 'creating' && 'Creating your project...'}
                            {status === 'redirecting' && 'Almost ready!'}
                        </h2>
                        
                        <p className="text-slate-400 mb-4">
                            {status === 'initializing' && 'Getting things ready'}
                            {status === 'creating' && 'Setting up your workspace'}
                            {status === 'redirecting' && 'Redirecting to editor'}
                        </p>
                        
                        {videoUrl && (
                            <div className="mt-4 p-3 bg-slate-800/50 rounded-xl">
                                <p className="text-xs text-slate-500 mb-1">Video URL</p>
                                <p className="text-sm text-purple-300 truncate">{decodeURIComponent(videoUrl)}</p>
                            </div>
                        )}
                        
                        {/* Progress dots */}
                        <div className="flex justify-center gap-2 mt-6">
                            <div className={`w-2 h-2 rounded-full transition-all ${
                                status === 'initializing' 
                                    ? 'bg-purple-500 animate-pulse' 
                                    : 'bg-purple-500'
                            }`} />
                            <div className={`w-2 h-2 rounded-full transition-all ${
                                status === 'creating' 
                                    ? 'bg-purple-500 animate-pulse' 
                                    : status === 'redirecting' 
                                        ? 'bg-purple-500' 
                                        : 'bg-slate-600'
                            }`} />
                            <div className={`w-2 h-2 rounded-full transition-all ${
                                status === 'redirecting' 
                                    ? 'bg-purple-500 animate-pulse' 
                                    : 'bg-slate-600'
                            }`} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CreateFromLinkPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <CreateFromLinkContent />
        </Suspense>
    );
}
