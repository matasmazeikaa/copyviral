"use strict";
/**
 * AWS Lambda function for video rendering with FFmpeg
 *
 * This function is triggered by SQS messages and renders videos using native FFmpeg.
 * It's significantly faster than browser-based FFmpeg WASM.
 *
 * Required Lambda configuration:
 * - Runtime: Node.js 18.x or 20.x
 * - Memory: 3008 MB (recommended)
 * - Timeout: 15 minutes (900 seconds)
 * - Layers: FFmpeg layer (arn:aws:lambda:us-east-1:678847473642:layer:ffmpeg:1)
 *
 * Environment variables:
 * - AWS_REGION
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - FONT_BASE_URL (your Vercel app URL for fonts)
 *
 * Storage: Uses Supabase Storage (bucket: "renders")
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const child_process_1 = require("child_process");
const supabase_js_1 = require("@supabase/supabase-js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
// Supabase Storage bucket name for rendered videos
const STORAGE_BUCKET = 'renders';
const FFMPEG_PATH = '/opt/bin/ffmpeg';
const TMP_DIR = '/tmp';
const handler = async (event) => {
    for (const record of event.Records) {
        const { jobId, userId } = JSON.parse(record.body);
        console.log(`Processing job ${jobId} for user ${userId}`);
        console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
        console.log(`Service key present: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);
        try {
            // Fetch job details from Supabase
            console.log(`Fetching job ${jobId} from render_jobs table...`);
            const { data: job, error: fetchError } = await supabase
                .from('render_jobs')
                .select('*')
                .eq('id', jobId)
                .single();
            console.log(`Supabase response - data: ${JSON.stringify(job)}, error: ${JSON.stringify(fetchError)}`);
            if (fetchError) {
                throw new Error(`Supabase error: ${fetchError.message} (code: ${fetchError.code})`);
            }
            if (!job) {
                throw new Error(`Job not found: ${jobId}`);
            }
            const input = job.input_data;
            // Log input summary for debugging
            console.log(`[Job ${jobId}] Input summary:`);
            console.log(`  - Media files: ${input.mediaFiles?.length || 0}`);
            console.log(`  - Text elements: ${input.textElements?.length || 0}`);
            console.log(`  - Duration: ${input.totalDuration}s`);
            console.log(`  - Resolution: ${input.resolution?.width}x${input.resolution?.height}`);
            if (input.textElements && input.textElements.length > 0) {
                console.log(`  - Text element details:`, JSON.stringify(input.textElements.map(t => ({
                    id: t.id,
                    text: t.text?.substring(0, 50),
                    start: t.positionStart,
                    end: t.positionEnd
                }))));
            }
            // Update status to processing
            await updateJobStatus(jobId, 'processing', 5);
            // Download all media files to /tmp
            console.log('Downloading media files...');
            const localFiles = await downloadMediaFiles(input.mediaFiles, userId);
            await updateJobStatus(jobId, 'processing', 25);
            // Download fonts and watermark
            console.log('Downloading fonts and watermark...');
            await downloadFonts();
            await downloadWatermark();
            await updateJobStatus(jobId, 'processing', 30);
            // Build and execute FFmpeg command
            console.log('Building FFmpeg command...');
            const ffmpegCmd = buildFfmpegCommand(input, localFiles);
            console.log('FFmpeg command:', ffmpegCmd);
            await updateJobStatus(jobId, 'processing', 35);
            // Execute FFmpeg
            console.log('Executing FFmpeg...');
            const outputPath = path.join(TMP_DIR, 'output.mp4');
            try {
                // Using text_shaping=0 in drawtext bypasses fontconfig entirely
                // Fonts are loaded directly via FreeType from the fontfile= path
                (0, child_process_1.execSync)(`${FFMPEG_PATH} ${ffmpegCmd}`, {
                    cwd: TMP_DIR,
                    maxBuffer: 1024 * 1024 * 500, // 500MB buffer for logs
                    timeout: 14 * 60 * 1000, // 14 minutes (leave 1 min buffer for Lambda timeout)
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            }
            catch (ffmpegError) {
                console.error('FFmpeg error:', ffmpegError.stderr?.toString() || ffmpegError.message);
                throw new Error(`FFmpeg failed: ${ffmpegError.message}`);
            }
            await updateJobStatus(jobId, 'processing', 80);
            // Check output exists
            if (!fs.existsSync(outputPath)) {
                throw new Error('Output file was not created');
            }
            console.log('Generating thumbnail...');
            // Generate thumbnail from the video (extract frame at 1 second or 10% of duration)
            const thumbnailPath = path.join(TMP_DIR, 'thumbnail.jpg');
            const thumbnailTime = Math.min(1, input.totalDuration * 0.1); // 1 second or 10% of duration
            try {
                (0, child_process_1.execSync)(`${FFMPEG_PATH} -i "${outputPath}" -ss ${thumbnailTime.toFixed(2)} -vframes 1 -q:v 2 -y "${thumbnailPath}"`, {
                    cwd: TMP_DIR,
                    maxBuffer: 1024 * 1024 * 50, // 50MB buffer
                    timeout: 30 * 1000, // 30 seconds
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                console.log('Thumbnail generated successfully');
            }
            catch (thumbError) {
                console.warn('Failed to generate thumbnail:', thumbError.message);
                // Continue without thumbnail - it's not critical
            }
            await updateJobStatus(jobId, 'processing', 85);
            console.log('Uploading to Supabase Storage...');
            // Upload to Supabase Storage
            const outputBuffer = fs.readFileSync(outputPath);
            const storagePath = `${userId}/${jobId}.mp4`;
            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(storagePath, outputBuffer, {
                contentType: 'video/mp4',
                upsert: true,
            });
            if (uploadError) {
                throw new Error(`Failed to upload to Supabase Storage: ${uploadError.message}`);
            }
            // Store the file path (file ID) instead of URL - URLs are generated on-demand
            const videoFileId = storagePath; // e.g., "userId/jobId.mp4"
            // Upload thumbnail if it was generated
            let thumbnailFileId = null;
            if (fs.existsSync(thumbnailPath)) {
                const thumbnailBuffer = fs.readFileSync(thumbnailPath);
                const thumbnailStoragePath = `${userId}/${jobId}_thumb.jpg`;
                const { error: thumbUploadError } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .upload(thumbnailStoragePath, thumbnailBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });
                if (thumbUploadError) {
                    console.warn('Failed to upload thumbnail:', thumbUploadError.message);
                }
                else {
                    thumbnailFileId = thumbnailStoragePath; // e.g., "userId/jobId_thumb.jpg"
                    console.log('Thumbnail uploaded with file ID:', thumbnailFileId);
                }
            }
            await updateJobStatus(jobId, 'processing', 95);
            // Update job as completed - store file IDs (storage paths), not URLs
            await supabase
                .from('render_jobs')
                .update({
                status: 'completed',
                progress: 100,
                download_url: videoFileId, // Now stores file path, not URL
                thumbnail_url: thumbnailFileId, // Now stores file path, not URL
                file_size_bytes: outputBuffer.length,
                completed_at: new Date().toISOString(),
            })
                .eq('id', jobId);
            // Cleanup
            cleanupTmpFiles();
            console.log(`Job ${jobId} completed successfully. File ID: ${videoFileId}`);
        }
        catch (error) {
            console.error(`Job ${jobId} failed:`, error);
            await supabase
                .from('render_jobs')
                .update({
                status: 'failed',
                error_message: error.message || 'Unknown error',
                retry_count: (await getRetryCount(jobId)) + 1,
            })
                .eq('id', jobId);
            cleanupTmpFiles();
            // Don't throw - let SQS handle retries if configured
        }
    }
    return { statusCode: 200, body: 'OK' };
};
exports.handler = handler;
async function getRetryCount(jobId) {
    const { data } = await supabase
        .from('render_jobs')
        .select('retry_count')
        .eq('id', jobId)
        .single();
    return data?.retry_count || 0;
}
async function updateJobStatus(jobId, status, progress) {
    await supabase
        .from('render_jobs')
        .update({ status, progress })
        .eq('id', jobId);
}
async function downloadMediaFiles(mediaFiles, userId) {
    const localFiles = new Map();
    for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        if (file.isPlaceholder)
            continue;
        let downloadUrl = null;
        let ext = 'mp4';
        // Check if we have a supabaseFileId - download from Supabase Storage
        if (file.supabaseFileId) {
            // Extract the UUID from supabaseFileId (format: "{uuid}.{ext}")
            const fileIdWithExt = file.supabaseFileId;
            const fileIdWithoutExt = file.supabaseFileId.replace(/\.[^/.]+$/, '');
            const basePath = file.supabaseFolder
                ? `${userId}/${file.supabaseFolder}`
                : userId;
            // Try multiple path variations (with and without extension, different folders)
            // _ai_ref is inside the user folder: {userId}/_ai_ref/{fileId}
            const pathsToTry = [
                `${basePath}/${fileIdWithExt}`, // user folder with ext
                `${basePath}/${fileIdWithoutExt}`, // user folder without ext
                `${userId}/_ai_ref/${fileIdWithExt}`, // user's _ai_ref folder with ext
                `${userId}/_ai_ref/${fileIdWithoutExt}`, // user's _ai_ref folder without ext
            ];
            console.log(`Looking for file: ${fileIdWithExt}, trying direct paths...`);
            let signedUrlData = null;
            // First try direct paths
            for (const tryPath of pathsToTry) {
                const result = await supabase.storage
                    .from('media-library')
                    .createSignedUrl(tryPath, 3600);
                if (result.data?.signedUrl) {
                    console.log(`Found file at direct path: ${tryPath}`);
                    signedUrlData = result.data;
                    break;
                }
                else if (result.error && tryPath.includes('_ai_ref')) {
                    console.log(`[DEBUG] _ai_ref path ${tryPath} failed: ${result.error.message}`);
                }
            }
            // If direct paths fail, try listing folders to find files with encoded names
            // Files can be stored as {uuid}--{base64EncodedName}.{ext}
            if (!signedUrlData?.signedUrl) {
                console.log(`Direct paths failed, searching by listing folders...`);
                const foldersToSearch = [basePath, `${userId}/_ai_ref`];
                for (const folder of foldersToSearch) {
                    const { data: fileList, error: listError } = await supabase.storage
                        .from('media-library')
                        .list(folder, { limit: 500 });
                    if (listError) {
                        console.log(`Error listing folder ${folder}:`, listError.message);
                        continue;
                    }
                    if (fileList) {
                        // Log what we found in _ai_ref for debugging
                        if (folder.includes('_ai_ref')) {
                            console.log(`[DEBUG] Files in ${folder} (${fileList.length}): ${fileList.slice(0, 10).map(f => f.name).join(', ')}${fileList.length > 10 ? '...' : ''}`);
                        }
                        // Find file that starts with the UUID (handles encoded name format)
                        const matchingFile = fileList.find(f => f.name.startsWith(fileIdWithoutExt));
                        if (matchingFile) {
                            const fullPath = `${folder}/${matchingFile.name}`;
                            console.log(`Found file by listing: ${fullPath}`);
                            const result = await supabase.storage
                                .from('media-library')
                                .createSignedUrl(fullPath, 3600);
                            if (result.data?.signedUrl) {
                                signedUrlData = result.data;
                                break;
                            }
                        }
                    }
                }
            }
            if (!signedUrlData?.signedUrl) {
                console.error(`No matching file found for: ${file.supabaseFileId}`);
            }
            if (signedUrlData?.signedUrl) {
                downloadUrl = signedUrlData.signedUrl;
                // Extract extension from supabaseFileId
                const extMatch = file.supabaseFileId.match(/\.([a-zA-Z0-9]+)$/);
                if (extMatch) {
                    ext = extMatch[1].toLowerCase();
                }
                console.log(`Got signed URL for ${file.fileName}`);
            }
        }
        // Fall back to src URL if available
        if (!downloadUrl && file.src) {
            if (file.src.startsWith('http://') || file.src.startsWith('https://')) {
                downloadUrl = file.src;
                // Extract extension from URL
                const urlPath = file.src.split('?')[0];
                const urlExt = urlPath.split('.').pop();
                if (urlExt && ['mp4', 'webm', 'mov', 'mp3', 'wav', 'jpg', 'jpeg', 'png', 'webp'].includes(urlExt.toLowerCase())) {
                    ext = urlExt.toLowerCase();
                }
            }
            else {
                console.warn(`Skipping file with invalid URL (not http/https): ${file.src?.substring(0, 50)}...`);
            }
        }
        if (!downloadUrl) {
            console.warn(`No valid download URL for file: ${file.fileName} (supabaseFileId: ${file.supabaseFileId || 'none'})`);
            continue;
        }
        console.log(`Downloading file ${i + 1}/${mediaFiles.length}: ${file.fileName} (type: ${file.type})`);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Failed to download: ${file.fileName} (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const localPath = path.join(TMP_DIR, `input_${i}.${ext}`);
        fs.writeFileSync(localPath, Buffer.from(buffer));
        localFiles.set(file.fileId, localPath);
        console.log(`Downloaded: ${localPath} (${buffer.byteLength} bytes)`);
    }
    return localFiles;
}
async function downloadFonts() {
    const fonts = ['Arial', 'Inter', 'Roboto', 'Lato', 'OpenSans'];
    // Fonts are bundled with the Lambda function in /var/task/fonts/
    // Copy them to /tmp/ for FFmpeg access
    const bundledFontsDir = '/var/task/fonts';
    for (const font of fonts) {
        const srcPath = path.join(bundledFontsDir, `${font}.ttf`);
        const dstPath = path.join(TMP_DIR, `${font}.ttf`);
        try {
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, dstPath);
                console.log(`Copied bundled font: ${font} (${fs.statSync(dstPath).size} bytes)`);
            }
            else {
                console.warn(`Bundled font not found: ${srcPath}`);
            }
        }
        catch (e) {
            console.warn(`Failed to copy font ${font}:`, e);
        }
    }
    // List fonts that were copied
    const fontFiles = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.ttf'));
    console.log(`Fonts in /tmp: ${fontFiles.join(', ')}`);
    // Verify Arial font exists (required for text rendering)
    const arialPath = path.join(TMP_DIR, 'Arial.ttf');
    if (fs.existsSync(arialPath)) {
        console.log(`Arial font verified: ${arialPath} (${fs.statSync(arialPath).size} bytes)`);
    }
    else {
        console.error(`CRITICAL: Arial font NOT found at ${arialPath}`);
    }
}
async function downloadWatermark() {
    // Watermark is bundled with the Lambda function in /var/task/watermark.png
    const bundledWatermarkPath = '/var/task/watermark.png';
    const dstPath = path.join(TMP_DIR, 'watermark.png');
    try {
        if (fs.existsSync(bundledWatermarkPath)) {
            fs.copyFileSync(bundledWatermarkPath, dstPath);
            console.log(`Copied bundled watermark: ${dstPath} (${fs.statSync(dstPath).size} bytes)`);
        }
        else {
            console.warn(`Bundled watermark not found: ${bundledWatermarkPath}`);
        }
    }
    catch (e) {
        console.warn('Failed to copy watermark:', e);
    }
}
/**
 * Check if a media file has an audio stream using ffprobe
 * Falls back to true (assume audio exists) if ffprobe is not available
 */
