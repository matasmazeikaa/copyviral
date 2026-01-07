"use client";

import { useAppSelector } from "@/app/store";
import { setMediaFiles, setTextElements, setFilesID } from "@/app/store/slices/projectSlice";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "@/app/store/slices/loadingSlice";
import { MediaFile, TextElement } from "@/app/types";
import { useAppDispatch } from "@/app/store";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, Loader2, Sparkles, Upload } from "lucide-react";
import { analyzeReferenceVideo } from "@/app/services/geminiService";
import { DEFAULT_TEXT_STYLE } from "@/app/constants";
import { storeFile } from "@/app/store";

export default function AITools() {
  const dispatch = useAppDispatch();
  const { filesID, textElements } = useAppSelector((state) => state.projectState);
  const [isImporting, setIsImporting] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");

  const handleImportReferenceVideo = async (file: File) => {
    setIsImporting(true);
    try {
      const result = await analyzeReferenceVideo(file);
      

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

    setIsImporting(true);
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

  return (
    <>
      {/* Reference Upload */}
      <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold text-purple-200">
            AI REFERENCE COPY
          </h3>
        </div>
        <p className="text-[10px] text-slate-500 leading-tight">
          Upload a video or paste a URL (TikTok, Instagram, YouTube) to copy its
          cuts and text pacing automatically.
        </p>

        <label
          className={`w-full py-3 border border-dashed border-slate-700 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all ${
            isImporting
              ? "bg-purple-500/10 cursor-wait"
              : "hover:bg-slate-800 hover:border-purple-500/50"
          }`}
        >
          {isImporting ? (
            <>
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-xs font-bold text-purple-300">
                Analyzing...
              </span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-300">
                Upload Reference
              </span>
            </>
          )}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleReferenceUpload}
            disabled={isImporting}
          />
        </label>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Link className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="Paste TikTok/Instagram/YouTube URL"
              disabled={isImporting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isImporting) {
                  handleUrlImport();
                }
              }}
              className="w-full pl-7 pr-2 py-2 text-xs bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 disabled:opacity-50 disabled:cursor-wait"
            />
          </div>
          <button
            onClick={handleUrlImport}
            disabled={isImporting || !referenceUrl.trim()}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {isImporting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Link className="w-3 h-3" />
            )}
            Import
          </button>
        </div>
      </div>
    </>
  );
}
