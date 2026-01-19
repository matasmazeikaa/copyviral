"use client";

import { useAppSelector, useAppDispatch } from "@/app/store";
import { clearCompletedMedia } from "@/app/store/slices/loadingSlice";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Video, Image as ImageIcon, Music, Sparkles, Cloud, HardDrive } from "lucide-react";

// Friendly tips to show while loading
const LOADING_TIPS = [
    "Tip: You can select multiple files from the library at once!",
    "Tip: Drag clips on the timeline to rearrange them",
    "Tip: Use keyboard shortcuts for faster editing",
    "Tip: Higher quality videos take a bit longer to prepare",
    "Fun fact: Your media is stored securely in the cloud",
];

export default function VideoLoader() {
    const { media, isActive } = useAppSelector((state) => state.loading);
    const dispatch = useAppDispatch();
    const [currentTip, setCurrentTip] = useState(0);

    // Rotate tips every 4 seconds
    useEffect(() => {
        if (!isActive) return;
        const interval = setInterval(() => {
            setCurrentTip((prev) => (prev + 1) % LOADING_TIPS.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [isActive]);

    // Calculate overall progress
    const overallProgress = useMemo(() => {
        if (media.length === 0) return 0;
        const totalProgress = media.reduce((sum, item) => sum + item.progress, 0);
        return Math.round(totalProgress / media.length);
    }, [media]);

    // Auto-clear completed media after 1.5 seconds when not active
    useEffect(() => {
        if (!isActive && media.length > 0) {
            const timer = setTimeout(() => {
                dispatch(clearCompletedMedia());
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isActive, media.length, dispatch]);

    // Show overlay whenever there are media files - this prevents blinking when isActive toggles
    const shouldShow = media.length > 0;

    const loadingMedia = media.filter(m => m.status === 'loading');
    const completedMedia = media.filter(m => m.status === 'completed');
    const errorMedia = media.filter(m => m.status === 'error');

    // Get icon for media type
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'video': return <Video className="w-4 h-4" />;
            case 'image': return <ImageIcon className="w-4 h-4" />;
            case 'audio': return <Music className="w-4 h-4" />;
            default: return <Video className="w-4 h-4" />;
        }
    };

    // Get user-friendly phase message
    const getPhaseMessage = (progress: number) => {
        if (progress < 8) return { text: 'Connecting...', icon: <Cloud className="w-3 h-3 animate-pulse" /> };
        if (progress < 48) return { text: 'Downloading from cloud', icon: <Cloud className="w-3 h-3 animate-bounce" /> };
        if (progress < 85) return { text: 'Preparing for editing', icon: <HardDrive className="w-3 h-3 animate-pulse" /> };
        return { text: 'Almost ready!', icon: <Sparkles className="w-3 h-3 animate-pulse" /> };
    };

    // Get main status message
    const getStatusMessage = () => {
        if (loadingMedia.length === 0 && completedMedia.length > 0) {
            return completedMedia.length === 1 
                ? "Your file is ready!" 
                : `All ${completedMedia.length} files are ready!`;
        }
        if (loadingMedia.length === 1) {
            return "Preparing your media for editing...";
        }
        return `Preparing ${loadingMedia.length} files for editing...`;
    };

    return (
        <div 
            className={`fixed inset-0 z-[9999] bg-[#0a0e1a]/95 backdrop-blur-md flex items-center justify-center transition-all duration-300 ${
                shouldShow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            style={{ 
                WebkitBackdropFilter: 'blur(12px)',
            }}
        >
            {/* Animated background gradient */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse" />
            </div>

            <div className="relative w-full max-w-xl mx-4">
                <div className="bg-gradient-to-b from-slate-900/90 to-[#0f172a] border border-slate-700/50 rounded-2xl shadow-2xl shadow-purple-500/10 overflow-hidden">
                    {/* Animated top border */}
                    <div className="h-1 bg-slate-800 overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
                            style={{ width: `${overallProgress}%` }}
                        />
                    </div>
                    
                    <div className="p-8 space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                    {isActive ? (
                                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="w-7 h-7 text-white" />
                                    )}
                                </div>
                                {isActive && (
                                    <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-50 blur animate-pulse" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white mb-1">
                                    {isActive ? "Adding to Your Project" : "All Done!"}
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {getStatusMessage()}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                    {overallProgress}%
                                </span>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="relative">
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-300 ease-out relative"
                                    style={{ width: `${overallProgress}%` }}
                                >
                                    {/* Shimmer effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-progress-shimmer" />
                                </div>
                            </div>
                        </div>

                        {/* Individual Media Progress - Compact view */}
                        {media.length > 1 && (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                                {media.map((item) => {
                                    const phase = item.status === 'loading' 
                                        ? getPhaseMessage(item.progress)
                                        : item.status === 'completed' 
                                        ? { text: 'Ready', icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" /> }
                                        : { text: 'Failed', icon: <AlertCircle className="w-3 h-3 text-red-400" /> };
                                    
                                    return (
                                        <div 
                                            key={item.fileId} 
                                            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                                                item.status === 'completed' 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20' 
                                                    : item.status === 'error'
                                                    ? 'bg-red-500/10 border border-red-500/20'
                                                    : 'bg-slate-800/50 border border-slate-700/50'
                                            }`}
                                        >
                                            {/* Type icon */}
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                item.status === 'completed'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : item.status === 'error'
                                                    ? 'bg-red-500/20 text-red-400'
                                                    : 'bg-slate-700 text-slate-400'
                                            }`}>
                                                {getTypeIcon(item.type)}
                                            </div>
                                            
                                            {/* File info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-200 truncate font-medium" title={item.fileName}>
                                                    {item.fileName}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {phase.icon}
                                                    <span className="text-xs text-slate-500">{phase.text}</span>
                                                </div>
                                            </div>
                                            
                                            {/* Progress indicator */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                {item.status === 'loading' && (
                                                    <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                                                            style={{ width: `${item.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                                <span className={`text-xs font-mono w-10 text-right ${
                                                    item.status === 'completed' 
                                                        ? 'text-emerald-400' 
                                                        : item.status === 'error'
                                                        ? 'text-red-400'
                                                        : 'text-slate-400'
                                                }`}>
                                                    {item.status === 'loading' 
                                                        ? `${Math.round(item.progress)}%`
                                                        : item.status === 'completed'
                                                        ? '✓'
                                                        : '✗'
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Single file - more detailed view */}
                        {media.length === 1 && (
                            <div className={`p-4 rounded-xl ${
                                media[0].status === 'completed' 
                                    ? 'bg-emerald-500/10 border border-emerald-500/20' 
                                    : media[0].status === 'error'
                                    ? 'bg-red-500/10 border border-red-500/20'
                                    : 'bg-slate-800/30 border border-slate-700/50'
                            }`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        media[0].status === 'completed'
                                            ? 'bg-emerald-500/20 text-emerald-400'
                                            : media[0].status === 'error'
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400'
                                    }`}>
                                        {getTypeIcon(media[0].type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base text-white font-medium truncate" title={media[0].fileName}>
                                            {media[0].fileName}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {media[0].status === 'loading' && (
                                                <>
                                                    {getPhaseMessage(media[0].progress).icon}
                                                    <span className="text-sm text-slate-400">
                                                        {getPhaseMessage(media[0].progress).text}
                                                    </span>
                                                </>
                                            )}
                                            {media[0].status === 'completed' && (
                                                <>
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                    <span className="text-sm text-emerald-400">Ready to use!</span>
                                                </>
                                            )}
                                            {media[0].status === 'error' && (
                                                <>
                                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                                    <span className="text-sm text-red-400">{media[0].error || 'Something went wrong'}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tip - only show when loading */}
                        {isActive && (
                            <div className="flex items-start gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                                <Sparkles className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {LOADING_TIPS[currentTip]}
                                </p>
                            </div>
                        )}

                        {/* Status Summary - Compact */}
                        {!isActive && (completedMedia.length > 0 || errorMedia.length > 0) && (
                            <div className="flex items-center justify-center gap-6 pt-2">
                                {completedMedia.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        <span className="text-slate-300">
                                            {completedMedia.length} ready
                                        </span>
                                    </div>
                                )}
                                {errorMedia.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <AlertCircle className="w-4 h-4 text-red-400" />
                                        <span className="text-slate-300">
                                            {errorMedia.length} failed
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}

