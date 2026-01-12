'use client'
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { useEffect, useMemo, useRef, useState } from "react";
import { getFile, useAppSelector } from "@/app/store";
import { Heart } from "lucide-react";
import { extractConfigs } from "@/app/utils/extractConfigs";
import { mimeToExt } from "@/app/types";
import { toast } from "react-hot-toast";
import FfmpegProgressBar from "./ProgressBar";

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
    const totalDuration = duration;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

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

        const renderFunction = async () => {
            const params = extractConfigs(exportSettings);

            try {
                const filters = [];
                const overlays = [];
                const inputs = [];
                const audioDelays = [];

                // Create base black background
                filters.push(`color=c=black:size=1080x1920:d=${totalDuration.toFixed(3)}[base]`);
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
                    
                    const mediaWidth = Math.round(sortedMediaFiles[i].width || 1080);
                    const mediaHeight = Math.round(sortedMediaFiles[i].height || 1920);
                    const aspectRatioFit = sortedMediaFiles[i].aspectRatioFit || 'original';

                    // Shift clip to correct place on timeline (video)
                    if (sortedMediaFiles[i].type === 'video') {
                        // For "cover" mode: scale to fill container (may crop), then crop to exact size
                        // For other modes: scale to fit within container (maintain aspect ratio), then pad with black
                        let scaleFilter: string;
                        if (aspectRatioFit === 'cover') {
                            // Cover: scale up to fill, then crop to exact container size
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase,crop=${mediaWidth}:${mediaHeight}`;
                        } else {
                            // Contain: scale to fit within container, pad with black to fill remaining space
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
                        }
                        filters.push(
                            `[${i}:v]trim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},${scaleFilter},setpts=PTS-STARTPTS+${positionStart.toFixed(3)}/TB[${visualLabel}]`
                        );
                    }
                    if (sortedMediaFiles[i].type === 'image') {
                        let scaleFilter: string;
                        if (aspectRatioFit === 'cover') {
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase,crop=${mediaWidth}:${mediaHeight}`;
                        } else {
                            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
                        }
                        filters.push(
                            `[${i}:v]${scaleFilter},setpts=PTS+${positionStart.toFixed(3)}/TB[${visualLabel}]`
                        );
                    }

                    // Apply opacity
                    if (sortedMediaFiles[i].type === 'video' || sortedMediaFiles[i].type === 'image') {
                        const alpha = Math.min(Math.max((sortedMediaFiles[i].opacity || 100) / 100, 0), 1);
                        filters.push(
                            `[${visualLabel}]format=yuva420p,colorchannelmixer=aa=${alpha}[${visualLabel}]`
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
                        const volume = sortedMediaFiles[i].volume !== undefined ? sortedMediaFiles[i].volume / 100 : 1;
                        filters.push(
                            `[${i}:a]atrim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${volume}[${audioLabel}]`
                        );
                        audioDelays.push(`[${audioLabel}]`);
                    }
                }

                // Apply overlays in z-index order
                let lastLabel = 'base';
                if (overlays.length > 0) {
                    for (let i = 0; i < overlays.length; i++) {
                        const { label, start, end, x, y } = overlays[i];
                        const nextLabel = i === overlays.length - 1 ? 'outv' : `tmp${i}`;
                        filters.push(
                            `[${lastLabel}][${label}]overlay=${x}:${y}:enable='between(t\\,${start}\\,${end})'[${nextLabel}]`
                        );
                        lastLabel = nextLabel;
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
                    
                    // Load only fonts that are actually used
                    for (const font of Array.from(usedFonts)) {
                        try {
                            const res = await fetch(`/fonts/${font}.ttf`);
                            if (!res.ok) {
                                console.warn(`Font ${font} not found, using fallback ${fallbackFont}`);
                                continue;
                            }
                            const fontBuf = await res.arrayBuffer();
                            await ffmpeg.writeFile(`font${font}.ttf`, new Uint8Array(fontBuf));
                        } catch (err) {
                            console.warn(`Failed to load font ${font}:`, err);
                        }
                    }
                    
                    // Apply text
                    for (let i = 0; i < textElements.length; i++) {
                        const text = textElements[i];
                        
                        // Use fallback font if the requested font doesn't exist
                        const requestedFont = text.font || fallbackFont;
                        const fontToUse = availableFonts.includes(requestedFont) ? requestedFont : fallbackFont;
                        
                        const alpha = Math.min(Math.max((text.opacity ?? 100) / 100, 0), 1);
                        const color = text.color?.includes('@') ? text.color : `${text.color || 'white'}@${alpha}`;
                        const fontSize = text.fontSize || 24;
                        const align = text.align || 'center';
                        
                        // Split text into lines
                        const textLines = text.text.split('\n');
                        const lineSpacing = Math.round(fontSize * 1.2);
                        
                        // Render each line separately for better control
                        for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
                            const line = textLines[lineIndex];
                            if (!line.trim() && lineIndex > 0) continue; // Skip empty lines except first
                            
                            // Escape text for FFmpeg drawtext (single quotes, escape single quotes and backslashes)
                            let escapedLine = line
                                .replace(/\\/g, '\\\\')     // Escape backslashes first
                                .replace(/'/g, "\\'")       // Escape single quotes
                                .replace(/:/g, '\\:');      // Escape colons
                            
                            escapedLine = `'${escapedLine}'`;
                            
                            // Calculate y position for this line
                            const lineY = text.y + (lineIndex * lineSpacing);
                            
                            // Calculate x position based on alignment
                            // For center: x position minus half the text width
                            // For right: x position minus full text width  
                            // For left: x position as-is
                            let xExpression: string;
                            if (align === 'center') {
                                xExpression = `${text.x}-text_w/2`;
                            } else if (align === 'right') {
                                xExpression = `${text.x}-text_w`;
                            } else {
                                xExpression = `${text.x}`;
                            }
                            
                            // Determine label: last line of last text element gets 'outv', others get intermediate labels
                            const isLastTextElement = i === textElements.length - 1;
                            const isLastLine = lineIndex === textLines.length - 1;
                            const label = (isLastTextElement && isLastLine) ? 'outv' : `text${i}_line${lineIndex}`;
                            
                            // Build drawtext filter for this line
                            const drawtextFilter = `[${lastLabel}]drawtext=fontfile=font${fontToUse}.ttf:text=${escapedLine}:x=${xExpression}:y=${lineY}:fontsize=${fontSize}:fontcolor=${color}:enable='between(t\\,${text.positionStart}\\,${text.positionEnd})'[${label}]`;
                            
                            filters.push(drawtextFilter);
                            lastLabel = label;
                        }
                    }
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
                    '-c:a', 'aac',
                    '-preset', params.preset,
                    '-crf', params.crf.toString(),
                    '-t', totalDuration.toFixed(3),
                    'output.mp4'
                );

                await ffmpeg.exec(ffmpegArgs);

            } catch (err) {
                console.error('FFmpeg processing error:', err);
            }

            // return the output url
            const outputData = await ffmpeg.readFile('output.mp4');
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
            toast.error('Failed to render video');
            console.error("Failed to render video:", err);
        }
    };

    const isRenderDisabled = useMemo(() => {
        return !loadFfmpeg || isRendering || mediaFiles.length === 0 || hasPlaceholderMediaFiles;
    }, [loadFfmpeg, isRendering, mediaFiles, hasPlaceholderMediaFiles]);

    console.log(loadFfmpeg, isRendering, mediaFiles.length, hasPlaceholderMediaFiles)

    console.log(isRenderDisabled)

    return (
        <>
            {/* Render Button */}
            <button
                onClick={() => render()}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    isRenderDisabled 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                }`}
                disabled={isRenderDisabled}
            >
                {(!loadFfmpeg || isRendering) ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                )}
                <span>{loadFfmpeg ? (isRendering ? 'Rendering...' : 'Render') : 'Loading FFmpeg...'}</span>
            </button>

            {/* Render Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-w-xl w-full relative overflow-hidden">
                        {/* Background gradient effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-pink-900/10 pointer-events-none" />
                        
                        <div className="relative">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white">
                                        {isRendering ? 'Rendering Video' : 'Export Complete'}
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {isRendering ? 'Please wait while your video is being processed' : 'Your video is ready to download'}
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

                            {isRendering ? (
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
                                        <a
                                            href="https://github.com/sponsors/mohyware"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-pink-400 border border-slate-700 hover:border-pink-500/30 rounded-xl font-medium transition-all"
                                        >
                                            <Heart size={18} className="text-pink-400" />
                                            <span className="hidden sm:inline">Sponsor</span>
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </>
    )
}