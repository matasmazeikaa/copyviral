'use client'
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFile, useAppSelector } from "@/app/store";
import { extractConfigs } from "@/app/utils/extractConfigs";
import { mimeToExt } from "@/app/types";
import { toast } from "react-hot-toast";
import FfmpegProgressBar from "./ProgressBar";
import { volumeToLinear } from "@/app/utils/utils";
import { useAuth } from "@/app/contexts/AuthContext";

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

        const renderFunction = async () => {
            const params = extractConfigs(exportSettings);
            
            // Get canvas dimensions from export settings
            const canvasWidth = params.width;
            const canvasHeight = params.height;

            try {
                const filters = [];
                const overlays = [];
                const inputs = [];
                const audioDelays = [];
                
                // Determine if we need watermark (free plan users)
                const needsWatermark = !isPremium;

                // Create base black background with dynamic resolution
                filters.push(`color=c=black:size=${canvasWidth}x${canvasHeight}:d=${totalDuration.toFixed(3)}[base]`);
                // Sort videos by zIndex ascending (lowest drawn first)
                const sortedMediaFiles = [...mediaFiles].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

                for (let i = 0; i < sortedMediaFiles.length; i++) {

                    // timing
                    const { startTime, positionStart, positionEnd } = sortedMediaFiles[i];
                    const duration = positionEnd - positionStart;

                    // get the file data and write to ffmpeg
                    const fileData = await getFile(sortedMediaFiles[i].fileId);
                    const buffer = await fileData.arrayBuffer();
                    const ext = mimeToExt[fileData.type as keyof typeof mimeToExt] || fileData.type.split('/')[1];
                    await ffmpeg.writeFile(`input${i}.${ext}`, new Uint8Array(buffer));

                    // TODO: currently we have to write same file if it's used more than once in different clips the below approach is a good start to change this 
                    // let wroteFiles = new Map<string, string>();
                    // const { fileId, type } = sortedMediaFiles[i];
                    // let inputFilename: string;

                    // if (wroteFiles.has(fileId)) {
                    //     inputFilename = wroteFiles.get(fileId)!;
                    // } else {
                    //     const fileData = await getFile(fileId);
                    //     const buffer = await fileData.arrayBuffer();
                    //     const ext = mimeToExt[fileData.type as keyof typeof mimeToExt] || fileData.type.split('/')[1];
                    //     inputFilename = `input_${fileId}.${ext}`;
                    //     await ffmpeg.writeFile(inputFilename, new Uint8Array(buffer));
                    //     wroteFiles.set(fileId, inputFilename);
                    // }

                    if (sortedMediaFiles[i].type === 'image') {
                        inputs.push('-loop', '1', '-t', duration.toFixed(3), '-i', `input${i}.${ext}`);
                    }
                    else {
                        inputs.push('-i', `input${i}.${ext}`);
                    }

                    const visualLabel = `visual${i}`;
                    const audioLabel = `audio${i}`;
                    
                    // Ensure dimensions are even (required by libx264 encoder)
                    const makeEven = (n: number) => Math.round(n / 2) * 2;
                    const mediaWidth = makeEven(sortedMediaFiles[i].width || 1080);
                    const mediaHeight = makeEven(sortedMediaFiles[i].height || 1920);
                    const aspectRatioFit = sortedMediaFiles[i].aspectRatioFit || 'original';

                    // Calculate opacity filter suffix
                    const alpha = Math.min(Math.max((sortedMediaFiles[i].opacity || 100) / 100, 0), 1);
                    const opacityFilter = `,format=yuva420p,colorchannelmixer=aa=${alpha}`;

                    // Shift clip to correct place on timeline (video)
                    if (sortedMediaFiles[i].type === 'video') {
                        // For "cover" mode: scale to fill container (may crop), then crop to exact size
                        // For other modes: scale to fit within container (maintain aspect ratio), then pad with black
                        // force_divisible_by=2 ensures FFmpeg outputs even dimensions (required by libx264 and yuva420p)
                        let scaleFilter: string;
                        if (aspectRatioFit === 'cover') {
                            // Cover: scale up to fill, then crop to exact container size (centered)
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${mediaWidth}:${mediaHeight}:(iw-${mediaWidth})/2:(ih-${mediaHeight})/2`;
                        } else {
                            // Contain: scale to fit within container, pad with black to fill remaining space
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
                        }
                        filters.push(
                            `[${i}:v]trim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},${scaleFilter},setpts=PTS-STARTPTS+${positionStart.toFixed(3)}/TB${opacityFilter}[${visualLabel}]`
                        );
                    }
                    if (sortedMediaFiles[i].type === 'image') {
                        // force_divisible_by=2 ensures FFmpeg outputs even dimensions (required by libx264 and yuva420p)
                        let scaleFilter: string;
                        if (aspectRatioFit === 'cover') {
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${mediaWidth}:${mediaHeight}:(iw-${mediaWidth})/2:(ih-${mediaHeight})/2`;
                        } else {
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
                        }
                        filters.push(
                            `[${i}:v]${scaleFilter},setpts=PTS+${positionStart.toFixed(3)}/TB${opacityFilter}[${visualLabel}]`
                        );
                    }

                    // Store overlay range that matches shifted time
                    if (sortedMediaFiles[i].type === 'video' || sortedMediaFiles[i].type === 'image') {
                        overlays.push({
                            label: visualLabel,
                            x: sortedMediaFiles[i].x,
                            y: sortedMediaFiles[i].y,
                            start: positionStart.toFixed(3),
                            end: positionEnd.toFixed(3),
                        });
                    }

                    // Audio: trim, then delay (in ms)
                    if (sortedMediaFiles[i].type === 'audio' || sortedMediaFiles[i].type === 'video') {
                        const delayMs = Math.round(positionStart * 1000);
                        const volume = volumeToLinear(sortedMediaFiles[i].volume ?? 50);
                        filters.push(
                            `[${i}:a]atrim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${volume.toFixed(4)}[${audioLabel}]`
                        );
                        audioDelays.push(`[${audioLabel}]`);
                    }
                }

                // Apply overlays in z-index order
                let lastLabel = 'base';
                if (overlays.length > 0) {
                    for (let i = 0; i < overlays.length; i++) {
                        const { label, start, end, x, y } = overlays[i];
                        // Only use final label for final overlay if there are no text elements after
                        const isLastOverlay = i === overlays.length - 1;
                        const isFinalOutput = isLastOverlay && textElements.length === 0;
                        // Use 'preWatermark' if watermark needed, else 'outv'
                        const nextLabel = isFinalOutput 
                            ? (needsWatermark ? 'preWatermark' : 'outv') 
                            : `tmp${i}`;
                        filters.push(
                            `[${lastLabel}][${label}]overlay=${x}:${y}:enable='between(t\\,${start}\\,${end})'[${nextLabel}]`
                        );
                        lastLabel = nextLabel;
                    }
                }

                // If no visual overlays were added, prepare for text or create final output
                if (overlays.length === 0) {
                    if (textElements.length === 0) {
                        // No content, just base - apply watermark if needed
                        filters.push(`[base]copy[${needsWatermark ? 'preWatermark' : 'outv'}]`);
                        lastLabel = needsWatermark ? 'preWatermark' : 'outv';
                    } else {
                        // Text will be applied, use base as starting point
                        lastLabel = 'base';
                    }
                }

                // Apply text 
                if (textElements.length > 0) {
                    // Available fonts in public/fonts directory
                    const availableFonts = ['Arial', 'Inter', 'Lato', 'OpenSans', 'Roboto'];
                    const fallbackFont = 'Arial';
                    
                    // Collect unique fonts from textElements
                    const usedFonts = new Set<string>();
                    textElements.forEach(text => {
                        const font = text.font || fallbackFont;
                        // Use fallback if font doesn't exist
                        const fontToUse = availableFonts.includes(font) ? font : fallbackFont;
                        usedFonts.add(fontToUse);
                    });
                    
                    // Always ensure fallback font is in the list (also needed for watermark)
                    usedFonts.add(fallbackFont);
                    // Add Inter for watermark if needed
                    if (needsWatermark) {
                        usedFonts.add('Inter');
                    }
                    
                    // Load only fonts that are actually used
                    const loadedFonts = new Set<string>();
                    for (const font of Array.from(usedFonts)) {
                        try {
                            const res = await fetch(`/fonts/${font}.ttf`);
                            if (!res.ok) {
                                console.warn(`Font ${font} not found (${res.status}), will try fallback`);
                                continue;
                            }
                            const fontBuf = await res.arrayBuffer();
                            console.log(`Loading font ${font}, size: ${fontBuf.byteLength} bytes`);
                            await ffmpeg.writeFile(`font${font}.ttf`, new Uint8Array(fontBuf));
                            loadedFonts.add(font);
                        } catch (err) {
                            console.warn(`Failed to load font ${font}:`, err);
                        }
                    }
                    console.log('Loaded fonts:', Array.from(loadedFonts));
                    
                    // Ensure at least one font is loaded
                    if (loadedFonts.size === 0) {
                        throw new Error('Failed to load any fonts for text rendering. Please check that font files exist in /public/fonts/');
                    }
                    
                    // Apply text - write each text to a file to avoid escaping issues
                    for (let i = 0; i < textElements.length; i++) {
                        const text = textElements[i];
                        
                        // Use fallback font if the requested font wasn't successfully loaded
                        const requestedFont = text.font || fallbackFont;
                        // Check against loadedFonts (actually loaded) not availableFonts (potentially available)
                        const fontToUse = loadedFonts.has(requestedFont) ? requestedFont : 
                                          (loadedFonts.has(fallbackFont) ? fallbackFont : Array.from(loadedFonts)[0]);
                        
                        const alpha = Math.min(Math.max((text.opacity ?? 100) / 100, 0), 1);
                        // Escape # in color for FFmpeg filter (use 0x prefix instead)
                        let colorValue = text.color || 'white';
                        if (colorValue.startsWith('#')) {
                            colorValue = '0x' + colorValue.slice(1);
                        }
                        const color = colorValue.includes('@') ? colorValue : `${colorValue}@${alpha}`;
                        const fontSize = text.fontSize || 24;
                        const align = text.align || 'center';
                        
                        // Split text into lines
                        const textLines = text.text.split('\n');
                        const lineSpacing = Math.round(fontSize * 1.2);
                        
                        // Render each line separately for better control
                        for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
                            const line = textLines[lineIndex];
                            if (!line.trim() && lineIndex > 0) continue; // Skip empty lines except first
                            
                            // Normalize text - strip emojis and special characters that fonts can't render
                            const normalizedLine = line
                                // Normalize smart quotes
                                .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")
                                .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
                                // Normalize dashes
                                .replace(/[\u2013\u2014\u2212]/g, '-')
                                // Normalize ellipsis
                                .replace(/\u2026/g, '...')
                                // Remove emojis and other non-renderable characters
                                // Keep only basic Latin, Latin-1 Supplement, and common punctuation
                                .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '');
                            
                            // Write text to a file to avoid complex escaping
                            const textFileName = `text_${i}_${lineIndex}.txt`;
                            await ffmpeg.writeFile(textFileName, normalizedLine);
                            
                            // Calculate y position for this line
                            const lineY = text.y + (lineIndex * lineSpacing);
                            
                            // Calculate x position based on alignment
                            let xExpression: string;
                            if (align === 'center') {
                                xExpression = `${text.x}-text_w/2`;
                            } else if (align === 'right') {
                                xExpression = `${text.x}-text_w`;
                            } else {
                                xExpression = `${text.x}`;
                            }
                            
                            // Determine label: last line of last text element gets 'preWatermark' if watermark needed, else 'outv'
                            const isLastTextElement = i === textElements.length - 1;
                            const isLastLine = lineIndex === textLines.length - 1;
                            const label = (isLastTextElement && isLastLine) 
                                ? (needsWatermark ? 'preWatermark' : 'outv') 
                                : `text${i}_line${lineIndex}`;
                            
                            // Build drawtext filter using textfile instead of text
                            const drawtextFilter = `[${lastLabel}]drawtext=fontfile=font${fontToUse}.ttf:textfile=${textFileName}:x=${xExpression}:y=${lineY}:fontsize=${fontSize}:fontcolor=${color}:enable='between(t\\,${text.positionStart}\\,${text.positionEnd})'[${label}]`;
                            
                            filters.push(drawtextFilter);
                            lastLabel = label;
                        }
                    }
                }

                // Add watermark for free plan users
                if (needsWatermark) {
                    // Load Inter font for watermark if not already loaded (no text elements case)
                    if (textElements.length === 0) {
                        try {
                            const res = await fetch('/fonts/Inter.ttf');
                            if (res.ok) {
                                const fontBuf = await res.arrayBuffer();
                                await ffmpeg.writeFile('fontInter.ttf', new Uint8Array(fontBuf));
                            }
                        } catch (err) {
                            console.warn('Failed to load Inter font for watermark:', err);
                        }
                    }
                    
                    // Scale watermark size based on canvas resolution
                    const watermarkFontSize = Math.round(canvasWidth * 0.052); // ~5.2% of width for bigger text
                    const iconFontSize = Math.round(watermarkFontSize * 0.85);
                    const watermarkPaddingX = Math.round(canvasWidth * 0.04);
                    const watermarkPaddingY = Math.round(canvasHeight * 0.032);
                    const shadowOffset = Math.max(2, Math.round(watermarkFontSize * 0.07));
                    const iconGap = Math.round(watermarkFontSize * 0.35);
                    
                    // Watermark text with lightning bolt prefix
                    // Using Unicode lightning bolt (⚡) - falls back gracefully if font doesn't support it
                    await ffmpeg.writeFile('watermark.txt', 'CopyViral');
                    
                    // Lightning bolt icon character
                    await ffmpeg.writeFile('bolt.txt', String.fromCodePoint(0x26A1));
                    
                    // First draw the main text - bigger, bolder watermark
                    // Position in bottom-right corner with padding
                    const watermarkFilter = `[preWatermark]drawtext=fontfile=fontInter.ttf:textfile=watermark.txt:x=w-text_w-${watermarkPaddingX}:y=h-text_h-${watermarkPaddingY}:fontsize=${watermarkFontSize}:fontcolor=0xFFFFFF@0.9:shadowcolor=0x000000@0.65:shadowx=${shadowOffset}:shadowy=${shadowOffset}[withText]`;
                    filters.push(watermarkFilter);
                    
                    // Then draw the lightning bolt icon to the left of the text (golden/yellow color)
                    const boltX = `w-text_w-${watermarkPaddingX}-${iconGap}`;
                    const boltFilter = `[withText]drawtext=fontfile=fontInter.ttf:textfile=bolt.txt:x=${boltX}:y=h-text_h-${watermarkPaddingY}:fontsize=${iconFontSize}:fontcolor=0xFFD700@0.95:shadowcolor=0x000000@0.5:shadowx=${shadowOffset}:shadowy=${shadowOffset}[outv]`;
                    filters.push(boltFilter);
                }

                // Mix all audio tracks
                if (audioDelays.length > 0) {
                    const audioMix = audioDelays.join('');
                    filters.push(`${audioMix}amix=inputs=${audioDelays.length}:normalize=0[outa]`);
                }

                // Final filter_complex
                const complexFilter = filters.join('; ');
                const ffmpegArgs = [
                    ...inputs,
                    '-filter_complex', complexFilter,
                    '-map', '[outv]',
                ];

                if (audioDelays.length > 0) {
                    ffmpegArgs.push('-map', '[outa]');
                }

                ffmpegArgs.push(
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',  // Convert from yuva420p to yuv420p for browser compatibility
                    '-c:a', 'aac',
                    '-preset', params.preset,
                    '-crf', params.crf.toString(),
                    '-t', totalDuration.toFixed(3),
                    'output.mp4'
                );

                console.log('FFmpeg args:', ffmpegArgs);
                console.log('Filter complex:', complexFilter);
                
                const exitCode = await ffmpeg.exec(ffmpegArgs);
                
                if (exitCode !== 0) {
                    console.error('FFmpeg filter_complex:', complexFilter);
                    console.error('FFmpeg logs:', logMessages);
                    throw new Error(`FFmpeg exited with code ${exitCode}. See FFmpeg logs above.`);
                }

            } catch (err) {
                console.error('FFmpeg processing error:', err);
                throw err;
            }

            // return the output url
            let outputData;
            try {
                outputData = await ffmpeg.readFile('output.mp4');
            } catch (readErr) {
                throw new Error('Output file not created. FFmpeg may have failed - check console for details.');
            }
            const outputBlob = new Blob([outputData as Uint8Array], { type: 'video/mp4' });
            const outputUrl = URL.createObjectURL(outputBlob);
            return outputUrl;
        };

        // Run the function and handle the result/error
        try {
            const outputUrl = await renderFunction();
            setPreviewUrl(outputUrl);
            setLoaded(true);
            setIsRendering(false);
            toast.success('Video rendered successfully');
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