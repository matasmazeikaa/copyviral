'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { RenderJobStatusResponse } from '@/app/types/render';
import { toast } from 'react-hot-toast';
import { createPortal } from 'react-dom';
import {
    Video,
    Download,
    Trash2,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Film,
    Sparkles,
    X,
    HardDrive,
    Calendar,
    Play,
    ChevronDown,
    ChevronUp,
    Square,
    CheckSquare,
    Folder,
    FolderOpen,
    ArrowLeft,
    Crown,
} from 'lucide-react';
import { checkStorageLimit, formatBytes, StorageLimitInfo } from '@/app/services/subscriptionService';

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
        }
        return `${diffHours}h ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
}

// Animated progress bar component
function ProgressBar({ progress }: { progress: number }) {
    return (
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${progress}%` }}
            >
                <div className="absolute inset-0 bg-white/20 animate-progress-shimmer" />
            </div>
        </div>
    );
}

// Video Preview Modal
function VideoPreviewModal({
    isOpen,
    onClose,
    downloadUrl,
    title,
}: {
    isOpen: boolean;
    onClose: () => void;
    downloadUrl: string;
    title: string;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    useEffect(() => {
        if (isOpen && videoRef.current) {
            videoRef.current.play();
        }
    }, [isOpen]);
    
    if (!isOpen || !mounted) return null;
    
    return createPortal(
        <div 
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-8"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-medium text-sm">{title}</span>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Video container with border showing exact output */}
                <div className="relative rounded-lg overflow-hidden border-2 border-slate-600 bg-black flex-1 min-h-0">
                    <video
                        ref={videoRef}
                        src={downloadUrl}
                        className="w-full h-full max-h-[calc(80vh-80px)] object-contain"
                        controls
                        autoPlay
                        playsInline
                    />
                </div>
            </div>
        </div>,
        document.body
    );
}