function hasAudioStream(filePath) {
    try {
        // Try using ffprobe from the FFmpeg layer
        const result = (0, child_process_1.execSync)(`/opt/bin/ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
        return result.trim().includes('audio');
    }
    catch (e) {
        // If ffprobe doesn't exist or fails, assume audio exists
        // FFmpeg will handle missing audio streams gracefully
        if (e.message?.includes('No such file or directory') || e.status === 127) {
            console.log(`[hasAudioStream] ffprobe not available, assuming audio exists for ${filePath}`);
            return true;
        }
        console.warn(`[hasAudioStream] Could not probe ${filePath}:`, e.message);
        return true; // Assume audio exists, let FFmpeg handle it
    }
}
function buildFfmpegCommand(input, localFiles) {
    const { mediaFiles, exportSettings, totalDuration, resolution, isPremium } = input;
    // Ensure textElements is always an array (handle undefined from JSONB)
    const textElements = input.textElements || [];
    console.log(`[buildFfmpegCommand] Text elements count: ${textElements.length}`);
    console.log(`[buildFfmpegCommand] isPremium: ${isPremium}`);
    if (textElements.length > 0) {
        console.log('[buildFfmpegCommand] Text elements:', JSON.stringify(textElements.map(t => ({
            id: t.id,
            text: t.text?.substring(0, 30),
            positionStart: t.positionStart,
            positionEnd: t.positionEnd
        }))));
    }
    const width = resolution.width;
    const height = resolution.height;
    // Check if watermark should be added (for free users)
    const watermarkPath = path.join(TMP_DIR, 'watermark.png');
    const needsWatermark = !isPremium && fs.existsSync(watermarkPath);
    console.log(`[buildFfmpegCommand] Watermark: needed=${!isPremium}, available=${fs.existsSync(watermarkPath)}, applying=${needsWatermark}`);
    // Build inputs
    const inputs = [];
    const filters = [];
    const overlays = [];
    const audioDelays = [];
    // Track watermark input index (will be set if watermark is needed)
    let watermarkInputIndex = null;
    // Sort by zIndex (lowest first, drawn first)
    const sortedFiles = [...mediaFiles]
        .filter(f => !f.isPlaceholder && f.fileId && localFiles.has(f.fileId))
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    // Base black background
    filters.push(`color=c=black:size=${width}x${height}:d=${totalDuration.toFixed(3)}[base]`);
    let inputIndex = 0;
    for (const file of sortedFiles) {
        const localPath = localFiles.get(file.fileId);
        const duration = file.positionEnd - file.positionStart;
        const i = inputIndex++;
        if (file.type === 'image') {
            inputs.push(`-loop 1 -t ${duration.toFixed(3)} -i "${localPath}"`);
        }
        else {
            inputs.push(`-i "${localPath}"`);
        }
        // Ensure even dimensions (required by libx264)
        const mediaWidth = Math.round((file.width || width) / 2) * 2;
        const mediaHeight = Math.round((file.height || height) / 2) * 2;
        const aspectRatioFit = file.aspectRatioFit || 'cover';
        // Calculate opacity
        const alpha = Math.min(Math.max((file.opacity || 100) / 100, 0), 1);
        const opacityFilter = alpha < 1 ? `,format=yuva420p,colorchannelmixer=aa=${alpha}` : '';
        // Scale filter based on aspect ratio fit
        let scaleFilter;
        if (aspectRatioFit === 'cover') {
            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${mediaWidth}:${mediaHeight}:(iw-${mediaWidth})/2:(ih-${mediaHeight})/2`;
        }
        else {
            scaleFilter = `scale=${mediaWidth}:${mediaHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${mediaWidth}:${mediaHeight}:(ow-iw)/2:(oh-ih)/2:black`;
        }
        // Video filter
        if (file.type === 'video') {
            filters.push(`[${i}:v]trim=start=${file.startTime.toFixed(3)}:duration=${duration.toFixed(3)},${scaleFilter},setpts=PTS-STARTPTS+${file.positionStart.toFixed(3)}/TB${opacityFilter}[v${i}]`);
        }
        else if (file.type === 'image') {
            filters.push(`[${i}:v]${scaleFilter},setpts=PTS+${file.positionStart.toFixed(3)}/TB${opacityFilter}[v${i}]`);
        }
        // Track overlay info
        if (file.type === 'video' || file.type === 'image') {
            overlays.push({
                label: `v${i}`,
                x: file.x || 0,
                y: file.y || 0,
                start: file.positionStart,
                end: file.positionEnd,
            });
        }
        // Audio filter - only if file has audio stream
        if (file.type === 'video' || file.type === 'audio') {
            const fileHasAudio = hasAudioStream(localPath);
            console.log(`[buildFfmpegCommand] File ${i} (${file.fileName}): hasAudio=${fileHasAudio}`);
            if (fileHasAudio) {
                const delayMs = Math.round(file.positionStart * 1000);
                // Convert volume (0-100) to linear scale
                const volumeLinear = Math.pow(10, ((file.volume ?? 50) - 50) / 50);
                filters.push(`[${i}:a]atrim=start=${file.startTime.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${volumeLinear.toFixed(4)}[a${i}]`);
                audioDelays.push(`[a${i}]`);
            }
        }
    }
    // Add watermark input if needed (after all media inputs)
    if (needsWatermark) {
        watermarkInputIndex = inputIndex;
        inputs.push(`-i "${watermarkPath}"`);
        console.log(`[buildFfmpegCommand] Added watermark input at index ${watermarkInputIndex}`);
    }
    // Apply overlays in order
    let lastLabel = 'base';
    if (overlays.length > 0) {
        for (let i = 0; i < overlays.length; i++) {
            const { label, x, y, start, end } = overlays[i];
            const isLastOverlay = i === overlays.length - 1;
            const noMoreProcessing = isLastOverlay && textElements.length === 0;
            // If this is the last step before output, decide if we need watermark
            const nextLabel = noMoreProcessing
                ? (needsWatermark ? 'preWm' : 'outv')
                : `tmp${i}`;
            // Escape the comma in the enable expression
            filters.push(`[${lastLabel}][${label}]overlay=${x}:${y}:enable='between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})'[${nextLabel}]`);
            lastLabel = nextLabel;
        }
    }
    else {
        // No overlays, just use base
        if (textElements.length === 0) {
            const outLabel = needsWatermark ? 'preWm' : 'outv';
            filters.push(`[base]copy[${outLabel}]`);
            lastLabel = outLabel;
        }
    }
    // Apply text elements (supports multi-line text)
    if (textElements.length > 0) {
        // Flatten text elements into individual lines for multi-line support
        const textLines = [];
        for (const text of textElements) {
            const lines = text.text.split('\n');
            lines.forEach((line, lineIndex) => {
                textLines.push({ text, line, lineIndex, totalLines: lines.length });
            });
        }
        console.log(`[Text] Processing ${textElements.length} text elements with ${textLines.length} total lines`);
        for (let i = 0; i < textLines.length; i++) {
            const { text, line, lineIndex, totalLines } = textLines[i];
            const isLast = i === textLines.length - 1;
            const nextLabel = isLast ? (needsWatermark ? 'preWm' : 'outv') : `txt${i}`;
            // Skip empty lines but still account for spacing
            if (line.trim() === '') {
                // For empty lines, just pass through without drawing
                if (isLast) {
                    filters.push(`[${lastLabel}]copy[${nextLabel}]`);
                }
                else {
                    // Chain to next without modification
                    filters.push(`[${lastLabel}]null[${nextLabel}]`);
                }
                lastLabel = nextLabel;
                continue;
            }
            // Get font file (fallback to Arial)
            const font = text.font || 'Arial';
            const fontFile = path.join(TMP_DIR, `${font}.ttf`);
            const actualFontFile = fs.existsSync(fontFile) ? fontFile : path.join(TMP_DIR, 'Arial.ttf');
            // Escape special characters for FFmpeg drawtext
            // The filter_complex is wrapped in double quotes, and text= value is wrapped in single quotes.
            const escapedLine = line
                .replace(/\\/g, '\\\\') // Escape backslashes first
                .replace(/'/g, '\u2019') // Replace apostrophe with Unicode right single quote (looks identical)
                .replace(/"/g, '\\"') // Escape double quotes for shell (filter_complex is in double quotes)
                .replace(/:/g, '\\:') // Escape colons (FFmpeg option separator)
                .replace(/\[/g, '\\[') // Escape square brackets
                .replace(/\]/g, '\\]')
                .replace(/%/g, '%%'); // Escape percent signs (FFmpeg special sequences)
            console.log(`[Text ${i}] Line ${lineIndex + 1}/${totalLines}: "${line.substring(0, 40)}"`);
            // Calculate x position based on alignment
            let xExpr;
            if (text.align === 'center') {
                xExpr = `${text.x}-text_w/2`;
            }
            else if (text.align === 'right') {
                xExpr = `${text.x}-text_w`;
            }
            else {
                xExpr = `${text.x}`;
            }
            // Calculate y position with line offset
            // Use 1.2x font size as line height for natural spacing
            const fontSize = text.fontSize || 24;
            const lineHeight = Math.round(fontSize * 1.2);
            const yPos = text.y + (lineIndex * lineHeight);
            // Parse color
            let fontColor = text.color || 'white';
            if (fontColor.startsWith('#')) {
                fontColor = '0x' + fontColor.slice(1);
            }
            // Build the drawtext filter - use fontfile to bypass fontconfig
            const drawtextFilter = `[${lastLabel}]drawtext=fontfile='${actualFontFile}':text='${escapedLine}':x=${xExpr}:y=${yPos}:fontsize=${fontSize}:fontcolor=${fontColor}:enable='between(t\\,${text.positionStart.toFixed(3)}\\,${text.positionEnd.toFixed(3)})'[${nextLabel}]`;
            console.log(`[Text ${i}] Filter: ${drawtextFilter.substring(0, 200)}...`);
            filters.push(drawtextFilter);
            lastLabel = nextLabel;
        }
    }
    // Add watermark for non-premium users (image overlay in bottom-right corner of content)
    if (needsWatermark && watermarkInputIndex !== null) {
        // Scale watermark to be about 1/3 of the video width
        const watermarkScale = Math.round(width * 0.33);
        const paddingX = Math.round(width * 0.03);
        // Position watermark at ~60% of canvas height to ensure it's in visible content area
        // (not at the very bottom which may be black bars for letterboxed content)
        const watermarkY = Math.round(height * 0.60);
        // Scale the watermark image and make it semi-transparent
        filters.push(`[${watermarkInputIndex}:v]scale=${watermarkScale}:-1,format=rgba,colorchannelmixer=aa=0.8[wm]`);
        // Overlay watermark at right side, positioned within typical content area
        filters.push(`[preWm][wm]overlay=W-w-${paddingX}:${watermarkY}[outv]`);
        console.log(`[buildFfmpegCommand] Added watermark overlay: scale=${watermarkScale}, x=W-w-${paddingX}, y=${watermarkY}`);
    }
    // Mix all audio tracks
    if (audioDelays.length > 0) {
        const audioMix = audioDelays.join('');
        filters.push(`${audioMix}amix=inputs=${audioDelays.length}:normalize=0[outa]`);
    }
    // Build final command
    const filterComplex = filters.join('; ');
    // Determine encoding settings
    let crf;
    let preset;
    switch (exportSettings.quality) {
        case 'low':
            crf = 28;
            break;
        case 'medium':
            crf = 23;
            break;
        case 'high':
            crf = 18;
            break;
        case 'ultra':
            crf = 14;
            break;
        default: crf = 23;
    }
    switch (exportSettings.speed) {
        case 'fastest':
            preset = 'ultrafast';
            break;
        case 'fast':
            preset = 'veryfast';
            break;
        case 'balanced':
            preset = 'medium';
            break;
        case 'slow':
            preset = 'slow';
            break;
        case 'slowest':
            preset = 'veryslow';
            break;
        default: preset = 'medium';
    }
    let cmd = `${inputs.join(' ')} -filter_complex "${filterComplex}" -map "[outv]"`;
    if (audioDelays.length > 0) {
        cmd += ' -map "[outa]"';
    }
    cmd += ` -c:v libx264 -pix_fmt yuv420p -c:a aac -preset ${preset} -crf ${crf} -t ${totalDuration.toFixed(3)} -y output.mp4`;
    return cmd;
}
function cleanupTmpFiles() {
    try {
        const files = fs.readdirSync(TMP_DIR);
        for (const file of files) {
            if (file.startsWith('input_') || file.startsWith('output') || file.startsWith('thumbnail') || file.endsWith('.ttf')) {
                try {
                    fs.unlinkSync(path.join(TMP_DIR, file));
                }
                catch (e) {
                    // Ignore individual file deletion errors
                }
            }
        }
        console.log('Cleaned up temp files');
    }
    catch (e) {
        console.warn('Cleanup error:', e);
    }
}
//# sourceMappingURL=index.js.map