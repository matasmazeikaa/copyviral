'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { 
    TemplateSlot, 
    TemplateTextElement, 
    TemplateData,
    MediaFile,
    TextElement,
    ExportConfig
} from '@/app/types';
import { 
    X, 
    Loader2, 
    Download, 
    CheckCircle, 
    AlertCircle, 
    Package,
    Film,
    Sparkles,
    Cloud,
    Zap,
    Pencil,
    Check,
    Crown,
    ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCloudRender } from '@/app/hooks/useCloudRender';
import { useAuth } from '@/app/contexts/AuthContext';

interface SelectedVideo {
    id: string;
    src: string;
    name: string;
    file?: File;
}

interface AudioFile {
    src: string;
    supabaseFileId?: string;
    fileName?: string;
    duration?: number;
    folder?: string | null;
}

interface LoadedImage {
    id: string;
    positionStart: number;
    positionEnd: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
    supabaseFileId: string;
    supabaseFolder?: string | null;
    fileName: string;
    src: string; // Loaded blob URL
}

interface BatchExportProps {
    isOpen: boolean;
    onClose: () => void;
    templateData: TemplateData;
    selectedVideos: SelectedVideo[];
    slotAssignments: Map<string, SelectedVideo>;
    editedTexts: Map<string, string>;
    variationCount: number;
    audioFile?: AudioFile | null; // Audio file loaded from template
    loadedImages?: LoadedImage[]; // Static images loaded from template
}

interface ExportProgress {
    variationIndex: number;
    status: 'pending' | 'queued' | 'processing' | 'completed' | 'error';
    progress: number;
    error?: string;
    downloadUrl?: string;
    jobId?: string;
}

type ExportPhase = 'idle' | 'submitting' | 'rendering' | 'complete';

// Default export settings
const DEFAULT_EXPORT_SETTINGS: ExportConfig = {
    resolution: '1080x1920',
    quality: 'high',
    speed: 'balanced',
    fps: 30,
    format: 'mp4',
    includeSubtitles: false
};

/**
 * Generate a random assignment of videos to slots
 */
function generateRandomAssignment(
    slots: TemplateSlot[],
    videos: SelectedVideo[]
): Map<string, SelectedVideo> {
    const assignment = new Map<string, SelectedVideo>();
    const shuffled = [...videos].sort(() => Math.random() - 0.5);
    
    slots.forEach((slot, index) => {
        const videoIndex = index % shuffled.length;
        assignment.set(slot.id, shuffled[videoIndex]);
    });
    
    return assignment;
}

/**
 * Convert template data + assignments to project-compatible media files
 */
function createMediaFilesFromAssignment(
    slots: TemplateSlot[],
    assignment: Map<string, SelectedVideo>,
    resolution: { width: number; height: number }
): MediaFile[] {
    return slots.map((slot, index) => {
        const video = assignment.get(slot.id);
        return {
            id: slot.id,
            fileName: video?.name || `Slot ${slot.index}`,
            fileId: video?.id || '',
            type: slot.mediaType,
            startTime: 0,
            endTime: slot.duration,
            positionStart: slot.positionStart,
            positionEnd: slot.positionEnd,
            includeInMerge: true,
            playbackSpeed: 1,
            volume: 50,
            zIndex: index,
            x: slot.x ?? 0,
            y: slot.y ?? 0,
            width: slot.width ?? resolution.width,
            height: slot.height ?? resolution.height,
            src: video?.src,
            isPlaceholder: !video,
            aspectRatioFit: 'cover',
        };
    });
}

/**
 * Convert template text elements + edits to project text elements
 */
function createTextElementsFromEdits(
    templateTexts: TemplateTextElement[],
    editedTexts: Map<string, string>
): TextElement[] {
    return templateTexts.map(templateText => ({
        id: templateText.id,
        text: editedTexts.get(templateText.id) || templateText.text,
        positionStart: templateText.positionStart,
        positionEnd: templateText.positionEnd,
        x: templateText.x,
        y: templateText.y,
        fontSize: templateText.fontSize,
        color: templateText.color,
        font: templateText.font,
        align: templateText.align,
    }));
}

