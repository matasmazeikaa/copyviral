"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { LibraryItem, MediaType } from "@/app/types";
import { listUserMediaFiles, deleteMediaFile } from "@/app/services/mediaLibraryService";
import { useAuth } from "@/app/contexts/AuthContext";
import { X, Loader2, Upload, CheckCircle, XCircle, Film, Image as ImageIcon, Music, Trash2, HardDrive, Crown } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/app/utils/supabase/client";
import { categorizeFile } from "@/app/utils/utils";
import { checkStorageLimit, validateUpload, formatBytes, StorageLimitInfo } from "@/app/services/subscriptionService";

type LibraryType = 'media' | 'audio';

interface LibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddToTimeline: (items: LibraryItem[]) => void;
    type: LibraryType;
}

interface UploadingFile {
    id: string;
    file: File;
    name: string;
    progress: number;
    status: 'uploading' | 'completed' | 'error';
    type: MediaType;
    error?: string;
}

const STORAGE_BUCKET = 'media-library';
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

const CONFIG = {
    media: {
        title: 'Media Library',
        accept: 'video/*,image/*',
        emptyMessage: 'No media files yet',
        emptySubMessage: 'Upload videos and images to get started',
        emptyIcon: Film,
        filterFn: (item: LibraryItem) => item.type !== 'audio',
    },
    audio: {
        title: 'Audio Library',
        accept: 'audio/*',
        emptyMessage: 'No audio files yet',
        emptySubMessage: 'Upload audio files to get started',
        emptyIcon: Music,
        filterFn: (item: LibraryItem) => item.type === 'audio',
    },
};

