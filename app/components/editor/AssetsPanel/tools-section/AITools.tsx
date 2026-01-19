"use client";

import { useAppSelector } from "@/app/store";
import { setMediaFiles, setTextElements, setFilesID } from "@/app/store/slices/projectSlice";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "@/app/store/slices/loadingSlice";
import { MediaFile, TextElement } from "@/app/types";
import { useAppDispatch } from "@/app/store";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Link, Loader2, Sparkles, Upload, Crown, Lock, Wand2, Brain, Zap, Eye, Scissors, Type } from "lucide-react";
import { DEFAULT_TEXT_STYLE } from "@/app/constants";
import { storeFile } from "@/app/store";
import { useAuth } from "@/app/contexts/AuthContext";
import { incrementAIUsage } from "@/app/services/subscriptionService";
import UpgradeModal from "@/app/components/UpgradeModal";

// AI Loading Modal Component
function AILoadingModal({ isOpen, stage }: { isOpen: boolean; stage: 'downloading' | 'analyzing' | 'processing' }) {
  const [dots, setDots] = useState('');
  const [sparklePositions, setSparklePositions] = useState<{ x: number; y: number; delay: number; scale: number }[]>([]);
  
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    // Generate random sparkle positions
    const positions = Array.from({ length: 20 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      scale: 0.5 + Math.random() * 0.5
    }));
    setSparklePositions(positions);
  }, []);

  if (!isOpen) return null;

  const stages = {
    downloading: { icon: Link, text: 'Downloading video', color: 'from-blue-500 to-cyan-500' },
    analyzing: { icon: Eye, text: 'AI analyzing cuts & timing', color: 'from-purple-500 to-pink-500' },
    processing: { icon: Scissors, text: 'Processing results', color: 'from-pink-500 to-orange-500' }
  };

  const currentStage = stages[stage];
  const StageIcon = currentStage.icon;

  return (
    <div 
      className="fixed z-[9999] flex items-center justify-center w-full h-full"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0
      }}
    >
      {/* Full screen animated backdrop */}
      <div 
        className="absolute bg-slate-950/95 backdrop-blur-md"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%'
        }}
      >
        {/* Floating particles */}
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
            <Sparkles className="w-3 h-3 text-purple-500/30" />
          </div>
        ))}
      </div>

      {/* Modal content */}
      <div className="relative z-10">
        {/* Outer glow rings - static, not spinning */}
        <div className="absolute inset-0 -m-8 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl animate-pulse" />
        <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
        
        <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-slate-700/50 p-8 shadow-2xl shadow-purple-500/20 min-w-[320px]">
          {/* Static border glow - no spinning */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-blue-500/30 opacity-50" />
          </div>

          {/* Content */}
          <div className="relative flex flex-col items-center z-10">
            {/* Animated icon container */}
            <div className="relative mb-6">
              {/* Rotating ring */}
              <div className="absolute inset-0 -m-3 rounded-full border-2 border-dashed border-purple-500/30 animate-spin" style={{ animationDuration: '8s' }} />
              <div className="absolute inset-0 -m-6 rounded-full border border-pink-500/20 animate-spin" style={{ animationDuration: '12s', animationDirection: 'reverse' }} />
              
              {/* Main icon */}
              <div className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br ${currentStage.color} flex items-center justify-center shadow-lg`}>
                <StageIcon className="w-10 h-10 text-white animate-pulse" />
                
                {/* Orbiting sparkles */}
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                  <Sparkles className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-yellow-300" />
                </div>
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s', animationDelay: '1s' }}>
                  <Zap className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300" />
                </div>
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s', animationDelay: '2s' }}>
                  <Brain className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 text-pink-300" />
                </div>
              </div>
            </div>

            {/* Loading text */}
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {currentStage.text}
                </span>
                <span className="text-purple-400 w-6 text-left">{dots}</span>
              </h3>
              <p className="text-sm text-slate-400">
                Our AI is working its magic ✨
              </p>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-2 mt-6">
              {Object.keys(stages).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    s === stage 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 scale-125 animate-pulse' 
                      : Object.keys(stages).indexOf(stage) > i 
                        ? 'bg-green-500' 
                        : 'bg-slate-600'
                  }`} />
                  {i < 2 && <div className="w-6 h-px bg-slate-700" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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

export default function AITools() {
  const dispatch = useAppDispatch();
  const { filesID, textElements } = useAppSelector((state) => state.projectState);
  const { user, usageInfo, canUseAI, isPremium, refreshUsage } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'downloading' | 'analyzing' | 'processing'>('downloading');
  const [referenceUrl, setReferenceUrl] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleImportReferenceVideo = async (file: File) => {
    // Check if user is logged in
    if (!user) {
      toast.error("Please sign in to use AI features");
      return;
    }

    // Check AI usage limits
    if (!canUseAI) {
      setShowUpgradeModal(true);
      return;
    }

    setIsImporting(true);
    setLoadingStage('analyzing');
    try {
      // Call the API route to analyze the video
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ai/analyze-video", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw { message: errorData.error, code: errorData.code };
      }

      const result: AnalyzeVideoResult = await response.json();
      
      setLoadingStage('processing');
      
      // Increment AI usage after successful generation
      await incrementAIUsage('video_analysis', { fileName: file.name });
      await refreshUsage(true); // Force refresh to get updated usage count

      // Store the video file for audio extraction
      const audioFileId = crypto.randomUUID();
      
      // Track loading for the reference video
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
      
      // Update filesID to include the audio file
      const updatedFilesID = [...(filesID || []), audioFileId];
      dispatch(setFilesID(updatedFilesID));

      // Calculate total duration
      const totalDuration = result.durations.reduce((sum, d) => sum + d, 0);

      const CANVAS_WIDTH = 1080;
      const CANVAS_HEIGHT = 1920;
      
      // Placeholder dimensions
      const placeholderWidth = 1920;
      const placeholderHeight = 1080;
      
      // Center the placeholder
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
          volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
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
        volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
        zIndex: 0,
        src: URL.createObjectURL(file),
      };

      // Combine placeholders and audio
      const allMediaFiles = [...newPlaceholders, audioMediaFile];
      dispatch(setMediaFiles(allMediaFiles));

      // Create text elements from text layers
      if (result.textLayers.length > 0) {
        // Get the highest z-index from existing text elements, or default to -1
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
            zIndex: maxZIndex + 1 + index, // Assign incrementing z-index values
          } as TextElement;
        });

        dispatch(setTextElements(importedTextElements));
        toast.success(`Imported ${newPlaceholders.length} placeholders, 1 audio track, and ${importedTextElements.length} text layers.`);
      } else {
        toast.success(`Imported ${newPlaceholders.length} placeholders and 1 audio track.`);
      }
    } catch (error: any) {
      console.error("Error importing reference video:", error);
      
      // Check if it's a 503 error (model overloaded)
      const isOverloaded = 
        error?.error?.code === 503 ||
        error?.code === 503 ||
        error?.message?.includes("overloaded") ||
        error?.error?.message?.includes("overloaded");
      
      if (isOverloaded) {
        toast.error("The AI model is currently overloaded. Please try again in a few moments.", {
          duration: 5000,
        });
      } else {
        toast.error("Failed to analyze reference video. Please try again.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleReferenceUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files[0]) {
      await handleImportReferenceVideo(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleUrlImport = async () => {
    if (!referenceUrl.trim()) return;

    // Check if user is logged in
    if (!user) {
      toast.error("Please sign in to use AI features");
      return;
    }

    // Check AI usage limits
    if (!canUseAI) {
      setShowUpgradeModal(true);
      return;
    }

    setIsImporting(true);
    setLoadingStage('downloading');
    try {
      // Call API route to scrape the video
      const response = await fetch('/api/scrape-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: referenceUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scrape video');
      }

      const data = await response.json();

      if (!data.downloadUrl) {
        throw new Error("No download URL found");
      }

      // Download the video
      const videoResponse = await fetch(data.downloadUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!videoResponse.ok) {
        throw new Error("Failed to download video");
      }

      const blob = await videoResponse.blob();

      // Convert blob to File
      const filename = `reference_${Date.now()}.mp4`;
      const file = new File([blob], filename, {
        type: blob.type || "video/mp4",
      });

      // Import the reference
      await handleImportReferenceVideo(file);

      // Clear the URL input
      setReferenceUrl("");
    } catch (error) {
      console.error("Error importing from URL:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to import video from URL"
      );
    } finally {
      setIsImporting(false);
    }
  };

  // Calculate usage display
  const usedCount = usageInfo?.used || 0;
  const limitCount = typeof usageInfo?.limit === 'number' ? usageInfo.limit : 3;

  return (
    <>
      {/* AI Reference Copy - Magical Container */}
      <div 
        className="relative group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Animated gradient border */}
        <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-xl opacity-60 blur-[2px] group-hover:opacity-100 transition-opacity duration-500" 
          style={{ 
            backgroundSize: '200% 200%',
            animation: 'gradient-x 3s ease infinite'
          }} 
        />
        
        {/* Inner container */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/50 rounded-xl p-4 space-y-3 overflow-hidden">
          {/* Background sparkle effects */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-2 right-4 transition-all duration-700 ${isHovered ? 'opacity-100 scale-100' : 'opacity-40 scale-90'}`}>
              <Sparkles className="w-3 h-3 text-purple-400/60 animate-pulse" />
            </div>
            <div className={`absolute top-8 right-12 transition-all duration-700 delay-100 ${isHovered ? 'opacity-100 scale-100' : 'opacity-30 scale-90'}`}>
              <Sparkles className="w-2 h-2 text-pink-400/50 animate-pulse" style={{ animationDelay: '0.5s' }} />
            </div>
            <div className={`absolute bottom-12 left-4 transition-all duration-700 delay-200 ${isHovered ? 'opacity-100 scale-100' : 'opacity-20 scale-90'}`}>
              <Zap className="w-2 h-2 text-cyan-400/40 animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
            {/* Gradient orb */}
            <div className={`absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl transition-all duration-700 ${isHovered ? 'opacity-80 scale-110' : 'opacity-40'}`} />
          </div>

          {/* Header */}
          <div className="relative flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <Wand2 className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
                  AI REFERENCE COPY
                </h3>
                <p className="text-[9px] text-purple-400/70 font-medium">Magic video analysis</p>
              </div>
            </div>
            {isPremium ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-400/30 shadow-lg shadow-purple-500/10">
                <Crown className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] font-bold text-purple-200">Pro</span>
              </span>
            ) : user && (
              <span className="text-[10px] text-slate-400 bg-slate-800/50 px-2 py-1 rounded-full">
                {usedCount}/{limitCount} used
              </span>
            )}
          </div>

          {/* Description with feature pills */}
          <div className="relative">
            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
              Transform any viral video into your template. Our AI extracts timing, cuts, and text positions automatically.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { icon: Scissors, label: 'Cut Detection', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
                { icon: Type, label: 'Text Timing', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
                { icon: Eye, label: 'Visual Analysis', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
              ].map(({ icon: Icon, label, color }) => (
                <span key={label} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${color}`}>
                  <Icon className="w-2.5 h-2.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Usage warning for free users */}
          {user && !isPremium && !canUseAI && (
            <div className="relative flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Lock className="w-3 h-3 text-amber-400" />
              </div>
              <div className="flex-1">
                <span className="text-[11px] text-amber-200 font-medium">Magic limit reached</span>
                <button 
                  onClick={() => setShowUpgradeModal(true)}
                  className="ml-2 text-[11px] text-amber-400 hover:text-amber-300 font-bold underline underline-offset-2"
                >
                  Unlock unlimited →
                </button>
              </div>
            </div>
          )}

          {/* URL Input Section */}
          <div className="relative space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative group/input">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500/50 to-pink-500/50 rounded-lg opacity-0 group-focus-within/input:opacity-100 blur-sm transition-opacity" />
                <div className="relative flex items-center">
                  <Link className="absolute left-3 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="Paste Instagram URL"
                    disabled={isImporting || (!canUseAI && !!user)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isImporting && canUseAI) {
                        handleUrlImport();
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-900/80 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:bg-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <button
                onClick={handleUrlImport}
                disabled={isImporting || !referenceUrl.trim() || (!canUseAI && !!user)}
                className="relative px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Analyze
              </button>
            </div>

            {/* Supported platforms */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="text-[9px] text-slate-500">Works with:</span>
              <span className="text-[9px] text-slate-400 font-medium">Instagram</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Loading Modal */}
      <AILoadingModal isOpen={isImporting} stage={loadingStage} />

      {/* Upgrade Modal */}
      <UpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        usedCount={usedCount}
        limitCount={limitCount}
      />
    </>
  );
}
