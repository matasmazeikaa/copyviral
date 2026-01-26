'use client'
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFile, useAppSelector } from "@/app/store";
import { toast } from "react-hot-toast";
import FfmpegProgressBar from "./ProgressBar";
import { useAuth } from "@/app/contexts/AuthContext";
import { renderVideo, cleanupFfmpegFiles } from "@/app/utils/ffmpegRenderUtils";

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

interface FileUploaderProps {
    loadFunction: () => Promise<void>;
    loadFfmpeg: boolean;
    ffmpeg: FFmpeg;
    logMessages: string;
}
export default function FfmpegRender({ loadFunction, loadFfmpeg, ffmpeg, logMessages }: FileUploaderProps) {
    const { mediaFiles, projectName, exportSettings, duration, textElements } = useAppSelector(state => state.projectState);
    const { isPremium } = useAuth();
    const totalDuration = duration;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    
    // Mount check for portal
    useEffect(() => {
        setMounted(true);
    }, []);

    // Cycle through render messages
    useEffect(() => {
        if (!isRendering) return;
        const interval = setInterval(() => {
            setCurrentMessageIndex((prev) => (prev + 1) % RENDER_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [isRendering]);

    useEffect(() => {
        if (loaded && videoRef.current && previewUrl) {
            videoRef.current.src = previewUrl;
        }
    }, [loaded, previewUrl]);

    const hasPlaceholderMediaFiles = mediaFiles.some(file => file.isPlaceholder);

    const handleCloseModal = async () => {
        setShowModal(false);
        setIsRendering(false);
        setRenderError(null);
        try {
            ffmpeg.terminate();
            await loadFunction();
        } catch (e) {
            console.error("Failed to reset FFmpeg:", e);
        }
    };

    const render = async () => {
        if (mediaFiles.length === 0 && textElements.length === 0) {
            console.log('No media files to render');
            return;
        }
        setShowModal(true);
        setIsRendering(true);
        setRenderError(null);

        try {
            const result = await renderVideo(ffmpeg, {
                mediaFiles,
                textElements,
                exportSettings,
                totalDuration,
                isPremium: isPremium || false,
                getFile: async (fileId: string) => {
                    return await getFile(fileId);
                },
            });

            if (result.success && result.outputUrl) {
                setPreviewUrl(result.outputUrl);
                setLoaded(true);
                setIsRendering(false);
                toast.success('Video rendered successfully');
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error("Failed to render video:", err);
            setRenderError(errorMessage);
            setIsRendering(false);
        }
    };

    const isRenderDisabled = useMemo(() => {
        return !loadFfmpeg || isRendering || mediaFiles.length === 0 || hasPlaceholderMediaFiles;
    }, [loadFfmpeg, isRendering, mediaFiles, hasPlaceholderMediaFiles]);

    return (
        <>
            {/* Render Button */}
            <button
                onClick={() => render()}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    isRenderDisabled 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                }`}
                disabled={isRenderDisabled}
            >
                {isRendering ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                )}
                <span>{isRendering ? 'Creating...' : 'Create Viral Clip'}</span>
            </button>

            {/* Render Modal - rendered via portal for proper mobile fullscreen */}
            {showModal && mounted && createPortal(
                <div 
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center"
                    style={{ zIndex: 99999 }}
                >
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 w-[calc(100%-32px)] max-w-xl max-h-[calc(100vh-32px)] overflow-y-auto relative m-4">
                        {/* Background gradient effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-pink-900/10 pointer-events-none" />
                        
                        <div className="relative">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white">
                                        {renderError ? 'Render Failed' : isRendering ? 'Rendering Video' : 'Export Complete'}
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {renderError ? 'Something went wrong during rendering' : isRendering ? 'Please wait while your video is being processed' : 'Your video is ready to download'}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCloseModal}
                                    className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all duration-200 flex items-center justify-center"
                                    aria-label="Close"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {renderError ? (
                                <div className="space-y-6">
                                    {/* Error icon */}
                                    <div className="flex flex-col items-center justify-center py-4">
                                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <p className="text-center text-slate-300">
                                            Something went wrong while rendering your video.
                                        </p>
                                    </div>
                                    
                                    {/* FFmpeg logs */}
                                    {logMessages && (
                                        <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto">
                                            <p className="text-xs font-medium text-slate-400 mb-2">FFmpeg Log:</p>
                                            <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{logMessages}</pre>
                                        </div>
                                    )}
                                    
                                    {/* Action buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => window.location.reload()}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/25"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Refresh Page
                                        </button>
                                        <button
                                            onClick={handleCloseModal}
                                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-medium transition-all"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            ) : isRendering ? (
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
                                            
                                            {/* Orbiting icons */}
                                            <div className="absolute inset-0 animate-[spin_8s_linear_infinite]">
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2m0 2a2 2 0 012 2m-2-2a2 2 0 00-2 2m2 0v10m0-10a2 2 0 012 2v10M7 16a2 2 0 01-2-2m0 0V6m2 10h10a2 2 0 002-2V6a2 2 0 00-2-2H9" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="absolute inset-0 animate-[spin_8s_linear_infinite_reverse]">
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
                                                <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="absolute inset-0 animate-[spin_6s_linear_infinite_reverse]">
                                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Animated status message */}
                                        <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/50 border border-slate-700 rounded-xl transition-all duration-500">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'rocket' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'layers' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'type' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'sparkles' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'music' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'fire' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'film' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'zap' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'target' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <circle cx="12" cy="12" r="10" strokeWidth={2} />
                                                        <circle cx="12" cy="12" r="6" strokeWidth={2} />
                                                        <circle cx="12" cy="12" r="2" strokeWidth={2} />
                                                    </svg>
                                                )}
                                                {RENDER_MESSAGES[currentMessageIndex].icon === 'brush' && (
                                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-sm font-medium text-white animate-pulse">
                                                {RENDER_MESSAGES[currentMessageIndex].text}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Progress bar */}
                                    <FfmpegProgressBar ffmpeg={ffmpeg} />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Video preview */}
                                    {previewUrl && (
                                        <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                                            <video src={previewUrl} controls className="w-full aspect-video object-contain" />
                                        </div>
                                    )}
                                    
                                    {/* Success message */}
                                    <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-green-300">Video rendered successfully!</p>
                                            <p className="text-xs text-green-400/70">Click below to download your video</p>
                                        </div>
                                    </div>
                                    
                                    {/* Action buttons */}
                                    <div className="flex gap-3">
                                        <a
                                            href={previewUrl || '#'}
                                            download={`${projectName}.mp4`}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/25"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Download Video
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </>
    )
}
