import { FFmpeg } from "@ffmpeg/ffmpeg";
import { MediaFile, TextElement, ExportConfig, mimeToExt } from "@/app/types";
import { extractConfigs } from "@/app/utils/extractConfigs";
import { volumeToLinear } from "@/app/utils/utils";

export interface RenderOptions {
    mediaFiles: MediaFile[];
    textElements: TextElement[];
    exportSettings: ExportConfig;
    totalDuration: number;
    isPremium: boolean;
    getFile: (fileId: string) => Promise<File>;
    onProgress?: (progress: number) => void;
}

export interface RenderResult {
    success: boolean;
    outputUrl?: string;
    error?: string;
}

/**
 * Render a video using FFmpeg with the given media files and text elements
 */
export async function renderVideo(
    ffmpeg: FFmpeg,
    options: RenderOptions
): Promise<RenderResult> {
    const {
        mediaFiles,
        textElements,
        exportSettings,
        totalDuration,
        isPremium,
        getFile,
        onProgress
    } = options;

    if (mediaFiles.length === 0 && textElements.length === 0) {
        return { success: false, error: 'No media files to render' };
    }

    const params = extractConfigs(exportSettings);
    const canvasWidth = params.width;
    const canvasHeight = params.height;

    try {
        const filters: string[] = [];
        const overlays: { label: string; x: number | undefined; y: number | undefined; start: string; end: string }[] = [];
        const inputs: string[] = [];
        const audioDelays: string[] = [];
        
        const needsWatermark = !isPremium;

        // Create base black background with dynamic resolution
        filters.push(`color=c=black:size=${canvasWidth}x${canvasHeight}:d=${totalDuration.toFixed(3)}[base]`);
        
        // Sort videos by zIndex ascending (lowest drawn first)
        const sortedMediaFiles = [...mediaFiles].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        for (let i = 0; i < sortedMediaFiles.length; i++) {
            const mediaFile = sortedMediaFiles[i];
            
            // Skip placeholders
            if (mediaFile.isPlaceholder || !mediaFile.fileId) {
                continue;
            }

            // timing
            const { startTime, positionStart, positionEnd } = mediaFile;
            const duration = positionEnd - positionStart;

            // get the file data and write to ffmpeg
            const fileData = await getFile(mediaFile.fileId);
            const buffer = await fileData.arrayBuffer();
            const ext = mimeToExt[fileData.type as keyof typeof mimeToExt] || fileData.type.split('/')[1];
            await ffmpeg.writeFile(`input${i}.${ext}`, new Uint8Array(buffer));

            if (mediaFile.type === 'image') {
                inputs.push('-loop', '1', '-t', duration.toFixed(3), '-i', `input${i}.${ext}`);
            } else {
                inputs.push('-i', `input${i}.${ext}`);
            }

            const visualLabel = `visual${i}`;
            const audioLabel = `audio${i}`;
            
            // Ensure dimensions are even (required by libx264 encoder)
            const makeEven = (n: number) => Math.round(n / 2) * 2;
            const mediaWidth = makeEven(mediaFile.width || 1080);
            const mediaHeight = makeEven(mediaFile.height || 1920);
            const aspectRatioFit = mediaFile.aspectRatioFit || 'original';

            // Calculate opacity filter suffix
            const alpha = Math.min(Math.max((mediaFile.opacity || 100) / 100, 0), 1);
            const opacityFilter = `,format=yuva420p,colorchannelmixer=aa=${alpha}`;

            // Shift clip to correct place on timeline (video)
            if (mediaFile.type === 'video') {
                let scaleFilter: string;
                if (aspectRatioFit === 'cover') {
                    scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${mediaWidth}:${mediaHeight}:(iw-${mediaWidth})/2:(ih-${mediaHeight})/2`;
                } else {
                    scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
                }
                filters.push(
                    `[${i}:v]trim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},${scaleFilter},setpts=PTS-STARTPTS+${positionStart.toFixed(3)}/TB${opacityFilter}[${visualLabel}]`
                );
            }
            if (mediaFile.type === 'image') {
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
            if (mediaFile.type === 'video' || mediaFile.type === 'image') {
                overlays.push({
                    label: visualLabel,
                    x: mediaFile.x,
                    y: mediaFile.y,
                    start: positionStart.toFixed(3),
                    end: positionEnd.toFixed(3),
                });
            }

            // Audio: trim, then delay (in ms)
            if (mediaFile.type === 'audio' || mediaFile.type === 'video') {
                const delayMs = Math.round(positionStart * 1000);
                const volume = volumeToLinear(mediaFile.volume ?? 50);
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
                const isLastOverlay = i === overlays.length - 1;
                const isFinalOutput = isLastOverlay && textElements.length === 0;
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
                filters.push(`[base]copy[${needsWatermark ? 'preWatermark' : 'outv'}]`);
                lastLabel = needsWatermark ? 'preWatermark' : 'outv';
            } else {
                lastLabel = 'base';
            }
        }

        // Apply text 
        if (textElements.length > 0) {
            const availableFonts = ['Arial', 'Inter', 'Lato', 'OpenSans', 'Roboto'];
            const fallbackFont = 'Arial';
            
            const usedFonts = new Set<string>();
            textElements.forEach(text => {
                const font = text.font || fallbackFont;
                const fontToUse = availableFonts.includes(font) ? font : fallbackFont;
                usedFonts.add(fontToUse);
            });
            
            usedFonts.add(fallbackFont);
            if (needsWatermark) {
                usedFonts.add('Inter');
            }
            
            const loadedFonts = new Set<string>();
            for (const font of Array.from(usedFonts)) {
                try {
                    const res = await fetch(`/fonts/${font}.ttf`);
                    if (!res.ok) {
                        console.warn(`Font ${font} not found (${res.status}), will try fallback`);
                        continue;
                    }
                    const fontBuf = await res.arrayBuffer();
                    await ffmpeg.writeFile(`font${font}.ttf`, new Uint8Array(fontBuf));
                    loadedFonts.add(font);
                } catch (err) {
                    console.warn(`Failed to load font ${font}:`, err);
                }
            }
            
            if (loadedFonts.size === 0) {
                throw new Error('Failed to load any fonts for text rendering.');
            }
            
            for (let i = 0; i < textElements.length; i++) {
                const text = textElements[i];
                
                const requestedFont = text.font || fallbackFont;
                const fontToUse = loadedFonts.has(requestedFont) ? requestedFont : 
                                  (loadedFonts.has(fallbackFont) ? fallbackFont : Array.from(loadedFonts)[0]);
                
                const alpha = Math.min(Math.max((text.opacity ?? 100) / 100, 0), 1);
                let colorValue = text.color || 'white';
                if (colorValue.startsWith('#')) {
                    colorValue = '0x' + colorValue.slice(1);
                }
                const color = colorValue.includes('@') ? colorValue : `${colorValue}@${alpha}`;
                const fontSize = text.fontSize || 24;
                const align = text.align || 'center';
                
                const textLines = text.text.split('\n');
                const lineSpacing = Math.round(fontSize * 1.2);
                
                for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
                    const line = textLines[lineIndex];
                    if (!line.trim() && lineIndex > 0) continue;
                    
                    const normalizedLine = line
                        .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")
                        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
                        .replace(/[\u2013\u2014\u2212]/g, '-')
                        .replace(/\u2026/g, '...')
                        .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '');
                    
                    const textFileName = `text_${i}_${lineIndex}.txt`;
                    await ffmpeg.writeFile(textFileName, normalizedLine);
                    
                    const lineY = text.y + (lineIndex * lineSpacing);
                    
                    let xExpression: string;
                    if (align === 'center') {
                        xExpression = `${text.x}-text_w/2`;
                    } else if (align === 'right') {
                        xExpression = `${text.x}-text_w`;
                    } else {
                        xExpression = `${text.x}`;
                    }
                    
                    const isLastTextElement = i === textElements.length - 1;
                    const isLastLine = lineIndex === textLines.length - 1;
                    const label = (isLastTextElement && isLastLine) 
                        ? (needsWatermark ? 'preWatermark' : 'outv') 
                        : `text${i}_line${lineIndex}`;
                    
                    const drawtextFilter = `[${lastLabel}]drawtext=fontfile=font${fontToUse}.ttf:textfile=${textFileName}:x=${xExpression}:y=${lineY}:fontsize=${fontSize}:fontcolor=${color}:enable='between(t\\,${text.positionStart}\\,${text.positionEnd})'[${label}]`;
                    
                    filters.push(drawtextFilter);
                    lastLabel = label;
                }
            }
        }

        // Add watermark for free plan users
        if (needsWatermark) {
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
            
            const watermarkFontSize = Math.round(canvasWidth * 0.052);
            const iconFontSize = Math.round(watermarkFontSize * 0.85);
            const watermarkPaddingX = Math.round(canvasWidth * 0.04);
            const watermarkPaddingY = Math.round(canvasHeight * 0.032);
            const shadowOffset = Math.max(2, Math.round(watermarkFontSize * 0.07));
            const iconGap = Math.round(watermarkFontSize * 0.35);
            
            await ffmpeg.writeFile('watermark.txt', 'CopyViral');
            await ffmpeg.writeFile('bolt.txt', String.fromCodePoint(0x26A1));
            
            const watermarkFilter = `[preWatermark]drawtext=fontfile=fontInter.ttf:textfile=watermark.txt:x=w-text_w-${watermarkPaddingX}:y=h-text_h-${watermarkPaddingY}:fontsize=${watermarkFontSize}:fontcolor=0xFFFFFF@0.9:shadowcolor=0x000000@0.65:shadowx=${shadowOffset}:shadowy=${shadowOffset}[withText]`;
            filters.push(watermarkFilter);
            
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
            '-pix_fmt', 'yuv420p',
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
            throw new Error(`FFmpeg exited with code ${exitCode}`);
        }

        // Return the output url
        let outputData;
        try {
            outputData = await ffmpeg.readFile('output.mp4');
        } catch (readErr) {
            throw new Error('Output file not created. FFmpeg may have failed.');
        }
        const outputBlob = new Blob([outputData as Uint8Array], { type: 'video/mp4' });
        const outputUrl = URL.createObjectURL(outputBlob);
        
        return { success: true, outputUrl };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('FFmpeg processing error:', err);
        return { success: false, error: errorMessage };
    }
}

/**
 * Clean up FFmpeg file system after render
 */
export async function cleanupFfmpegFiles(ffmpeg: FFmpeg): Promise<void> {
    try {
        // List and delete all files
        const files = await ffmpeg.listDir('/');
        for (const file of files) {
            if (file.name !== '.' && file.name !== '..') {
                try {
                    await ffmpeg.deleteFile(file.name);
                } catch {
                    // Ignore errors when deleting
                }
            }
        }
    } catch (err) {
        console.warn('Failed to cleanup FFmpeg files:', err);
    }
}