// Video thumbnail component - displays actual thumbnail if available, otherwise placeholder
function VideoThumbnail({ 
    className = "",
    onClick,
    isSelected,
    onSelect,
    showCheckbox,
    thumbnailUrl,
}: { 
    downloadUrl: string; 
    className?: string;
    onClick?: () => void;
    isSelected?: boolean;
    onSelect?: () => void;
    showCheckbox?: boolean;
    thumbnailUrl?: string;
}) {
    // Default to 9:16 vertical aspect ratio (most common for short videos)
    const aspectRatio = 9/16;
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    // In selection mode, clicking the thumbnail should toggle selection, not preview
    const handleClick = () => {
        if (showCheckbox && onSelect) {
            onSelect();
        } else if (onClick) {
            onClick();
        }
    };

    const hasThumbnail = thumbnailUrl && !imageError;

    return (
        <div 
            className={`relative overflow-hidden cursor-pointer group ${className}`}
            style={{ aspectRatio: `${aspectRatio}` }}
            onClick={handleClick}
        >
            {/* Actual thumbnail image */}
            {hasThumbnail && (
                <img
                    src={thumbnailUrl}
                    alt="Video thumbnail"
                    className={`absolute inset-0 w-full h-full object-cover rounded-md transition-opacity duration-300 ${
                        imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                />
            )}
            
            {/* Gradient placeholder background - shown when no thumbnail or loading */}
            {(!hasThumbnail || !imageLoaded) && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-md">
                    {/* Decorative pattern */}
                    <div className="absolute inset-0 opacity-30">
                        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-purple-500/20 rounded-full blur-2xl" />
                        <div className="absolute bottom-1/4 right-1/4 w-1/3 h-1/3 bg-pink-500/20 rounded-full blur-xl" />
                    </div>
                </div>
            )}
            
            {/* Video border frame */}
            <div className="absolute inset-0 border-2 border-slate-600 group-hover:border-purple-500/50 rounded-md z-10 pointer-events-none transition-colors" />
            
            {/* Hover overlay for better contrast on thumbnails */}
            {hasThumbnail && imageLoaded && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors z-10 pointer-events-none" />
            )}
            
            {/* Center play button - always visible */}
            <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg group-hover:scale-110 ${
                    hasThumbnail && imageLoaded
                        ? 'bg-black/60 group-hover:bg-purple-600'
                        : 'bg-purple-600/80 group-hover:bg-purple-500'
                }`}>
                    <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                </div>
            </div>
            
            {/* "Click to preview" text */}
            <div className="absolute bottom-2 left-0 right-0 text-center z-20">
                <span className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${
                    hasThumbnail && imageLoaded ? 'text-white drop-shadow-lg' : 'text-slate-400'
                }`}>
                    Click to preview
                </span>
            </div>
            
            {/* Selection checkbox */}
            {showCheckbox && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.();
                    }}
                    className={`absolute top-2 left-2 z-30 p-0.5 rounded transition-all ${
                        isSelected 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'
                    }`}
                >
                    {isSelected ? (
                        <CheckSquare className="w-5 h-5" />
                    ) : (
                        <Square className="w-5 h-5" />
                    )}
                </button>
            )}
        </div>
    );
}

// Render card component for in-progress renders
function InProgressRenderCard({ 
    render, 
    onDelete 
}: { 
    render: RenderJobStatusResponse; 
    onDelete: (id: string) => void;
}) {
    const isQueued = render.status === 'queued';
    
    return (
        <div className="relative group">
            {/* Animated border for processing */}
            <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-xl opacity-50 blur-[1px] animate-gradient-x" 
                style={{ backgroundSize: '200% 200%' }}
            />
            
            <div className="relative bg-slate-900 rounded-xl p-3 border border-transparent">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/30 to-pink-600/30 border border-purple-500/30 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-white">
                                {isQueued ? 'Queued' : 'Rendering...'}
                            </h3>
                            <p className="text-xs text-slate-400">
                                {isQueued ? 'Starting soon' : `${render.progress}%`}
                            </p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => onDelete(render.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                        title="Cancel"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
                
                <ProgressBar progress={render.progress} />
            </div>
        </div>
    );
}

// Compact render card for completed videos
function CompletedRenderCard({ 
    render, 
    onDelete,
    isDeleting,
    onPreview,
    isSelected,
    onSelect,
    showCheckbox,
}: { 
    render: RenderJobStatusResponse; 
    onDelete: (id: string) => void;
    isDeleting: boolean;
    onPreview: () => void;
    isSelected: boolean;
    onSelect: () => void;
    showCheckbox: boolean;
}) {
    const thumbnailUrl = render.thumbnailUrl;
    
    // Debug: log thumbnail URL
    console.log(`[Video ${render.id}] thumbnailUrl:`, thumbnailUrl);
    const [isDownloading, setIsDownloading] = useState(false);
    
    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!render.downloadUrl || isDownloading) return;
        
        setIsDownloading(true);
        
        try {
            const response = await fetch(render.downloadUrl);
            if (!response.ok) throw new Error('Failed to fetch video');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `video-${(render.batchIndex ?? 0) + 1}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (error) {
            console.error('Download error:', error);
            // Fallback: open in new tab
            window.open(render.downloadUrl, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };
    
    return (
        <div className="group bg-slate-900/60 backdrop-blur border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 hover:bg-slate-900/80 transition-all duration-200">
            {/* Video Thumbnail with accurate aspect ratio */}
            <div className="relative p-2">
                {render.downloadUrl ? (
                    <VideoThumbnail 
                        downloadUrl={render.downloadUrl} 
                        thumbnailUrl={thumbnailUrl}
                        className="w-full"
                        onClick={onPreview}
                        isSelected={isSelected}
                        onSelect={onSelect}
                        showCheckbox={showCheckbox}
                    />
                ) : (
                    <div className="w-full aspect-video rounded-md flex items-center justify-center bg-gradient-to-br from-purple-600/20 to-pink-600/20 border-2 border-slate-600">
                        <Video className="w-8 h-8 text-purple-400" />
                    </div>
                )}
            </div>
            
            {/* Info */}
            <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">
                        {render.batchIndex !== undefined && render.batchIndex !== null 
                            ? `Video #${render.batchIndex + 1}`
                            : 'Video'
                        }
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                    </span>
                </div>
                
                {/* Meta info */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{formatDate(render.createdAt)}</span>
                    {render.fileSizeBytes && (
                        <>
                            <span>•</span>
                            <span>{formatFileSize(render.fileSizeBytes)}</span>
                        </>
                    )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1">
                    {render.downloadUrl && (
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-purple-600/50 disabled:to-pink-600/50 text-white text-xs font-medium rounded-lg transition-all"
                        >
                            {isDownloading ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Downloading...
                                </>
                            ) : (
                                <>
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                </>
                            )}
                        </button>
                    )}
                    <button
                        onClick={() => onDelete(render.id)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all disabled:opacity-50"
                        title="Delete"
                    >
                        {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Failed render card component
function FailedRenderCard({ 
    render, 
    onDelete,
    isDeleting
}: { 
    render: RenderJobStatusResponse; 
    onDelete: (id: string) => void;
    isDeleting: boolean;
}) {
    return (
        <div className="group bg-slate-900/50 backdrop-blur border border-red-900/30 rounded-xl overflow-hidden hover:border-red-800/50 transition-all duration-200">
            {/* Error Icon */}
            <div className="relative p-2">
                <div className="w-full aspect-video rounded-md flex items-center justify-center bg-red-500/10 border-2 border-red-900/50">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
            </div>
            
            {/* Info */}
            <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">
                        {render.batchIndex !== undefined && render.batchIndex !== null 
                            ? `Video #${render.batchIndex + 1}`
                            : 'Failed'
                        }
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        Error
                    </span>
                </div>
                
                {render.errorMessage && (
                    <p className="text-[10px] text-red-400 line-clamp-1">
                        {render.errorMessage}
                    </p>
                )}
                
                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1">
                    <button
                        onClick={() => onDelete(render.id)}
                        disabled={isDeleting}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 text-xs font-medium rounded-lg transition-all"
                    >
                        {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <>
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Type for grouped batches
interface VideoBatch {
    batchId: string | null;
    renders: RenderJobStatusResponse[];
    createdAt: string;
}

// Group renders by batch
function groupRendersByBatch(renders: RenderJobStatusResponse[]): VideoBatch[] {
    const batchMap = new Map<string, RenderJobStatusResponse[]>();
    const singleVideos: RenderJobStatusResponse[] = [];
    
    // Group by batchId
    renders.forEach(render => {
        if (render.batchId) {
            const existing = batchMap.get(render.batchId) || [];
            existing.push(render);
            batchMap.set(render.batchId, existing);
        } else {
            // No batchId - treat as single video
            singleVideos.push(render);
        }
    });
    
    const batches: VideoBatch[] = [];
    
    // Process grouped batches
    batchMap.forEach((batchRenders, batchId) => {
        // Sort renders within batch by batchIndex
        batchRenders.sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
        batches.push({
            batchId,
            renders: batchRenders,
            createdAt: batchRenders[0].createdAt,
        });
    });
    
    // Add single videos (no batchId) as individual batches
    singleVideos.forEach(render => {
        batches.push({
            batchId: null,
            renders: [render],
            createdAt: render.createdAt,
        });
    });
    
    // Sort batches by creation date (newest first)
    batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return batches;
}

// Folder card component - displays as a card in the grid
function FolderCard({
    batch,
    onClick,
    isSelected,
    onSelect,
    showCheckbox,
}: {
    batch: VideoBatch;
    onClick: () => void;
    isSelected: boolean;
    onSelect: () => void;
    showCheckbox: boolean;
}) {
    // Get first 4 thumbnails for preview grid
    const previewThumbnails = batch.renders.slice(0, 4);
    const totalSize = batch.renders.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0);
    
    return (
        <div 
            className="group bg-slate-900/60 backdrop-blur border border-slate-700/50 rounded-xl overflow-hidden hover:border-purple-500/50 hover:bg-slate-900/80 transition-all duration-200 cursor-pointer"
            onClick={onClick}
        >
            {/* Thumbnail grid preview */}
            <div className="relative p-2">
                <div className="relative w-full rounded-md overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" style={{ aspectRatio: '9/16' }}>
                    {/* 2x2 thumbnail grid */}
                    <div className="absolute inset-1 grid grid-cols-2 gap-0.5 rounded overflow-hidden">
                        {previewThumbnails.map((render, idx) => (
                            <div key={render.id} className="relative bg-slate-800 overflow-hidden">
                                {render.thumbnailUrl ? (
                                    <img 
                                        src={render.thumbnailUrl} 
                                        alt="" 
                                        className="w-full h-full object-cover opacity-80"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-purple-600/20 to-pink-600/20 flex items-center justify-center">
                                        <Video className="w-3 h-3 text-purple-400/50" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {/* Fill empty slots if less than 4 videos */}
                        {Array.from({ length: Math.max(0, 4 - previewThumbnails.length) }).map((_, idx) => (
                            <div key={`empty-${idx}`} className="bg-slate-800/50" />
                        ))}
                    </div>
                    
                    {/* Folder overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    
                    {/* Folder icon */}
                    <div className="absolute bottom-2 left-2 w-8 h-8 rounded-lg bg-purple-600/90 flex items-center justify-center shadow-lg">
                        <Folder className="w-4 h-4 text-white" />
                    </div>
                    
                    {/* Video count badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-medium text-white">
                        {batch.renders.length} videos
                    </div>
                </div>
                
                {/* Border */}
                <div className="absolute inset-2 border-2 border-slate-600 group-hover:border-purple-500/50 rounded-md pointer-events-none transition-colors" />
                
                {/* Selection checkbox */}
                {showCheckbox && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect();
                        }}
                        className={`absolute top-4 left-4 z-30 p-0.5 rounded transition-all ${
                            isSelected 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'
                        }`}
                    >
                        {isSelected ? (
                            <CheckSquare className="w-5 h-5" />
                        ) : (
                            <Square className="w-5 h-5" />
                        )}
                    </button>
                )}
            </div>
            
            {/* Info */}
            <div className="px-3 pb-3 space-y-1">
                <span className="text-xs font-medium text-white truncate block">
                    Batch Export
                </span>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{formatDate(batch.createdAt)}</span>
                    {totalSize > 0 && (
                        <>
                            <span>•</span>
                            <span>{formatFileSize(totalSize)}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Open folder view - shows contents of a batch
function OpenFolderView({
    batch,
    onClose,
    onDelete,
    deletingId,
    onPreview,
    selectedIds,
    onToggleSelection,
    showCheckbox,
    onSelectBatch,
    onDeselectBatch,
}: {
    batch: VideoBatch;
    onClose: () => void;
    onDelete: (id: string) => void;
    deletingId: string | null;
    onPreview: (render: RenderJobStatusResponse) => void;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    showCheckbox: boolean;
    onSelectBatch: (ids: string[]) => void;
    onDeselectBatch: (ids: string[]) => void;
}) {
    const renderIds = batch.renders.map(r => r.id);
    const selectedCount = renderIds.filter(id => selectedIds.has(id)).length;
    const allSelected = selectedCount === batch.renders.length;
    const totalSize = batch.renders.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0);
    
    const handleSelectAll = () => {
        if (allSelected) {
            onDeselectBatch(renderIds);
        } else {
            onSelectBatch(renderIds);
        }
    };
    
    return (
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden">
            {/* Folder header with back button */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
                <button
                    onClick={onClose}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Back to all videos"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/30 to-pink-600/30 border border-purple-500/30 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-purple-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                            Batch Export
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300 rounded">
                            {batch.renders.length} videos
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{formatDate(batch.createdAt)}</span>
                        {totalSize > 0 && (
                            <>
                                <span>•</span>
                                <span>{formatFileSize(totalSize)}</span>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Select all in folder */}
                {showCheckbox && (
                    <button
                        onClick={handleSelectAll}
                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                )}
            </div>
            
            {/* Videos grid */}
            <div className="p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {batch.renders.map((render) => (
                        <CompletedRenderCard
                            key={render.id}
                            render={render}
                            onDelete={onDelete}
                            isDeleting={deletingId === render.id}
                            onPreview={() => onPreview(render)}
                            isSelected={selectedIds.has(render.id)}
                            onSelect={() => onToggleSelection(render.id)}
                            showCheckbox={showCheckbox}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// Delete confirmation modal
function DeleteConfirmModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    isDeleting,
    count = 1,
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: () => void;
    isDeleting: boolean;
    count?: number;
}) {
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    if (!isOpen || !mounted) return null;
    
    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div 
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                        <Trash2 className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">
                            Delete {count > 1 ? `${count} Videos` : 'Video'}
                        </h3>
                        <p className="text-sm text-slate-400">This action cannot be undone</p>
                    </div>
                </div>
                
                <p className="text-slate-300 mb-6">
                    Are you sure you want to delete {count > 1 ? 'these videos' : 'this video'}? 
                    The {count > 1 ? 'files' : 'file'} will be permanently removed.
                </p>
                
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function RendersPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [renders, setRenders] = useState<RenderJobStatusResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [showFailed, setShowFailed] = useState(false);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    
    // Preview state
    const [previewRender, setPreviewRender] = useState<RenderJobStatusResponse | null>(null);
    
    // Open folder state - tracks which batch folder is currently open
    const [openBatchId, setOpenBatchId] = useState<string | null>(null);
    
    // Storage usage state
    const [storageInfo, setStorageInfo] = useState<StorageLimitInfo | null>(null);
    
    // Track active render IDs to detect when renders complete
    const activeRenderIdsRef = useRef<Set<string>>(new Set());
    // Track renders state for polling check without causing re-renders
    const rendersRef = useRef<RenderJobStatusResponse[]>([]);
    
    // Keep ref in sync with state
    useEffect(() => {
        rendersRef.current = renders;
        activeRenderIdsRef.current = new Set(
            renders.filter(r => r.status === 'queued' || r.status === 'processing').map(r => r.id)
        );
    }, [renders]);
    
    // Fetch storage usage info
    const fetchStorageInfo = useCallback(async () => {
        try {
            const info = await checkStorageLimit();
            setStorageInfo(info);
        } catch (error) {
            console.error('Error fetching storage info:', error);
        }
    }, []);
    
    // Fetch all renders (initial load)
    const fetchAllRenders = useCallback(async () => {
        try {
            const response = await fetch('/api/renders');
            if (!response.ok) {
                if (response.status === 401) {
                    router.push('/login');
                    return;
                }
                throw new Error('Failed to fetch renders');
            }
            const data: RenderJobStatusResponse[] = await response.json();
            setRenders(data);
        } catch (error) {
            console.error('Error fetching renders:', error);
            toast.error('Failed to load videos');
        } finally {
            setIsLoading(false);
        }
    }, [router]);
    
    // Fetch only active renders (for polling) and merge with existing state
    const fetchActiveRenders = useCallback(async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/renders?status=queued,processing');
            if (!response.ok) {
                if (response.status === 401) {
                    router.push('/login');
                    return false;
                }
                throw new Error('Failed to fetch active renders');
            }
            const activeRenders: RenderJobStatusResponse[] = await response.json();
            
            // Check if any previously active renders have completed
            const previouslyActiveIds = activeRenderIdsRef.current;
            const stillActiveIds = new Set(activeRenders.map(r => r.id));
            const someCompleted = Array.from(previouslyActiveIds).some(id => !stillActiveIds.has(id));
            
            // Merge active renders with existing state
            setRenders(current => {
                const renderMap = new Map(current.map(r => [r.id, r]));
                activeRenders.forEach(activeRender => {
                    renderMap.set(activeRender.id, activeRender);
                });
                return Array.from(renderMap.values())
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            });
            
            return someCompleted;
        } catch (error) {
            console.error('Error fetching active renders:', error);
            return false;
        }
    }, [router]);
    
    // Initial fetch and polling for in-progress renders
    useEffect(() => {
        if (authLoading) return;
        
        if (!user) {
            router.push('/login');
            return;
        }
        
        // Initial load: fetch all renders and storage info
        fetchAllRenders();
        fetchStorageInfo();
        
        // Set up polling for active renders only
        pollIntervalRef.current = setInterval(async () => {
            // Check if there are active renders using ref (no state update)
            const hasActiveRenders = rendersRef.current.some(
                r => r.status === 'queued' || r.status === 'processing'
            );
            
            if (hasActiveRenders) {
                // Fetch active renders and check if any completed
                const someCompleted = await fetchActiveRenders();
                
                // If some renders completed, do a full refresh to get signed URLs
                if (someCompleted) {
                    fetchAllRenders();
                }
            }
        }, 3000);
        
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [user, authLoading, router, fetchAllRenders, fetchActiveRenders, fetchStorageInfo]);
    
    // Handle delete
    const handleDeleteClick = (id: string) => {
        setPendingDeleteId(id);
        setDeleteModalOpen(true);
    };
    
    const handleDeleteConfirm = async () => {
        if (!pendingDeleteId) return;
        
        setDeletingId(pendingDeleteId);
        
        try {
            const response = await fetch(`/api/renders/${pendingDeleteId}`, {
                method: 'DELETE',
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete render');
            }
            
            setRenders(current => current.filter(r => r.id !== pendingDeleteId));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(pendingDeleteId);
                return next;
            });
            toast.success('Video deleted');
            fetchStorageInfo(); // Refresh storage usage
        } catch (error) {
            console.error('Error deleting render:', error);
            toast.error('Failed to delete video');
        } finally {
            setDeletingId(null);
            setDeleteModalOpen(false);
            setPendingDeleteId(null);
        }
    };
    
    // State for zip download progress
    const [isCreatingZip, setIsCreatingZip] = useState(false);
    
    // State for multi-delete
    const [isMultiDeleting, setIsMultiDeleting] = useState(false);
    const [pendingMultiDelete, setPendingMultiDelete] = useState(false);
    
    // Handle multi-download - use server-side ZIP endpoint
    const handleMultiDownload = async () => {
        const selectedRenders = completedRenders.filter(r => selectedIds.has(r.id) && r.downloadUrl);
        
        if (selectedRenders.length === 0) {
            toast.error('No videos selected');
            return;
        }
        
        // Single video - force download with anchor click
        if (selectedRenders.length === 1) {
            const r = selectedRenders[0];
            const a = document.createElement('a');
            a.href = r.downloadUrl!;
            a.download = `video-${(r.batchIndex ?? 0) + 1}.mp4`;
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            return;
        }
        
        // Multiple videos - use server-side ZIP endpoint
        setIsCreatingZip(true);
        
        try {
            const renderIds = selectedRenders.map(r => r.id);
            
            const response = await fetch('/api/renders/zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ renderIds }),
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create ZIP');
            }
            
            // Get the ZIP blob and download it
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `videos-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            // Delay revoke to ensure download starts
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            
            toast.success(`Downloaded ${selectedRenders.length} videos as ZIP!`);
        } catch (error) {
            console.error('Error creating zip:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to create ZIP file');
        } finally {
            setIsCreatingZip(false);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
        }
    };
    
    // Handle multi-delete click - opens confirmation modal
    const handleMultiDeleteClick = () => {
        if (selectedIds.size === 0) {
            toast.error('No videos selected');
            return;
        }
        setPendingMultiDelete(true);
        setDeleteModalOpen(true);
    };
    
    // Handle multi-delete confirmation
    const handleMultiDeleteConfirm = async () => {
        if (selectedIds.size === 0) return;
        
        setIsMultiDeleting(true);
        
        try {
            const response = await fetch('/api/renders', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete videos');
            }
            
            const result = await response.json();
            
            // Remove deleted renders from state
            setRenders(current => current.filter(r => !selectedIds.has(r.id)));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            
            toast.success(`Deleted ${result.deletedCount} video${result.deletedCount > 1 ? 's' : ''}`);
            fetchStorageInfo(); // Refresh storage usage
        } catch (error) {
            console.error('Error deleting videos:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to delete videos');
        } finally {
            setIsMultiDeleting(false);
            setDeleteModalOpen(false);
            setPendingMultiDelete(false);
        }
    };
    
    // Toggle selection
    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };
    
    // Select all completed
    const selectAll = () => {
        setSelectedIds(new Set(completedRenders.map(r => r.id)));
    };
    
    // Deselect all
    const deselectAll = () => {
        setSelectedIds(new Set());
    };
    
    // Separate renders by status
    const inProgressRenders = renders.filter(r => r.status === 'queued' || r.status === 'processing');
    const completedRenders = renders.filter(r => r.status === 'completed');
    const failedRenders = renders.filter(r => r.status === 'failed');
    
    // Group completed renders by batch
    const completedBatches = groupRendersByBatch(completedRenders);
    
    // Batch selection helpers
    const selectBatch = (ids: string[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        });
    };
    
    const deselectBatch = (ids: string[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
        });
    };
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] lg:w-[800px] h-[200px] sm:h-[250px] lg:h-[300px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
                        <Video className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-medium text-purple-300">Your Exports</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        My <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Videos</span>
                    </h1>
                    <p className="text-sm text-slate-400 mb-4">
                        View, preview and download your rendered videos
                    </p>
                    
                    {/* Storage Usage Indicator */}
                    {storageInfo && (
                        <div className="inline-flex items-center gap-3 px-4 py-2.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                            <HardDrive className="w-4 h-4 text-slate-400" />
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">
                                        {formatBytes(storageInfo.usedBytes)} / {formatBytes(storageInfo.limitBytes)}
                                    </span>
                                    {storageInfo.isPremium ? (
                                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            <Crown className="w-3 h-3" />
                                            Pro
                                        </span>
                                    ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                            Free
                                        </span>
                                    )}
                                </div>
                                <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            storageInfo.usagePercentage > 90 
                                                ? 'bg-red-500' 
                                                : storageInfo.usagePercentage > 70 
                                                    ? 'bg-amber-500' 
                                                    : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${Math.min(100, storageInfo.usagePercentage)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Loading state */}
                {(authLoading || isLoading) ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
                        <p className="text-slate-400 text-sm">{authLoading ? 'Checking authentication...' : 'Loading videos...'}</p>
                    </div>
                ) : (inProgressRenders.length === 0 && completedRenders.length === 0 && failedRenders.length === 0) ? (
                    /* Empty state */
                    <div className="text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
                            <Film className="w-8 h-8 text-slate-600" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">No videos yet</h3>
                        <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">
                            When you export videos, they&apos;ll appear here.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-500/25 text-sm"
                        >
                            <Sparkles className="w-4 h-4" />
                            Create Video
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* In-progress renders section */}
                        {inProgressRenders.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                                    <h2 className="text-sm font-semibold text-white">
                                        Rendering ({inProgressRenders.length})
                                    </h2>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {inProgressRenders.map((render) => (
                                        <InProgressRenderCard
                                            key={render.id}
                                            render={render}
                                            onDelete={handleDeleteClick}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                        
                        {/* Completed renders section */}
                        {completedRenders.length > 0 && (
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        <h2 className="text-sm font-semibold text-white">
                                            Ready ({completedRenders.length})
                                        </h2>
                                    </div>
                                    
                                    {/* Selection controls */}
                                    <div className="flex items-center gap-2">
                                        {isSelectionMode ? (
                                            <>
                                                <span className="text-xs text-slate-400">
                                                    {selectedIds.size} selected
                                                </span>
                                                <button
                                                    onClick={selectedIds.size === completedRenders.length ? deselectAll : selectAll}
                                                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                                                >
                                                    {selectedIds.size === completedRenders.length ? 'Deselect all' : 'Select all'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setIsSelectionMode(false);
                                                        setSelectedIds(new Set());
                                                    }}
                                                    className="text-xs text-slate-400 hover:text-white transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                {selectedIds.size > 0 && (
                                                    <>
                                                        <button
                                                            onClick={handleMultiDeleteClick}
                                                            disabled={isMultiDeleting}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg transition-all border border-red-600/30"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Delete ({selectedIds.size})
                                                        </button>
                                                        <button
                                                            onClick={handleMultiDownload}
                                                            disabled={isCreatingZip}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-purple-600/50 disabled:to-pink-600/50 text-white text-xs font-medium rounded-lg transition-all"
                                                        >
                                                            {isCreatingZip ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    Creating ZIP...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Download className="w-3.5 h-3.5" />
                                                                    Download ({selectedIds.size})
                                                                </>
                                                            )}
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setIsSelectionMode(true)}
                                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-all"
                                            >
                                                <CheckSquare className="w-3.5 h-3.5" />
                                                Select
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Display batches */}
                                {(() => {
                                    // Check if a folder is currently open
                                    const openBatch = openBatchId 
                                        ? completedBatches.find(b => b.batchId === openBatchId)
                                        : null;
                                    
                                    if (openBatch) {
                                        // Show open folder view
                                        return (
                                            <OpenFolderView
                                                batch={openBatch}
                                                onClose={() => setOpenBatchId(null)}
                                                onDelete={handleDeleteClick}
                                                deletingId={deletingId}
                                                onPreview={setPreviewRender}
                                                selectedIds={selectedIds}
                                                onToggleSelection={toggleSelection}
                                                showCheckbox={isSelectionMode}
                                                onSelectBatch={selectBatch}
                                                onDeselectBatch={deselectBatch}
                                            />
                                        );
                                    }
                                    
                                    // Show grid of folders and single videos
                                    return (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                            {completedBatches.map((batch) => {
                                                // Single video - display as video card
                                                if (batch.renders.length === 1) {
                                                    const render = batch.renders[0];
                                                    return (
                                                        <CompletedRenderCard
                                                            key={batch.batchId || render.id}
                                                            render={render}
                                                            onDelete={handleDeleteClick}
                                                            isDeleting={deletingId === render.id}
                                                            onPreview={() => setPreviewRender(render)}
                                                            isSelected={selectedIds.has(render.id)}
                                                            onSelect={() => toggleSelection(render.id)}
                                                            showCheckbox={isSelectionMode}
                                                        />
                                                    );
                                                }
                                                
                                                // Multiple videos - display as folder card
                                                const renderIds = batch.renders.map(r => r.id);
                                                const allSelected = renderIds.every(id => selectedIds.has(id));
                                                
                                                return (
                                                    <FolderCard
                                                        key={batch.batchId!}
                                                        batch={batch}
                                                        onClick={() => setOpenBatchId(batch.batchId)}
                                                        isSelected={allSelected}
                                                        onSelect={() => {
                                                            if (allSelected) {
                                                                deselectBatch(renderIds);
                                                            } else {
                                                                selectBatch(renderIds);
                                                            }
                                                        }}
                                                        showCheckbox={isSelectionMode}
                                                    />
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </section>
                        )}
                        
                        {/* Failed renders section - collapsible */}
                        {failedRenders.length > 0 && (
                            <section>
                                <button
                                    onClick={() => setShowFailed(!showFailed)}
                                    className="flex items-center gap-2 mb-3 group"
                                >
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                    <h2 className="text-sm font-semibold text-slate-400 group-hover:text-white transition-colors">
                                        Failed ({failedRenders.length})
                                    </h2>
                                    {showFailed ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                    ) : (
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                    )}
                                </button>
                                
                                {showFailed && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {failedRenders.map((render) => (
                                            <FailedRenderCard
                                                key={render.id}
                                                render={render}
                                                onDelete={handleDeleteClick}
                                                isDeleting={deletingId === render.id}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </div>
            
            {/* Delete confirmation modal */}
            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false);
                    setPendingDeleteId(null);
                    setPendingMultiDelete(false);
                }}
                onConfirm={pendingMultiDelete ? handleMultiDeleteConfirm : handleDeleteConfirm}
                isDeleting={pendingMultiDelete ? isMultiDeleting : deletingId !== null}
                count={pendingMultiDelete ? selectedIds.size : 1}
            />
            
            {/* Video preview modal */}
            {previewRender && previewRender.downloadUrl && (
                <VideoPreviewModal
                    isOpen={true}
                    onClose={() => setPreviewRender(null)}
                    downloadUrl={previewRender.downloadUrl}
                    title={previewRender.batchIndex !== undefined 
                        ? `Video #${previewRender.batchIndex + 1}` 
                        : 'Video Preview'
                    }
                />
            )}
        </div>
    );
}