export function LibraryModal({ isOpen, onClose, onAddToTimeline, type }: LibraryModalProps) {
    const { user } = useAuth();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
    const [isDeletingSelected, setIsDeletingSelected] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageLimitInfo | null>(null);
    const [mounted, setMounted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Mount check for portal
    useEffect(() => {
        setMounted(true);
    }, []);

    const config = CONFIG[type];
    const usagePercentage = storageInfo ? Math.min((storageInfo.usedBytes / storageInfo.limitBytes) * 100, 100) : 0;

    useEffect(() => {
        if (isOpen && user) {
            loadLibraryItems();
            loadStorageInfo();
        }
    }, [isOpen, user]);

    const loadStorageInfo = async () => {
        if (!user) return;
        try {
            // Get storage info from backend (includes subscription status)
            const info = await checkStorageLimit();
            setStorageInfo(info);
        } catch (error) {
            console.error('Error loading storage info:', error);
        }
    };

    // Clean up completed uploads after a delay
    useEffect(() => {
        const completedUploads = uploadingFiles.filter(f => f.status === 'completed');
        if (completedUploads.length > 0) {
            const timer = setTimeout(() => {
                setUploadingFiles(prev => prev.filter(f => f.status !== 'completed'));
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [uploadingFiles]);

    const loadLibraryItems = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const libraryItems = await listUserMediaFiles(user.id);
            const filteredItems = libraryItems.filter(config.filterFn);
            setItems(filteredItems);
        } catch (error) {
            console.error('Error loading library items:', error);
            toast.error('Failed to load library items');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelection = (itemId: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedItems(newSelected);
    };

    const [isAddingToTimeline, setIsAddingToTimeline] = useState(false);

    const handleAdd = () => {
        const selected = items.filter(item => selectedItems.has(item.id));
        if (selected.length === 0) {
            toast.error('Please select at least one item');
            return;
        }
        setIsAddingToTimeline(true);
        // Small delay to show the button state change before modal closes
        setTimeout(() => {
            onAddToTimeline(selected);
            setSelectedItems(new Set());
            setIsAddingToTimeline(false);
            onClose();
        }, 100);
    };

    const uploadFileWithProgress = useCallback(async (
        file: File,
        uploadId: string,
        userId: string
    ): Promise<LibraryItem | null> => {
        const supabase = createClient();
        const userFolder = userId;
        const fileId = crypto.randomUUID();
        const fileExt = file.name.split('.').pop() || 'mp4';
        // Encode original filename (without extension) in the storage path for reliable retrieval
        const originalNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const encodedName = btoa(encodeURIComponent(originalNameWithoutExt));
        const fileName = `${fileId}--${encodedName}.${fileExt}`;
        const filePath = `${userFolder}/${fileName}`;

        // Validate upload against server-side storage limits
        try {
            const validation = await validateUpload(file.size);
            if (!validation.canUpload) {
                setUploadingFiles(prev => prev.map(f => 
                    f.id === uploadId 
                        ? { ...f, status: 'error', error: validation.error || 'Upload not allowed' }
                        : f
                ));
                return null;
            }
        } catch (validationError) {
            console.error('Upload validation error:', validationError);
            setUploadingFiles(prev => prev.map(f => 
                f.id === uploadId 
                    ? { ...f, status: 'error', error: 'Failed to validate upload' }
                    : f
            ));
            return null;
        }

        try {
            // Use XMLHttpRequest for progress tracking
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`;

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        setUploadingFiles(prev => prev.map(f => 
                            f.id === uploadId 
                                ? { ...f, progress: percentComplete }
                                : f
                        ));
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', uploadUrl);
                xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
                xhr.setRequestHeader('x-upsert', 'false');
                xhr.setRequestHeader('x-metadata', JSON.stringify({ originalName: file.name }));
                xhr.send(file);
            });

            // Get signed URL for the uploaded file
            const { data: signedUrlData, error: urlError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(filePath, 3600);

            if (urlError) {
                throw urlError;
            }

            // Update status to completed
            setUploadingFiles(prev => prev.map(f => 
                f.id === uploadId 
                    ? { ...f, status: 'completed', progress: 100 }
                    : f
            ));

            return {
                id: fileId,
                name: file.name,
                url: signedUrlData.signedUrl,
                status: 'completed',
                type: categorizeFile(file.type),
                size: file.size,
                createdAt: new Date().toISOString(),
            };
        } catch (error: any) {
            console.error('Upload error:', error);
            setUploadingFiles(prev => prev.map(f => 
                f.id === uploadId 
                    ? { ...f, status: 'error', error: error.message || 'Upload failed' }
                    : f
            ));
            return null;
        }
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (!user) {
            toast.error('You must be logged in to upload files');
            e.target.value = "";
            return;
        }

        // Create upload entries for all files
        const newUploads: UploadingFile[] = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            progress: 0,
            status: 'uploading' as const,
            type: categorizeFile(file.type),
        }));

        setUploadingFiles(prev => [...prev, ...newUploads]);
        e.target.value = "";

        // Upload all files in parallel
        const uploadPromises = newUploads.map(upload => 
            uploadFileWithProgress(upload.file, upload.id, user.id)
        );

        const results = await Promise.all(uploadPromises);
        const successCount = results.filter(r => r !== null).length;

        if (successCount > 0) {
            toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
            await loadLibraryItems();
            await loadStorageInfo(); // Refresh storage usage
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const removeUploadingFile = (uploadId: string) => {
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
    };

    const handleDeleteItem = async (e: React.MouseEvent, item: LibraryItem) => {
        e.stopPropagation();
        
        if (!user) return;
        
        setDeletingItems(prev => new Set(prev).add(item.id));
        
        try {
            await deleteMediaFile(item.id, user.id, item.name);
            setItems(prev => prev.filter(i => i.id !== item.id));
            setSelectedItems(prev => {
                const newSet = new Set(prev);
                newSet.delete(item.id);
                return newSet;
            });
            toast.success('File deleted successfully');
            await loadStorageInfo(); // Refresh storage usage
        } catch (error) {
            console.error('Error deleting file:', error);
            toast.error('Failed to delete file');
        } finally {
            setDeletingItems(prev => {
                const newSet = new Set(prev);
                newSet.delete(item.id);
                return newSet;
            });
        }
    };

    const handleDeleteSelected = async () => {
        if (!user || selectedItems.size === 0) return;
        
        setIsDeletingSelected(true);
        
        const itemsToDelete = items.filter(item => selectedItems.has(item.id));
        const deletePromises = itemsToDelete.map(item => 
            deleteMediaFile(item.id, user.id, item.name)
                .then(() => ({ id: item.id, success: true }))
                .catch(() => ({ id: item.id, success: false }))
        );
        
        try {
            const results = await Promise.all(deletePromises);
            const successfulDeletes = results.filter(r => r.success).map(r => r.id);
            const failedCount = results.filter(r => !r.success).length;
            
            if (successfulDeletes.length > 0) {
                setItems(prev => prev.filter(item => !successfulDeletes.includes(item.id)));
                setSelectedItems(new Set());
            }
            
            if (failedCount === 0) {
                toast.success(`Deleted ${successfulDeletes.length} file${successfulDeletes.length !== 1 ? 's' : ''}`);
            } else if (successfulDeletes.length > 0) {
                toast.success(`Deleted ${successfulDeletes.length} file${successfulDeletes.length !== 1 ? 's' : ''}, ${failedCount} failed`);
            } else {
                toast.error('Failed to delete files');
            }
            
            if (successfulDeletes.length > 0) {
                await loadStorageInfo(); // Refresh storage usage
            }
        } catch (error) {
            console.error('Error deleting files:', error);
            toast.error('Failed to delete files');
        } finally {
            setIsDeletingSelected(false);
        }
    };

    const getFileIcon = (itemType: MediaType) => {
        switch (itemType) {
            case 'video':
                return <Film className="w-4 h-4" />;
            case 'image':
                return <ImageIcon className="w-4 h-4" />;
            case 'audio':
                return <Music className="w-4 h-4" />;
            default:
                return <Film className="w-4 h-4" />;
        }
    };

    const renderItemPreview = (item: LibraryItem) => {
        if (item.type === 'video') {
            return (
                <video
                    src={item.url}
                    className="w-full h-full object-cover rounded-t-lg"
                    muted
                />
            );
        }
        if (item.type === 'image') {
            return (
                <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover rounded-t-lg"
                />
            );
        }
        if (item.type === 'audio') {
            return <Music className="w-12 h-12 text-slate-500" />;
        }
        return <div className="text-slate-500 text-sm">{item.type}</div>;
    };

    const isUploading = uploadingFiles.some(f => f.status === 'uploading');
    const EmptyIcon = config.emptyIcon;

    if (!isOpen || !mounted) return null;

    const modalContent = (
        <div 
            className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            style={{ zIndex: 99999 }}
        >
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl w-[calc(100%-32px)] max-w-4xl max-h-[calc(100vh-32px)] sm:max-h-[80vh] flex flex-col m-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <h2 className="text-lg sm:text-xl font-bold text-white">{config.title}</h2>
                        {/* Storage Usage Indicator - Hidden on mobile, visible on larger screens */}
                        {storageInfo && (
                            <div className="hidden sm:flex items-center gap-3 px-3 sm:px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
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
                                    <div className="w-24 lg:w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-300 ${
                                                usagePercentage > 90 
                                                    ? 'bg-red-500' 
                                                    : usagePercentage > 70 
                                                        ? 'bg-amber-500' 
                                                        : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${usagePercentage}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={handleUploadClick}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span>Upload</span>
                                </>
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={config.accept}
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Upload Progress Section */}
                {uploadingFiles.length > 0 && (
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                        <div className="flex flex-wrap gap-3">
                            {uploadingFiles.map((upload) => (
                                <div
                                    key={upload.id}
                                    className={`relative flex items-center gap-3 p-3 rounded-lg border transition-all min-w-[200px] max-w-[280px] ${
                                        upload.status === 'completed'
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : upload.status === 'error'
                                            ? 'bg-red-500/10 border-red-500/30'
                                            : 'bg-slate-800/50 border-slate-700'
                                    }`}
                                >
                                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                                        upload.status === 'completed'
                                            ? 'bg-emerald-500/20 text-emerald-400'
                                            : upload.status === 'error'
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-blue-500/20 text-blue-400'
                                    }`}>
                                        {upload.status === 'completed' ? (
                                            <CheckCircle className="w-5 h-5" />
                                        ) : upload.status === 'error' ? (
                                            <XCircle className="w-5 h-5" />
                                        ) : (
                                            getFileIcon(upload.type)
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-300 truncate font-medium" title={upload.name}>
                                            {upload.name}
                                        </p>
                                        {upload.status === 'uploading' && (
                                            <div className="mt-1.5">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] text-slate-400">Uploading</span>
                                                    <span className="text-[10px] font-mono text-blue-400">{upload.progress}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                                                        style={{ width: `${upload.progress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {upload.status === 'completed' && (
                                            <p className="text-[10px] text-emerald-400 mt-1">Complete</p>
                                        )}
                                        {upload.status === 'error' && (
                                            <p className="text-[10px] text-red-400 mt-1 truncate" title={upload.error}>
                                                {upload.error || 'Upload failed'}
                                            </p>
                                        )}
                                    </div>

                                    {upload.status === 'error' && (
                                        <button
                                            onClick={() => removeUploadingFile(upload.id)}
                                            className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Items Grid */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-hide">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 sm:py-16">
                            <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mb-4 sm:mb-6">
                                {EmptyIcon && <EmptyIcon className="w-8 sm:w-10 h-8 sm:h-10 text-slate-500" />}
                            </div>
                            <p className="text-base sm:text-lg font-medium text-slate-300 mb-2">{config.emptyMessage}</p>
                            <p className="text-xs sm:text-sm text-slate-500 mb-4 sm:mb-6">{config.emptySubMessage}</p>
                            <button
                                onClick={handleUploadClick}
                                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Upload Files</span>
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                            {items.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => toggleSelection(item.id)}
                                    className={`relative cursor-pointer rounded-lg border-2 transition-all ${
                                        selectedItems.has(item.id)
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-slate-700 hover:border-slate-600'
                                    }`}
                                >
                                    <div className="aspect-video bg-slate-800 rounded-t-lg flex items-center justify-center">
                                        {renderItemPreview(item)}
                                    </div>
                                    <div className="p-2 flex items-center justify-between gap-2">
                                        <p className="text-xs text-slate-300 truncate flex-1" title={item.name}>
                                            {item.name}
                                        </p>
                                        <button
                                            onClick={(e) => handleDeleteItem(e, item)}
                                            disabled={deletingItems.has(item.id)}
                                            className="flex-shrink-0 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                                            title="Delete file"
                                        >
                                            {deletingItems.has(item.id) ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                    {selectedItems.has(item.id) && (
                                        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                            <span className="text-white text-xs">✓</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-6 border-t border-slate-800">
                    <span className="text-sm text-slate-400 text-center sm:text-left">
                        {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-2 sm:gap-3">
                        {selectedItems.size > 0 && (
                            <button
                                onClick={handleDeleteSelected}
                                disabled={isDeletingSelected}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeletingSelected ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="hidden sm:inline">Deleting...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        <span className="hidden sm:inline">Delete</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-sm text-slate-300 hover:text-white bg-slate-800 sm:bg-transparent hover:bg-slate-700 sm:hover:bg-transparent rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={selectedItems.size === 0 || isAddingToTimeline}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:min-w-[140px]"
                        >
                            {isAddingToTimeline ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Adding...</span>
                                </>
                            ) : (
                                <span>Add to Timeline</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

// Convenience wrapper components for backwards compatibility
export function MediaLibraryModal(props: Omit<LibraryModalProps, 'type'>) {
    return <LibraryModal {...props} type="media" />;
}

export function AudioLibraryModal(props: Omit<LibraryModalProps, 'type'>) {
    return <LibraryModal {...props} type="audio" />;
}
