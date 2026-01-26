'use client'

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppSelector } from "@/app/store";
import { useCloudRender } from "@/app/hooks/useCloudRender";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { StartRenderRequest } from "@/app/types/render";
import { 
    Loader2, 
    Cloud, 
    CheckCircle2, 
    AlertCircle, 
    Download, 
    ExternalLink,
    Sparkles,
    X,
    Video
} from "lucide-react";

const RENDER_MESSAGES = [
    { text: "Making it viral...", icon: "rocket" },
    { text: "Combining clips...", icon: "layers" },
    { text: "Assembling text...", icon: "type" },
    { text: "Applying magic...", icon: "sparkles" },
    { text: "Mixing audio...", icon: "music" },
    { text: "Adding the sauce...", icon: "fire" },
    { text: "Encoding frames...", icon: "film" },
    { text: "Optimizing quality...", icon: "zap" },
    { text: "Almost there...", icon: "target" },
    { text: "Polishing pixels...", icon: "brush" },
];

export default function GenerateVideoButton() {
    const { mediaFiles, textElements, exportSettings, duration, resolution, fps, projectName } = useAppSelector(state => state.projectState);
    const { user } = useAuth();
    
    const [showModal, setShowModal] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    const {
        startRender,
        isSubmitting,
        activeJobs,
        completedJobs,
        failedJobs,
        overallProgress,
    } = useCloudRender({
        onComplete: () => {
            toast.success('Video rendered successfully!');
        },
        onError: (_, error) => {
            toast.error(`Render failed: ${error}`);
        },
    });
    
    // Get the latest completed/failed job
    const latestCompletedJob = completedJobs.length > 0 ? completedJobs[completedJobs.length - 1] : null;
    const latestFailedJob = failedJobs.length > 0 ? failedJobs[failedJobs.length - 1] : null;
    
    // Cycle through render messages when rendering
    const isRendering = activeJobs.length > 0;
    useEffect(() => {
        if (!isRendering) return;
        const interval = setInterval(() => {
            setCurrentMessageIndex((prev) => (prev + 1) % RENDER_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [isRendering]);
    
    const hasPlaceholderMediaFiles = mediaFiles.some(file => file.isPlaceholder);
    const hasContent = mediaFiles.length > 0 || textElements.length > 0;
    
    const isRenderDisabled = useMemo(() => {
        return isSubmitting || isRendering || !hasContent || hasPlaceholderMediaFiles || !user;
    }, [isSubmitting, isRendering, hasContent, hasPlaceholderMediaFiles, user]);
    
    const handleRender = async () => {
        if (!user) {
            toast.error('Please sign in to render videos');
            return;
        }
        
        if (!hasContent) {
            toast.error('No content to render');
            return;
        }
        
        if (hasPlaceholderMediaFiles) {
            toast.error('Please fill all placeholder slots before rendering');
            return;
        }
        
        setShowModal(true);
        setCurrentMessageIndex(0);
        
        const request: StartRenderRequest = {
            mediaFiles,
            textElements,
            exportSettings,
            totalDuration: duration,
            resolution,
            fps,
            projectName,
        };
        
        await startRender(request);
    };
    
    const handleCloseModal = () => {
        setShowModal(false);
    };
    
    const handleDownload = async () => {
        if (!latestCompletedJob?.downloadUrl) return;
        
        try {
            const response = await fetch(latestCompletedJob.downloadUrl);
            if (!response.ok) throw new Error('Failed to fetch video');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName || 'video'}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (error) {
            console.error('Download error:', error);
            window.open(latestCompletedJob.downloadUrl, '_blank');
        }
    };
    
    // Render status in modal
    const renderStatus = () => {
        if (latestFailedJob && !isRendering && !latestCompletedJob) {
            return (
                <div className="space-y-6">
                    {/* Error icon */}
                    <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                            <AlertCircle className="w-8 h-8 text-red-400" />
                        </div>
                        <p className="text-center text-slate-300">
                            Something went wrong while rendering your video.
                        </p>
                        {latestFailedJob.errorMessage && (
                            <p className="text-center text-red-400 text-sm mt-2">
                                {latestFailedJob.errorMessage}
                            </p>
                        )}
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleRender}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/25"
                        >
                            <Cloud className="w-5 h-5" />
                            Try Again
                        </button>
                        <button
                            onClick={handleCloseModal}
                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-medium transition-all"
                        >
                            Close
                        </button>
                    </div>
                </div>
            );
        }
        
        if (latestCompletedJob && !isRendering) {
            return (
                <div className="space-y-6">
                    {/* Success preview */}
                    {latestCompletedJob.downloadUrl && (
                        <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                            <video 
                                src={latestCompletedJob.downloadUrl} 
                                controls 
                                className="w-full aspect-video object-contain" 
                            />
                        </div>
                    )}
                    
                    {/* Success message */}
                    <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-green-300">Video rendered successfully!</p>
                            <p className="text-xs text-green-400/70">Your video is ready to download</p>
                        </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleDownload}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/25"
                        >
                            <Download className="w-5 h-5" />
                            Download Video
                        </button>
                        <a
                            href="/videos"
                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-medium transition-all inline-flex items-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            All Videos
                        </a>
                    </div>
                </div>
            );
        }
        
        // Rendering in progress
        return (
            <div className="space-y-6">
                {/* Animated scene */}
                <div className="flex flex-col items-center justify-center py-6">
                    {/* Floating icons animation */}
                    <div className="relative w-32 h-32 mb-4">
                        {/* Center spinner */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-20 h-20 rounded-full border-4 border-slate-800"></div>
                            <div className="absolute w-20 h-20 rounded-full border-4 border-transparent border-t-purple-500 border-r-pink-500 animate-spin"></div>
                        </div>
                        
                        {/* Cloud icon in center */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Cloud className="w-8 h-8 text-purple-400 animate-pulse" />
                        </div>
                        
                        {/* Orbiting elements */}
                        <div className="absolute inset-0 animate-[spin_8s_linear_infinite]">
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <Video className="w-4 h-4 text-purple-400" />
                            </div>
                        </div>
                        <div className="absolute inset-0 animate-[spin_8s_linear_infinite_reverse]">
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-pink-400" />
                            </div>
                        </div>
                    </div>
                    
                    {/* Animated status message */}
                    <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/50 border border-slate-700 rounded-xl transition-all duration-500">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        </div>
                        <span className="text-sm font-medium text-white animate-pulse">
                            {RENDER_MESSAGES[currentMessageIndex].text}
                        </span>
                    </div>
                </div>
                
                {/* Progress bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                        <span>Rendering in cloud...</span>
                        <span>{overallProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative"
                            style={{ width: `${overallProgress}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                        Cloud rendering is faster and more reliable than browser rendering
                    </p>
                </div>
            </div>
        );
    };
    
    return (
        <>
            {/* Render Button */}
            <button
                onClick={handleRender}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    isRenderDisabled 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                }`}
                disabled={isRenderDisabled}
            >
                {isSubmitting || isRendering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Cloud className="w-4 h-4" />
                )}
                <span>{isSubmitting || isRendering ? 'Rendering...' : 'Create Viral Clip'}</span>
            </button>

            {/* Render Modal */}
            {showModal && mounted && createPortal(
                <div 
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center"
                    style={{ zIndex: 99999 }}
                >
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 w-[calc(100%-32px)] max-w-xl max-h-[calc(100vh-32px)] overflow-y-auto relative m-4">
                        {/* Background gradient effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-pink-900/10 pointer-events-none rounded-2xl" />
                        
                        <div className="relative">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Cloud className="w-5 h-5 text-purple-400" />
                                        {latestFailedJob && !isRendering && !latestCompletedJob 
                                            ? 'Render Failed' 
                                            : isRendering 
                                                ? 'Cloud Rendering' 
                                                : 'Export Complete'
                                        }
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {latestFailedJob && !isRendering && !latestCompletedJob 
                                            ? 'Something went wrong during rendering' 
                                            : isRendering 
                                                ? 'Your video is being processed in the cloud' 
                                                : 'Your video is ready to download'
                                        }
                                    </p>
                                </div>
                                <button
                                    onClick={handleCloseModal}
                                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all duration-200 flex items-center justify-center"
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            {renderStatus()}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
