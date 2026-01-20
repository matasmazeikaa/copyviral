"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getFile, getFileWithFallback, storeProject, storeFile, useAppDispatch, useAppSelector } from "../../../store";
import { getProject } from "../../../store";
import { setCurrentProject, updateProject } from "../../../store/slices/projectsSlice";
import { rehydrate, setMediaFiles, setTextElements, setFilesID, setActiveSection, setIsPlaying } from '../../../store/slices/projectSlice';
import { useRouter, useSearchParams } from 'next/navigation';
import { Timeline } from "../../../components/editor/timeline/Timline";
import { PreviewPlayer } from "../../../components/editor/player/remotion/Player";
import { MediaFile, TextElement } from "@/app/types";
import LeftSidebar from "../../../components/editor/LeftSidebar";
import RightSidebar from "../../../components/editor/RightSidebar";
import VideoLoader from "../../../components/editor/VideoLoader";
import { useAuth } from "../../../contexts/AuthContext";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "../../../store/slices/loadingSlice";
import { loadProjectFromSupabase } from "../../../services/projectService";
import UpgradeModal from "../../../components/UpgradeModal";
import { toast } from 'react-hot-toast';
import { DEFAULT_TEXT_STYLE } from "../../../constants";
import { incrementAIUsage } from "../../../services/subscriptionService";
import { useAIAnalysis } from "../../../contexts/AIAnalysisContext";
import { AIToolsModal, AIToolType } from "../../../components/AIToolsModal";
import { Link, Eye, Brain, Zap, Sparkles, X, Settings, Play, Pause, Menu, Scissors } from 'lucide-react';