export function BatchExport({
    isOpen,
    onClose,
    templateData,
    selectedVideos,
    slotAssignments,
    editedTexts,
    variationCount,
    audioFile,
    loadedImages = []
}: BatchExportProps) {
    const router = useRouter();
    const { isPremium } = useAuth();
    const [exportProgress, setExportProgress] = useState<ExportProgress[]>([]);
    const [mounted, setMounted] = useState(false);
    const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
    const [autoDownloadTriggered, setAutoDownloadTriggered] = useState(false);
    
    // Variation names state
    const [variationNames, setVariationNames] = useState<string[]>([]);
    const [editingNameIndex, setEditingNameIndex] = useState<number | null>(null);
    const [editingNameValue, setEditingNameValue] = useState<string>('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    
    // Use cloud rendering hook
    const { 
        startBatchRender, 
        jobs, 
        isSubmitting,
        activeJobs,
        completedJobs,
        failedJobs,
    } = useCloudRender({
        onComplete: (job) => {
            console.log('Job completed:', job.id);
        },
        onError: (jobId, error) => {
            console.error('Job failed:', jobId, error);
        },
        onAllComplete: (completedJobs) => {
            setExportPhase('complete');
            if (completedJobs.length === variationCount) {
                toast.success(`All ${variationCount} variations exported!`);
            } else if (completedJobs.length > 0) {
                toast.success(`${completedJobs.length} of ${variationCount} variations exported`);
            }
        },
        autoDownload: true,
    });
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    // Initialize progress array and variation names when modal opens
    useEffect(() => {
        if (isOpen) {
            setExportProgress(
                Array.from({ length: variationCount }, (_, i) => ({
                    variationIndex: i,
                    status: 'pending',
                    progress: 0
                }))
            );
            // Initialize variation names
            setVariationNames(
                Array.from({ length: variationCount }, (_, i) => `Variation ${i + 1}`)
            );
            setExportPhase('idle');
            setAutoDownloadTriggered(false);
            setEditingNameIndex(null);
        }
    }, [isOpen, variationCount]);
    
    // Focus input when editing starts
    useEffect(() => {
        if (editingNameIndex !== null && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [editingNameIndex]);
    
    // Handle starting name edit
    const startEditingName = (index: number) => {
        setEditingNameIndex(index);
        setEditingNameValue(variationNames[index]);
    };
    
    // Handle saving name edit
    const saveNameEdit = () => {
        if (editingNameIndex !== null && editingNameValue.trim()) {
            setVariationNames(prev => {
                const updated = [...prev];
                updated[editingNameIndex] = editingNameValue.trim();
                return updated;
            });
        }
        setEditingNameIndex(null);
        setEditingNameValue('');
    };
    
    // Handle cancel name edit
    const cancelNameEdit = () => {
        setEditingNameIndex(null);
        setEditingNameValue('');
    };
    
    // Sync job status to export progress
    useEffect(() => {
        if (jobs.size === 0) return;
        
        setExportProgress(prev => {
            const updated = [...prev];
            jobs.forEach((job) => {
                const idx = job.batchIndex;
                if (idx !== undefined && idx < updated.length) {
                    // Map 'failed' status to 'error' for UI consistency
                    const status = job.status === 'failed' ? 'error' : job.status;
                    updated[idx] = {
                        ...updated[idx],
                        status: status as ExportProgress['status'],
                        progress: job.progress,
                        downloadUrl: job.downloadUrl,
                        error: job.errorMessage,
                        jobId: job.id,
                    };
                }
            });
            return updated;
        });
        
        // Update phase based on job status
        if (activeJobs.length > 0) {
            setExportPhase('rendering');
        } else if (completedJobs.length > 0 || failedJobs.length > 0) {
            setExportPhase('complete');
        }
    }, [jobs, activeJobs, completedJobs, failedJobs]);
    
    const startBatchExport = async () => {
        if (selectedVideos.length === 0) {
            toast.error('No videos selected');
            return;
        }
        
        setExportPhase('submitting');
        
        // Mark all as queued
        setExportProgress(prev => prev.map(p => ({ ...p, status: 'queued' as const, progress: 0 })));
        
        const totalDuration = Math.max(
            ...templateData.slots.map(s => s.positionEnd),
            0
        );
        
        // Prepare all render requests
        const renderRequests = [];
        
        for (let i = 0; i < variationCount; i++) {
            const assignment = i === 0 
                ? slotAssignments
                : generateRandomAssignment(templateData.slots, selectedVideos);
            
            const mediaFiles = createMediaFilesFromAssignment(
                templateData.slots, 
                assignment,
                templateData.resolution
            );
            
            // Add static images from template (not changeable by users)
            if (loadedImages && loadedImages.length > 0) {
                console.log(`[BatchExport] Adding ${loadedImages.length} static images`);
                for (const image of loadedImages) {
                    const imageMediaFile: MediaFile = {
                        id: image.id,
                        fileName: image.fileName,
                        fileId: crypto.randomUUID(),
                        type: 'image',
                        startTime: 0,
                        endTime: image.positionEnd - image.positionStart,
                        positionStart: image.positionStart,
                        positionEnd: image.positionEnd,
                        includeInMerge: true,
                        playbackSpeed: 1,
                        volume: 0,
                        zIndex: image.zIndex ?? 10, // Images typically overlay on top
                        x: image.x,
                        y: image.y,
                        width: image.width,
                        height: image.height,
                        src: image.src,
                        supabaseFileId: image.supabaseFileId,
                        supabaseFolder: image.supabaseFolder,
                    };
                    mediaFiles.push(imageMediaFile);
                }
            }
            
            // Add audio track if template has audio
            if (audioFile && audioFile.src) {
                const audioMediaFile: MediaFile = {
                    id: crypto.randomUUID(),
                    fileName: audioFile.fileName || 'Template Audio',
                    fileId: crypto.randomUUID(),
                    type: 'audio',
                    startTime: 0,
                    endTime: audioFile.duration || totalDuration,
                    positionStart: 0,
                    positionEnd: audioFile.duration || totalDuration,
                    includeInMerge: true,
                    playbackSpeed: 1,
                    volume: 50,
                    zIndex: 0,
                    src: audioFile.src,
                    supabaseFileId: audioFile.supabaseFileId,
                    supabaseFolder: audioFile.folder,
                };
                mediaFiles.push(audioMediaFile);
            }
            
            // Create text elements from template with user edits
            // Ensure textElements is an array (handle undefined from JSONB)
            const templateTextElements = templateData.textElements || [];
            const textElements = createTextElementsFromEdits(templateTextElements, editedTexts);
            
            console.log(`[BatchExport] Variation ${i + 1}: ${textElements.length} text elements`);
            if (textElements.length > 0) {
                console.log('[BatchExport] Text elements:', textElements.map(t => ({ id: t.id, text: t.text?.substring(0, 30) })));
            }
            
            renderRequests.push({
                mediaFiles,
                textElements,
                exportSettings: {
                    ...DEFAULT_EXPORT_SETTINGS,
                    resolution: `${templateData.resolution.width}x${templateData.resolution.height}`,
                    fps: templateData.fps,
                },
                totalDuration,
                resolution: templateData.resolution,
                fps: templateData.fps,
                projectName: variationNames[i] || `Variation ${i + 1}`,
            });
        }
        
        // Submit all jobs to Lambda
        const jobIds = await startBatchRender(renderRequests);
        
        if (jobIds.length > 0) {
            toast.success(`${jobIds.length} render jobs queued`);
            // Close modal and show redirect toast
            onClose();
            toast.loading('Redirecting to Videos...', { duration: 1500 });
            // Small delay to show the toast before redirecting
            setTimeout(() => {
                router.push('/videos');
            }, 300);
        } else {
            setExportPhase('idle');
            toast.error('Failed to start batch export');
        }
    };
    
    const downloadAll = useCallback(() => {
        const completedExports = exportProgress.filter(p => p.status === 'completed' && p.downloadUrl);
        completedExports.forEach((exp, index) => {
            if (exp.downloadUrl) {
                // Stagger downloads slightly to prevent browser blocking
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = exp.downloadUrl!;
                    link.download = `variation_${exp.variationIndex + 1}.mp4`;
                    link.target = '_blank';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, index * 500);
            }
        });
    }, [exportProgress]);
    
    const completedCount = exportProgress.filter(p => p.status === 'completed').length;
    const errorCount = exportProgress.filter(p => p.status === 'error').length;
    const overallProgress = exportProgress.length > 0
        ? Math.round(exportProgress.reduce((sum, p) => sum + p.progress, 0) / exportProgress.length)
        : 0;
    
    const isExporting = exportPhase === 'submitting' || exportPhase === 'rendering';
    
    if (!isOpen || !mounted) return null;
    
    // Premium gate modal for non-premium users trying to batch export (2+ variations)
    // Single export (1 variation) is allowed for all users
    const isBatchExport = variationCount >= 2;
    if (!isPremium && isBatchExport) {
        const premiumGateContent = (
            <div 
                className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                style={{ zIndex: 99999 }}
            >
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
                    {/* Glow effect */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-purple-500/20 blur-[80px]" />
                    
                    {/* Header */}
                    <div className="relative flex items-center justify-between p-6 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 flex items-center justify-center">
                                <Package className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    Batch Export
                                    <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-2 py-0.5 rounded-full flex items-center gap-1 border border-purple-500/30">
                                        <Crown className="w-3 h-3 text-yellow-400" />
                                        Pro
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400">
                                    Premium feature
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    {/* Content */}
                    <div className="relative p-6">
                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                    <Package className="w-8 h-8 text-white" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center">
                                    <Crown className="w-4 h-4 text-yellow-900" />
                                </div>
                            </div>
                        </div>
                        
                        {/* Message */}
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-white mb-2">
                                Batch Export is a Pro Feature
                            </h3>
                            <p className="text-slate-400 text-sm">
                                Upgrade to Pro to export multiple video variations at once with cloud rendering.
                            </p>
                        </div>
                        
                        {/* Benefits */}
                        <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                            <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-purple-400" />
                                What you&apos;ll unlock:
                            </h4>
                            <ul className="space-y-2 text-sm">
                                {[
                                    'Export multiple variations at once',
                                    'Fast cloud rendering',
                                    'Background processing',
                                    'No watermarks on exports',
                                    'Unlimited AI generations'
                                ].map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2 text-slate-400">
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        {/* Actions */}
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    onClose();
                                    router.push('/subscription');
                                }}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                            >
                                Upgrade to Pro
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
                            >
                                Maybe Later
                            </button>
                        </div>
                        
                        <p className="text-center text-xs text-slate-500 mt-4">
                            Starting at $9.99/month • Cancel anytime
                        </p>
                    </div>
                </div>
            </div>
        );
        
        return mounted ? createPortal(premiumGateContent, document.body) : null;
    }
    
    const modalContent = (
        <div 
            className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            style={{ zIndex: 99999 }}
        >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 flex items-center justify-center">
                            <Cloud className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                Cloud Export
                                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    Fast
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Generating {variationCount} variation{variationCount > 1 ? 's' : ''} on cloud servers
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Content */}
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Cloud Info Banner */}
                    {exportPhase === 'idle' && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <Cloud className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm text-blue-300 font-medium">Cloud Rendering</p>
                                    <p className="text-xs text-blue-400/70 mt-1">
                                        Videos are rendered on fast cloud servers. You can close this tab and come back later - your exports will continue in the background.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Submitting Phase */}
                    {exportPhase === 'submitting' && (
                        <div className="bg-cyan-600/10 border border-cyan-500/30 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                                <div>
                                    <p className="text-sm font-medium text-cyan-300">Submitting Jobs</p>
                                    <p className="text-xs text-cyan-400/70">Sending {variationCount} render jobs to cloud...</p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Rendering Phase - Overall Progress */}
                    {exportPhase === 'rendering' && (
                        <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-purple-300">Rendering on Cloud</p>
                                    <p className="text-xs text-purple-400/70">Processing {variationCount} video{variationCount > 1 ? 's' : ''} in parallel...</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-purple-400">Overall Progress</span>
                                <span className="text-xs font-mono text-purple-300">{overallProgress}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                                    style={{ width: `${overallProgress}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                                <span>{completedCount} of {variationCount} complete</span>
                                {errorCount > 0 && (
                                    <span className="text-red-400">{errorCount} failed</span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Complete Phase */}
                    {exportPhase === 'complete' && completedCount > 0 && (
                        <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-emerald-300">Export Complete!</p>
                                    <p className="text-xs text-emerald-400/70">
                                        {completedCount} video{completedCount > 1 ? 's' : ''} ready for download
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Individual Variations */}
                    <div className="space-y-2">
                        {exportProgress.map((progress, index) => (
                            <div
                                key={index}
                                className={`p-3 rounded-lg border transition-all ${
                                    progress.status === 'processing'
                                        ? 'bg-blue-500/10 border-blue-500/30'
                                        : progress.status === 'completed'
                                        ? 'bg-emerald-500/10 border-emerald-500/30'
                                        : progress.status === 'error'
                                        ? 'bg-red-500/10 border-red-500/30'
                                        : progress.status === 'queued'
                                        ? 'bg-amber-500/10 border-amber-500/30'
                                        : 'bg-slate-800/50 border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {progress.status === 'processing' ? (
                                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                        ) : progress.status === 'completed' ? (
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        ) : progress.status === 'error' ? (
                                            <AlertCircle className="w-4 h-4 text-red-400" />
                                        ) : progress.status === 'queued' ? (
                                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                        ) : (
                                            <Film className="w-4 h-4 text-slate-500" />
                                        )}
                                        
                                        {/* Editable name - only when idle */}
                                        {exportPhase === 'idle' ? (
                                            editingNameIndex === index ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        ref={nameInputRef}
                                                        type="text"
                                                        value={editingNameValue}
                                                        onChange={(e) => setEditingNameValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveNameEdit();
                                                            if (e.key === 'Escape') cancelNameEdit();
                                                        }}
                                                        onBlur={saveNameEdit}
                                                        className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-purple-500 w-32"
                                                        maxLength={30}
                                                    />
                                                    <button
                                                        onClick={saveNameEdit}
                                                        className="p-1 hover:bg-slate-700 rounded text-emerald-400"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => startEditingName(index)}
                                                    className="group flex items-center gap-1.5 hover:bg-slate-700/50 rounded px-1.5 py-0.5 -ml-1.5"
                                                >
                                                    <span className="text-sm text-slate-300">
                                                        {variationNames[index] || `Variation ${index + 1}`}
                                                    </span>
                                                    <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            )
                                        ) : (
                                            <span className="text-sm text-slate-300">
                                                {variationNames[index] || `Variation ${index + 1}`}
                                            </span>
                                        )}
                                        
                                        {progress.status === 'queued' && (
                                            <span className="text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                                                Queued
                                            </span>
                                        )}
                                    </div>
                                    
                                    {progress.status === 'processing' && (
                                        <span className="text-xs font-mono text-blue-400">
                                            {progress.progress}%
                                        </span>
                                    )}
                                    
                                    {progress.status === 'completed' && progress.downloadUrl && (
                                        <a
                                            href={progress.downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={`variation_${index + 1}.mp4`}
                                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download
                                        </a>
                                    )}
                                </div>
                                
                                {progress.status === 'processing' && (
                                    <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500 transition-all duration-300"
                                            style={{ width: `${progress.progress}%` }}
                                        />
                                    </div>
                                )}
                                
                                {progress.status === 'queued' && (
                                    <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500/50 w-full animate-pulse" />
                                    </div>
                                )}
                                
                                {progress.status === 'error' && progress.error && (
                                    <p className="mt-1 text-xs text-red-400">{progress.error}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Footer */}
                <div className="p-6 border-t border-slate-800">
                    {!isExporting && completedCount === 0 ? (
                        <button
                            onClick={startBatchExport}
                            disabled={isSubmitting}
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <Cloud className="w-5 h-5" />
                                    Start Cloud Export
                                </>
                            )}
                        </button>
                    ) : isExporting ? (
                        <div className="space-y-3">
                            <button
                                disabled
                                className="w-full py-3 bg-slate-700 text-slate-400 font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                            >
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Rendering on Cloud...
                            </button>
                            <p className="text-xs text-center text-slate-500">
                                You can close this modal - exports will continue in the background
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {completedCount > 1 && (
                                <button
                                    onClick={downloadAll}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download className="w-5 h-5" />
                                    Download All ({completedCount})
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-5 h-5" />
                                Done ({completedCount} exported)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
    
    return createPortal(modalContent, document.body);
}