// AI Loading Modal Component for auto-analyze - uses portal for true full-page overlay
function AILoadingModal({ isOpen, stage }: { isOpen: boolean; stage: 'downloading' | 'analyzing' | 'processing' }) {
  const [dots, setDots] = useState('');
  const [sparklePositions, setSparklePositions] = useState<{ x: number; y: number; delay: number; scale: number }[]>([]);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    const positions = Array.from({ length: 20 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      scale: 0.5 + Math.random() * 0.5
    }));
    setSparklePositions(positions);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const stages = {
    downloading: { icon: Link, text: 'Downloading video', color: 'from-blue-500 to-cyan-500' },
    analyzing: { icon: Eye, text: 'AI analyzing cuts & timing', color: 'from-purple-500 to-pink-500' },
    processing: { icon: Scissors, text: 'Processing results', color: 'from-pink-500 to-orange-500' }
  };

  const currentStage = stages[stage];
  const StageIcon = currentStage.icon;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center"
      style={{ 
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      {/* Full screen backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/98 backdrop-blur-xl"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-slate-950 to-pink-900/20" />
        
        {/* Floating sparkles */}
        {sparklePositions.map((pos, i) => (
          <div 
            key={i} 
            className="absolute animate-pulse" 
            style={{ 
              left: `${pos.x}%`, 
              top: `${pos.y}%`, 
              animationDelay: `${pos.delay}s`, 
              transform: `scale(${pos.scale})` 
            }}
          >
            <Sparkles className="w-4 h-4 text-purple-500/40" />
          </div>
        ))}
      </div>

      {/* Centered modal card */}
      <div className="relative z-10">
        {/* Outer glow effects */}
        <div className="absolute inset-0 -m-12 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 blur-3xl animate-pulse" />
        <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
        
        <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-slate-700/50 p-10 shadow-2xl shadow-purple-500/30 min-w-[380px]">
          {/* Inner gradient overlay */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 opacity-50" />
          </div>

          <div className="relative flex flex-col items-center z-10">
            {/* Animated icon container */}
            <div className="relative mb-8">
              <div className="absolute inset-0 -m-4 rounded-full border-2 border-dashed border-purple-500/40 animate-spin" style={{ animationDuration: '8s' }} />
              <div className="absolute inset-0 -m-8 rounded-full border border-pink-500/30 animate-spin" style={{ animationDuration: '12s', animationDirection: 'reverse' }} />
              
              <div className={`relative w-24 h-24 rounded-2xl bg-gradient-to-br ${currentStage.color} flex items-center justify-center shadow-xl shadow-purple-500/40`}>
                <StageIcon className="w-12 h-12 text-white animate-pulse" />
                
                {/* Orbiting elements */}
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                  <Sparkles className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 text-yellow-300" />
                </div>
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s', animationDelay: '1s' }}>
                  <Zap className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-300" />
                </div>
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s', animationDelay: '2s' }}>
                  <Brain className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-5 h-5 text-pink-300" />
                </div>
              </div>
            </div>

            {/* Loading text */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-3 flex items-center justify-center gap-2">
                <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {currentStage.text}
                </span>
                <span className="text-purple-400 w-8 text-left">{dots}</span>
              </h3>
              <p className="text-base text-slate-400">Our AI is working its magic ✨</p>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-3 mt-8">
              {Object.keys(stages).map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    s === stage 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 scale-125 animate-pulse shadow-lg shadow-purple-500/50' 
                      : Object.keys(stages).indexOf(stage) > i 
                        ? 'bg-green-500 shadow-lg shadow-green-500/50' 
                        : 'bg-slate-600'
                  }`} />
                  {i < 2 && <div className="w-8 h-px bg-slate-700" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Use createPortal to render at document body level
  if (typeof document !== 'undefined') {
    const { createPortal } = require('react-dom');
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}

interface AnalyzeVideoResult {
  durations: number[];
  textLayers: Array<{
    content?: string;
    start?: number;
    duration?: number;
    verticalPos?: number;
    fontSize?: number;
  }>;
  settings: {
    videoMode?: string;
    videoScale?: number;
  };
}

export default function Project({ params }: { params: { id: string } }) {
    const { id } = params;
    const dispatch = useAppDispatch();
    const projectState = useAppSelector((state) => state.projectState);
    const { currentProjectId } = useAppSelector((state) => state.projects);
    const [isLoading, setIsLoading] = useState(true);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const { currentTime, duration, fps, filesID, textElements, isPlaying } = useAppSelector((state) => state.projectState);
    const { user, usageInfo, canUseAI, refreshUsage } = useAuth();

    const router = useRouter();
    const searchParams = useSearchParams();
    
    // AI Analysis context - for direct triggering from sidebar
    const { 
        isAnalyzing: isContextAnalyzing, 
        loadingStage: contextLoadingStage, 
        pendingUrl,
        setLoadingStage: setContextLoadingStage,
        completeAnalysis,
        startAnalysis
    } = useAIAnalysis();
    
    // Auto-analyze state (for URL param based triggering)
    const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
    const [loadingStage, setLoadingStage] = useState<'downloading' | 'analyzing' | 'processing'>('downloading');
    // Track which URL was analyzed (not just boolean) so user can retry with new URL
    const autoAnalyzeTriggered = useRef<string | null>(null);
    const contextAnalyzeTriggered = useRef<string | null>(null);
    
    // Mobile state management
    const [isMobileLeftOpen, setIsMobileLeftOpen] = useState(false);
    const [isMobileRightOpen, setIsMobileRightOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    
    // AI Tools Modal state (lifted from LeftSidebar for mobile support)
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    
    // Detect mobile on mount and resize
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    
    // Add editor-page class to body for mobile scroll lock (only on editor)
    useEffect(() => {
        document.body.classList.add('editor-page');
        return () => {
            document.body.classList.remove('editor-page');
        };
    }, []);
    
    // Close sidebars when clicking outside on mobile
    const closeMobilePanels = () => {
        setIsMobileLeftOpen(false);
        setIsMobileRightOpen(false);
    };
    
    // Handle AI tool selection from modal
    const handleAIToolSelect = async (tool: AIToolType, url: string) => {
        if (!user) {
            toast.error('You must be logged in to use AI tools');
            return;
        }

        if (!canUseAI) {
            setShowUpgradeModal(true);
            return;
        }

        // Audio beats is coming soon
        if (tool === 'audio-beats') {
            toast('Audio Beat Sync is coming soon! 🎵', { icon: '🚀' });
            return;
        }

        setIsAIModalOpen(false);

        // Use context to trigger analysis directly (no navigation delay)
        startAnalysis(url);
    };
    
    // AI credits info
    const creditsUsed = usageInfo?.used ?? null;
    const creditsLimit = typeof usageInfo?.limit === 'number' ? usageInfo.limit : 3;
    
    // Calculate frame info for status bar
    const currentFrame = Math.round(currentTime * fps);
    const totalFrames = Math.round(duration * fps);
    const formatTime = (seconds: number) => {
        return `${seconds.toFixed(1)}s`;
    };
    // when page is loaded set the project id if it exists
    useEffect(() => {
        const loadProject = async () => {
            if (id) {
                setIsLoading(true);
                // Try to load from IndexedDB first (faster)
                let project = await getProject(id);
                
                // If not found locally and user is authenticated, try Supabase
                if (!project && user) {
                    project = await loadProjectFromSupabase(id, user.id);
                    // If found in Supabase, also save to IndexedDB for faster future access
                    if (project) {
                        await storeProject(project);
                    }
                }
                
                if (project) {
                    dispatch(setCurrentProject(id));
                    setIsLoading(false);
                } else {
                    router.push('/404');
                }
            }
        };
        loadProject();
    }, [id, dispatch, router, user]);

    // set project state from with the current project id
    useEffect(() => {
        const loadProject = async () => {
            if (currentProjectId) {
                // Try to load from IndexedDB first
                let project = await getProject(currentProjectId);
                
                // If not found locally and user is authenticated, try Supabase
                if (!project && user) {
                    project = await loadProjectFromSupabase(currentProjectId, user.id);
                    // If found in Supabase, also save to IndexedDB for faster future access
                    if (project) {
                        await storeProject(project);
                    }
                }
                
                if (project) {
                    dispatch(rehydrate(project));

                    dispatch(setMediaFiles((await Promise.all(
                        project.mediaFiles.map(async (media: MediaFile) => {
                            try {
                                if (media.isPlaceholder) {
                                    return media;
                                }

                                // Skip placeholders or media without fileId
                                if (!media.fileId || media.fileId.trim() === '') {
                                    return null;
                                }

                                // Use fallback mechanism (IndexedDB -> Supabase) for all media types with supabaseFileId
                                let file: File | null = null;
                                
                                if (media.supabaseFileId && user) {
                                    // Check if file exists in IndexedDB first to determine if we need to show loading
                                    const cachedFile = await getFile(media.fileId);
                                    
                                    if (!cachedFile) {
                                        // File not in cache, will download from Supabase - show loading
                                        dispatch(addMediaLoading({ fileId: media.fileId, fileName: media.fileName, type: media.type }));
                                    }
                                    
                                    // Use fallback for media with Supabase file ID
                                    file = await getFileWithFallback(
                                        media.fileId,
                                        media.supabaseFileId,
                                        media.fileName,
                                        user.id,
                                        !cachedFile ? (progress) => {
                                            dispatch(updateMediaProgress({ fileId: media.fileId, progress }));
                                        } : undefined
                                    );
                                    
                                    if (!cachedFile) {
                                        if (file) {
                                            dispatch(completeMediaLoading({ fileId: media.fileId }));
                                        } else {
                                            dispatch(errorMediaLoading({ fileId: media.fileId, error: 'Failed to download from cloud storage' }));
                                        }
                                    }
                                } else {
                                    // For media without Supabase ID, try regular getFile
                                    file = await getFile(media.fileId);
                                }

                                if (!file && !media.isPlaceholder) {
                                    console.warn(`File not found for media ${media.fileName || media.id}`);
                                    return null;
                                }

                                if (!file) {
                                    return null;
                                }

                                return { ...media, src: URL.createObjectURL(file) };
                            } catch (error) {
                                console.error(`Failed to load file for media ${media.fileName || media.id}:`, error);
                                return null;
                            }
                        })
                    )).filter((media): media is MediaFile => media !== null)));
                }
            }
        };
        loadProject();
    }, [dispatch, currentProjectId, user]);


    // save
    useEffect(() => {
        const saveProject = async () => {
            if (!projectState || projectState.id != currentProjectId) return;
            await storeProject(projectState);
            dispatch(updateProject(projectState));
        };
        saveProject();
    }, [projectState, dispatch, currentProjectId]);

    // Auto-analyze handler - useContext flag indicates if triggered from context (sidebar)
    const handleAutoAnalyze = useCallback(async (referenceUrl: string, useContext: boolean = false) => {
        if (!user) {
            toast.error("Please sign in to use AI features");
            if (useContext) completeAnalysis();
            return;
        }

        if (!canUseAI) {
            setShowUpgradeModal(true);
            if (useContext) completeAnalysis();
            return;
        }

        // Set loading state appropriately
        if (useContext) {
            setContextLoadingStage('downloading');
        } else {
            setIsAutoAnalyzing(true);
            setLoadingStage('downloading');
        }
        dispatch(setActiveSection('AI'));

        try {
            // Scrape the video from URL
            const scrapeResponse = await fetch('/api/scrape-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: referenceUrl }),
            });

            if (!scrapeResponse.ok) {
                const errorData = await scrapeResponse.json();
                throw new Error(errorData.error || 'Failed to scrape video');
            }

            const scrapeData = await scrapeResponse.json();

            if (!scrapeData.downloadUrl) {
                throw new Error("No download URL found");
            }

            // Download the video through our proxy to avoid CORS issues on mobile
            const videoResponse = await fetch('/api/scrape-video/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ downloadUrl: scrapeData.downloadUrl }),
            });

            if (!videoResponse.ok) {
                const errorData = await videoResponse.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to download video");
            }

            const blob = await videoResponse.blob();
            const filename = `reference_${Date.now()}.mp4`;
            const file = new File([blob], filename, { type: blob.type || "video/mp4" });

            // Now analyze the video
            if (useContext) {
                setContextLoadingStage('analyzing');
            } else {
                setLoadingStage('analyzing');
            }

            const formData = new FormData();
            formData.append("file", file);

            const analyzeResponse = await fetch("/api/ai/analyze-video", {
                method: "POST",
                body: formData,
            });

            if (!analyzeResponse.ok) {
                const errorData = await analyzeResponse.json();
                throw { message: errorData.error, code: errorData.code };
            }

            const result: AnalyzeVideoResult = await analyzeResponse.json();

            if (useContext) {
                setContextLoadingStage('processing');
            } else {
                setLoadingStage('processing');
            }
            await refreshUsage(true);

            // Store the video file for audio extraction
            const audioFileId = crypto.randomUUID();
            
            dispatch(addMediaLoading({ fileId: audioFileId, fileName: file.name, type: 'video' }));
            
            try {
                await storeFile(file, audioFileId, (progress) => {
                    dispatch(updateMediaProgress({ fileId: audioFileId, progress }));
                });
                dispatch(completeMediaLoading({ fileId: audioFileId }));
            } catch (error: any) {
                dispatch(errorMediaLoading({ fileId: audioFileId, error: error.message || 'Failed to load video' }));
                throw error;
            }
            
            // Update filesID
            const updatedFilesID = [...(filesID || []), audioFileId];
            dispatch(setFilesID(updatedFilesID));

            // Calculate total duration
            const totalDuration = result.durations.reduce((sum, d) => sum + d, 0);

            const CANVAS_WIDTH = 1080;
            const CANVAS_HEIGHT = 1920;
            const placeholderWidth = 1920;
            const placeholderHeight = 1080;
            const x = Math.max(0, (CANVAS_WIDTH - placeholderWidth) / 2);
            const y = Math.max(0, (CANVAS_HEIGHT - placeholderHeight) / 2);

            // Create placeholder media files from durations
            let currentPosition = 0;
            const newPlaceholders: MediaFile[] = result.durations.map((duration, i) => {
                const placeholder: MediaFile = {
                    id: crypto.randomUUID(),
                    fileName: `Slot ${i + 1} (${duration.toFixed(2)}s)`,
                    fileId: "",
                    type: "video",
                    startTime: 0,
                    endTime: duration,
                    positionStart: currentPosition,
                    positionEnd: currentPosition + duration,
                    includeInMerge: true,
                    playbackSpeed: 1,
                    volume: 50,
                    zIndex: 0,
                    x: x,
                    y: y,
                    width: 1080,
                    height: 1080,
                    rotation: 0,
                    opacity: 100,
                    crop: { x: 0, y: 0, width: 1080, height: 1080 },
                    isPlaceholder: true,
                    placeholderType: "video",
                };
                currentPosition += duration;
                return placeholder;
            });

            // Create audio MediaFile from the reference video
            const audioMediaFile: MediaFile = {
                id: crypto.randomUUID(),
                fileName: "Reference Audio",
                fileId: audioFileId,
                type: "audio",
                startTime: 0,
                endTime: totalDuration,
                positionStart: 0,
                positionEnd: totalDuration,
                includeInMerge: true,
                playbackSpeed: 1,
                volume: 50,
                zIndex: 0,
                src: URL.createObjectURL(file),
            };

            const allMediaFiles = [...newPlaceholders, audioMediaFile];
            dispatch(setMediaFiles(allMediaFiles));

            // Create text elements from text layers
            if (result.textLayers.length > 0) {
                const maxZIndex = textElements.length > 0 
                    ? Math.max(...textElements.map(t => t.zIndex ?? 0))
                    : -1;
                
                const importedTextElements: TextElement[] = result.textLayers.map((layer, index) => {
                    const start = layer.start || 0;
                    const duration = layer.duration || 2;

                    return {
                        ...DEFAULT_TEXT_STYLE,
                        id: crypto.randomUUID(),
                        text: layer.content || "",
                        positionStart: start,
                        positionEnd: start + duration,
                        x: 540,
                        y: layer.verticalPos,
                        fontSize: layer.fontSize || DEFAULT_TEXT_STYLE.fontSize || 48,
                        zIndex: maxZIndex + 1 + index,
                    } as TextElement;
                });

                dispatch(setTextElements(importedTextElements));
                toast.success(`Created ${newPlaceholders.length} placeholders, 1 audio track, and ${importedTextElements.length} text layers.`);
            } else {
                toast.success(`Created ${newPlaceholders.length} placeholders and 1 audio track.`);
            }

            // Remove the autoAnalyze param from URL after successful analysis
            router.replace(`/projects/${id}`, { scroll: false });

        } catch (error: any) {
            console.error("Error in auto-analyze:", error);
            
            const isOverloaded = 
                error?.error?.code === 503 ||
                error?.code === 503 ||
                error?.message?.includes("overloaded") ||
                error?.error?.message?.includes("overloaded");
            
            if (isOverloaded) {
                toast.error("The AI model is currently overloaded. Please try again in a few moments.", { duration: 5000 });
            } else {
                toast.error(error?.message || "Failed to analyze video. Please try again.");
            }
        } finally {
            if (useContext) {
                completeAnalysis();
            } else {
                setIsAutoAnalyzing(false);
            }
        }
    }, [user, canUseAI, dispatch, filesID, textElements, refreshUsage, router, id, completeAnalysis, setContextLoadingStage]);

    // Auto-analyze effect - trigger when project is loaded and URL param exists
    useEffect(() => {
        const autoAnalyzeUrl = searchParams.get('autoAnalyze');
        
        // Only trigger if we have a new URL that wasn't already analyzed
        if (autoAnalyzeUrl && !isLoading && currentProjectId === id && autoAnalyzeTriggered.current !== autoAnalyzeUrl) {
            autoAnalyzeTriggered.current = autoAnalyzeUrl;
            const decodedUrl = decodeURIComponent(autoAnalyzeUrl);
            handleAutoAnalyze(decodedUrl, false);
        }
    }, [searchParams, isLoading, currentProjectId, id, handleAutoAnalyze]);

    // Context-based analysis - trigger immediately when pendingUrl is set from sidebar
    useEffect(() => {
        if (pendingUrl && !isLoading && currentProjectId === id && contextAnalyzeTriggered.current !== pendingUrl) {
            contextAnalyzeTriggered.current = pendingUrl;
            handleAutoAnalyze(pendingUrl, true);
        }
    }, [pendingUrl, isLoading, currentProjectId, id, handleAutoAnalyze]);

    return (
        <div className="fixed inset-0 overflow-hidden bg-[#0f172a]">
            <div className="flex flex-col select-none bg-[#0f172a] editor-container">
                {/* Video Loading Progress Bar */}
                <VideoLoader />
                
                {/* Loading screen */}
                {isLoading && (
                    <div className="fixed inset-0 flex items-center bg-black bg-opacity-50 justify-center z-50">
                        <div className="bg-black bg-opacity-70 p-6 rounded-lg flex flex-col items-center">
                            <div className="w-16 h-16 border-4 border-t-white border-r-white border-opacity-30 border-t-opacity-100 rounded-full animate-spin"></div>
                            <p className="mt-4 text-white text-lg">Loading project...</p>
                        </div>
                    </div>
                )}
                
                {/* === MOBILE LAYOUT === */}
                {isMobile ? (
                    <div className="flex flex-col h-full bg-slate-950">
                        {/* Mobile Header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 backdrop-blur border-b border-slate-800 z-30 shrink-0 pt-2">
                            <button
                                onClick={() => router.push('/')}
                                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-semibold text-white truncate max-w-[150px]">
                                    {projectState.projectName || 'Project'}
                                </span>
                            </div>
                            <button
                                onClick={() => setIsMobileRightOpen(true)}
                                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-purple-500/25"
                            >
                                Export
                            </button>
                        </div>
                        
                        {/* Video Preview Area */}
                        <div className="flex-1 flex items-center justify-center bg-[#0a0e1a] min-h-0 relative">
                            <PreviewPlayer isMobile={true} />
                        </div>
                        
                        {/* Playback Controls & Time */}
                        <div className="flex items-center justify-between py-2 px-3 bg-slate-900/95 backdrop-blur border-t border-slate-800 shrink-0">
                            {/* Tools Button */}
                            <button 
                                onClick={() => setIsMobileLeftOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                                <Menu className="w-4 h-4" />
                                <span className="text-xs font-medium">Tools</span>
                            </button>
                            
                            {/* Play Button - Center */}
                            <button 
                                onClick={() => dispatch(setIsPlaying(!isPlaying))}
                                className="w-11 h-11 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white flex items-center justify-center transition-all shadow-lg shadow-purple-500/30 active:scale-95"
                            >
                                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                            </button>
                            
                            {/* Properties Button */}
                            <button 
                                onClick={() => setIsMobileRightOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                                <Settings className="w-4 h-4" />
                                <span className="text-xs font-medium">Props</span>
                            </button>
                        </div>
                        
                        {/* Timeline - Compact version */}
                        <div className="shrink-0 bg-slate-900 border-t border-slate-800 safe-bottom">
                            <Timeline isMobile={true} />
                        </div>
                        
                        {/* Mobile Drawers */}
                        {isMobileLeftOpen && (
                            <>
                                <div 
                                    className="fixed inset-0 mobile-overlay z-40"
                                    onClick={closeMobilePanels}
                                />
                                <div className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] animate-slide-in-left">
                                    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800">
                                        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                                            <span className="text-sm font-semibold text-white">Assets & Tools</span>
                                            <button
                                                onClick={() => setIsMobileLeftOpen(false)}
                                                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <LeftSidebar 
                                                onOpenModal={() => setIsMobileLeftOpen(false)} 
                                                onOpenAIModal={() => setIsAIModalOpen(true)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {isMobileRightOpen && (
                            <>
                                <div 
                                    className="fixed inset-0 mobile-overlay z-40"
                                    onClick={closeMobilePanels}
                                />
                                <div className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[320px] animate-slide-in-right">
                                    <div className="h-full flex flex-col bg-slate-950 border-l border-slate-800">
                                        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                                            <span className="text-sm font-semibold text-white">Properties & Export</span>
                                            <button
                                                onClick={() => setIsMobileRightOpen(false)}
                                                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <RightSidebar />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    /* === DESKTOP LAYOUT === */
                    <>
                        {/* Main Content */}
                        <div className="flex flex-1 overflow-hidden min-h-0">
                            {/* Left Sidebar - Desktop */}
                            <div className="hidden lg:block">
                                <LeftSidebar onOpenAIModal={() => setIsAIModalOpen(true)} />
                            </div>

                            {/* Center - Video Preview */}
                            <div className="flex items-center justify-center flex-col flex-1 overflow-hidden bg-[#0a0e1a] min-w-0">
                                <PreviewPlayer />
                            </div>

                            {/* Right Sidebar - Desktop */}
                            <div className="hidden lg:block">
                                <RightSidebar />
                            </div>
                        </div>

                        {/* Timeline at bottom */}
                        <div className="flex flex-col border-t border-slate-800 bg-[#0f172a] z-10 flex-shrink-0 overflow-visible safe-bottom">
                            <div className="flex-1 flex flex-col min-w-0 overflow-visible">
                                <Timeline />
                            </div>
                        </div>
                    </>
                )}

                {/* Upgrade Modal */}
                <UpgradeModal
                    isOpen={showUpgradeModal}
                    onClose={() => setShowUpgradeModal(false)}
                    usedCount={creditsUsed ?? 0}
                    limitCount={creditsLimit}
                />

                {/* AI Tools Modal */}
                <AIToolsModal
                    isOpen={isAIModalOpen}
                    onClose={() => setIsAIModalOpen(false)}
                    onSelectTool={handleAIToolSelect}
                    currentProject={{
                        projectName: projectState.projectName || 'Current Project',
                        mediaFilesCount: projectState.mediaFiles?.length || 0,
                        textElementsCount: textElements?.length || 0
                    }}
                    isProcessing={isContextAnalyzing}
                />

                {/* AI Loading Modal for auto-analyze (shows for both URL-based and context-based triggers) */}
                <AILoadingModal 
                    isOpen={isAutoAnalyzing || isContextAnalyzing} 
                    stage={isContextAnalyzing ? contextLoadingStage : loadingStage} 
                />
            </div>
        </div>
    );
}
