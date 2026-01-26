"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { LibraryItem, MediaType, MediaFolder } from "@/app/types";
import { 
    listUserMediaFilesInFolder, 
    deleteMediaFileFromFolder, 
    listFolders, 
    createFolder, 
    deleteFolder,
    moveFiles,
    uploadVideoThumbnail,
} from "@/app/services/mediaLibraryService";
import { extractThumbnail } from "@/app/utils/extractThumbnail";
import { useAuth } from "@/app/contexts/AuthContext";
import { X, Loader2, Upload, CheckCircle, XCircle, Film, Image as ImageIcon, Music, Trash2, HardDrive, Crown, FolderPlus, Folder, ChevronRight, Home, MoreVertical, FolderInput, CloudUpload } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/app/utils/supabase/client";
import { categorizeFile } from "@/app/utils/utils";
import { checkStorageLimit, validateUpload, formatBytes, StorageLimitInfo } from "@/app/services/subscriptionService";
import { uploadWithTus, requestSignedUploadUrl } from "@/app/utils/resumableUpload";

type LibraryType = 'media' | 'video' | 'audio' | 'image';

interface LibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddToTimeline: (items: LibraryItem[]) => void;
    onSelectFolders?: (folders: MediaFolder[]) => void; // Optional callback for folder selection
    allowFolderSelection?: boolean; // Enable folder selection mode
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
    video: {
        title: 'Video Library',
        accept: 'video/*',
        emptyMessage: 'No videos yet',
        emptySubMessage: 'Upload videos to get started',
        emptyIcon: Film,
        filterFn: (item: LibraryItem) => item.type === 'video',
    },
    audio: {
        title: 'Audio Library',
        accept: 'audio/*',
        emptyMessage: 'No audio files yet',
        emptySubMessage: 'Upload audio files to get started',
        emptyIcon: Music,
        filterFn: (item: LibraryItem) => item.type === 'audio',
    },
    image: {
        title: 'Image Library',
        accept: 'image/*',
        emptyMessage: 'No images yet',
        emptySubMessage: 'Upload images to get started',
        emptyIcon: ImageIcon,
        filterFn: (item: LibraryItem) => item.type === 'image',
    },
};

export function LibraryModal({ isOpen, onClose, onAddToTimeline, onSelectFolders, allowFolderSelection = false, type }: LibraryModalProps) {
    const { user } = useAuth();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectedFolderPaths, setSelectedFolderPaths] = useState<Set<string>>(new Set()); // For folder selection
    const [isLoading, setIsLoading] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
    const [deletingFolders, setDeletingFolders] = useState<Set<string>>(new Set());
    const [isDeletingSelected, setIsDeletingSelected] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageLimitInfo | null>(null);
    const [mounted, setMounted] = useState(false);
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [isMovingFiles, setIsMovingFiles] = useState(false);
    const [allFolders, setAllFolders] = useState<MediaFolder[]>([]); // All folders for move dialog
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    
    // Mount check for portal
    useEffect(() => {
        setMounted(true);
    }, []);

    const config = CONFIG[type];
    const usagePercentage = storageInfo ? Math.min((storageInfo.usedBytes / storageInfo.limitBytes) * 100, 100) : 0;
    
    // Parse current folder path for breadcrumbs
    const folderPath = currentFolder ? currentFolder.split('/') : [];

    useEffect(() => {
        if (isOpen && user) {
            loadLibraryItems();
            loadStorageInfo();
        }
    }, [isOpen, user]);
    
    // Reset folder when modal closes
    useEffect(() => {
        if (!isOpen) {
            setCurrentFolder(null);
            setSelectedItems(new Set());
            setSelectedFolderPaths(new Set());
        }
    }, [isOpen]);
    
    // Reload when folder changes
    useEffect(() => {
        if (isOpen && user) {
            loadLibraryItems();
        }
    }, [currentFolder]);

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
            // Load folders and files in parallel
            const [libraryItems, folderList] = await Promise.all([
                listUserMediaFilesInFolder(user.id, currentFolder || undefined),
                listFolders(user.id, currentFolder || undefined)
            ]);
            // Filter by type and exclude AI reference copies and system files:
            // - Files starting with "reference_" (downloaded from URLs)
            // - Files from _ai_ref folder (uploaded through AI analysis)
            // - Thumbnail files (ending with _thumb.jpg)
            const filteredItems = libraryItems
                .filter(config.filterFn)
                .filter(item => !item.name.startsWith('reference_'))
                .filter(item => !item.folder?.includes('_ai_ref'))
                .filter(item => !item.name.includes('_thumb.'));
            // Filter out _ai_ref folders from the folder list
            // Note: thumbnails folder is storage-only (not in database), so it won't appear here
            const filteredFolders = folderList.filter(f => !f.path.includes('_ai_ref'));
            setItems(filteredItems);
            setFolders(filteredFolders);
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

    const toggleFolderSelection = (folderPath: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedFolderPaths);
        if (newSelected.has(folderPath)) {
            newSelected.delete(folderPath);
        } else {
            newSelected.add(folderPath);
        }
        setSelectedFolderPaths(newSelected);
    };

    const [isAddingToTimeline, setIsAddingToTimeline] = useState(false);

    const handleAdd = () => {
        const selected = items.filter(item => selectedItems.has(item.id));
        const selectedFolders = folders.filter(f => selectedFolderPaths.has(f.path));
        
        if (selected.length === 0 && selectedFolders.length === 0) {
            toast.error('Please select at least one item or folder');
            return;
        }
        setIsAddingToTimeline(true);
        // Small delay to show the button state change before modal closes
        setTimeout(() => {
            if (selected.length > 0) {
                onAddToTimeline(selected);
            }
            if (selectedFolders.length > 0 && onSelectFolders) {
                onSelectFolders(selectedFolders);
            }
            setSelectedItems(new Set());
            setSelectedFolderPaths(new Set());
            setIsAddingToTimeline(false);
            onClose();
        }, 100);
    };

    const uploadFileWithProgress = useCallback(async (
        file: File,
        uploadId: string,
        userId: string,
        folder?: string | null
    ): Promise<LibraryItem | null> => {
        const supabase = createClient();
        const TUS_THRESHOLD = 6 * 1024 * 1024; // 6MB - use TUS for files larger than this

        try {
            // 1. Request upload path from backend (validates auth, type, storage limits)
            let uploadData: { token: string; path: string; fileId: string; signedUrl: string };
            try {
                uploadData = await requestSignedUploadUrl(file.name, file.size, file.type, folder);
            } catch (error: any) {
                setUploadingFiles(prev => prev.map(f => 
                    f.id === uploadId 
                        ? { ...f, status: 'error', error: error.message || 'Upload not allowed' }
                        : f
                ));
                return null;
            }

            const { path: filePath, fileId } = uploadData;

            // Get session for authentication
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            // 2. Upload file - use TUS for large files, XHR for small files
            if (file.size > TUS_THRESHOLD) {
                // Use TUS resumable upload for large files
                await uploadWithTus({
                    file,
                    accessToken: session.access_token,
                    objectPath: filePath,
                    onProgress: (bytesUploaded, bytesTotal) => {
                        const percentComplete = Math.round((bytesUploaded / bytesTotal) * 100);
                        setUploadingFiles(prev => prev.map(f => 
                            f.id === uploadId 
                                ? { ...f, progress: percentComplete }
                                : f
                        ));
                    },
                });
            } else {
                // Use standard XHR upload for small files (faster, single request)
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
            }

            // 3. Get signed URL for the uploaded file
            const { data: signedUrlData, error: urlError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(filePath, 3600);

            if (urlError) {
                throw urlError;
            }

            // 4. For video files, extract and upload a thumbnail
            let thumbnailUrl: string | null = null;
            const mediaType = categorizeFile(file.type);
            if (mediaType === 'video') {
                try {
                    const thumbnail = await extractThumbnail(file, fileId);
                    thumbnailUrl = await uploadVideoThumbnail(thumbnail, userId, fileId, folder || undefined);
                } catch (thumbnailError) {
                    console.warn('Failed to extract thumbnail:', thumbnailError);
                }
            }

            // 5. Update status to completed
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
                type: mediaType,
                size: file.size,
                createdAt: new Date().toISOString(),
                folder: folder || null,
                thumbnailUrl,
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
    
    const handleCreateFolder = async () => {
        if (!user || !newFolderName.trim()) return;
        
        setIsCreatingFolder(true);
        try {
            await createFolder(user.id, newFolderName.trim(), currentFolder || undefined);
            toast.success(`Folder "${newFolderName}" created`);
            setNewFolderName("");
            setShowCreateFolder(false);
            await loadLibraryItems();
        } catch (error: any) {
            console.error('Error creating folder:', error);
            toast.error(error.message || 'Failed to create folder');
        } finally {
            setIsCreatingFolder(false);
        }
    };
    
    const handleDeleteFolder = async (folder: MediaFolder) => {
        if (!user) return;
        
        setDeletingFolders(prev => new Set(prev).add(folder.path));
        try {
            await deleteFolder(user.id, folder.path);
            toast.success(`Folder "${folder.name}" deleted`);
            await loadLibraryItems();
        } catch (error: any) {
            console.error('Error deleting folder:', error);
            toast.error(error.message || 'Failed to delete folder');
        } finally {
            setDeletingFolders(prev => {
                const newSet = new Set(prev);
                newSet.delete(folder.path);
                return newSet;
            });
        }
    };
    
    const navigateToFolder = (folder: MediaFolder | null) => {
        setSelectedItems(new Set());
        setCurrentFolder(folder?.path || null);
    };
    
    const navigateUp = () => {
        if (!currentFolder) return;
        const parts = currentFolder.split('/');
        parts.pop();
        setSelectedItems(new Set());
        setCurrentFolder(parts.length > 0 ? parts.join('/') : null);
    };
    
    const navigateToBreadcrumb = (index: number) => {
        if (index < 0) {
            setCurrentFolder(null);
        } else {
            setCurrentFolder(folderPath.slice(0, index + 1).join('/'));
        }
        setSelectedItems(new Set());
    };

    // Load all folders recursively for the move dialog
    const loadAllFolders = async () => {
        if (!user) return;
        
        const allFoldersList: MediaFolder[] = [];
        
        const loadFoldersRecursive = async (parentPath?: string) => {
            const folderList = await listFolders(user.id, parentPath);
            for (const folder of folderList) {
                allFoldersList.push(folder);
                await loadFoldersRecursive(folder.path);
            }
        };
        
        await loadFoldersRecursive();
        setAllFolders(allFoldersList);
    };

    const handleOpenMoveDialog = async () => {
        if (selectedItems.size === 0) {
            toast.error('Please select files to move');
            return;
        }
        await loadAllFolders();
        setShowMoveDialog(true);
    };

    const handleMoveFiles = async (destinationFolder: string | null) => {
        if (!user || selectedItems.size === 0) return;
        
        setIsMovingFiles(true);
        try {
            const filesToMove = items
                .filter(item => selectedItems.has(item.id))
                .map(item => ({
                    id: item.id,
                    name: item.name,
                    currentFolder: item.folder || null,
                }));

            const result = await moveFiles(filesToMove, destinationFolder);
            
            if (result.moved > 0) {
                toast.success(`Moved ${result.moved} file${result.moved !== 1 ? 's' : ''}`);
                setSelectedItems(new Set());
                await loadLibraryItems();
            }
            if (result.failed > 0) {
                toast.error(`Failed to move ${result.failed} file${result.failed !== 1 ? 's' : ''}`);
            }
        } catch (error: any) {
            console.error('Error moving files:', error);
            toast.error(error.message || 'Failed to move files');
        } finally {
            setIsMovingFiles(false);
            setShowMoveDialog(false);
        }
    };

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

        // Upload files in batches of 10 for better stability with many files
        const BATCH_SIZE = 10;
        const results: (LibraryItem | null)[] = [];
        
        for (let i = 0; i < newUploads.length; i += BATCH_SIZE) {
            const batch = newUploads.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(upload => 
                    uploadFileWithProgress(upload.file, upload.id, user.id, currentFolder)
                )
            );
            results.push(...batchResults);
            
            // Show progress for large uploads
            if (newUploads.length > BATCH_SIZE) {
                const completedBatches = Math.min(i + BATCH_SIZE, newUploads.length);
                const batchSuccessCount = batchResults.filter(r => r !== null).length;
                if (batchSuccessCount > 0) {
                    toast.success(`Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchSuccessCount} file${batchSuccessCount > 1 ? 's' : ''} (${completedBatches}/${newUploads.length} total)`);
                }
            }
        }
        
        const successCount = results.filter(r => r !== null).length;

        if (successCount > 0) {
            if (newUploads.length <= BATCH_SIZE) {
                // Single batch - show simple message
                toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
            } else {
                // Multiple batches - show final summary
                toast.success(`Upload complete: ${successCount}/${newUploads.length} files uploaded successfully`);
            }
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
            await deleteMediaFileFromFolder(item.id, user.id, item.name, item.folder || undefined);
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
            deleteMediaFileFromFolder(item.id, user.id, item.name, item.folder || undefined)
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
            // Use thumbnail if available, otherwise show placeholder
            if (item.thumbnailUrl) {
                return (
                    <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="w-full h-full object-cover rounded-t-lg"
                        loading="lazy"
                    />
                );
            }
            // No thumbnail available - show placeholder with video icon
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 rounded-t-lg">
                    <Film className="w-10 h-10 text-slate-500 mb-1" />
                    <span className="text-xs text-slate-500">No preview</span>
                </div>
            );
        }
        if (item.type === 'image') {
            return (
                <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover rounded-t-lg"
                    loading="lazy"
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
                            onClick={() => setShowCreateFolder(true)}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            title="Create new folder"
                        >
                            <FolderPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">New Folder</span>
                        </button>
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

                {/* Create Folder Modal */}
                {showCreateFolder && (
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                        <div className="flex items-center gap-3">
                            <Folder className="w-5 h-5 text-slate-400" />
                            <input
                                ref={folderInputRef}
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateFolder();
                                    if (e.key === 'Escape') {
                                        setShowCreateFolder(false);
                                        setNewFolderName("");
                                    }
                                }}
                                placeholder="Folder name..."
                                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autoFocus
                            />
                            <button
                                onClick={handleCreateFolder}
                                disabled={!newFolderName.trim() || isCreatingFolder}
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isCreatingFolder ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    "Create"
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateFolder(false);
                                    setNewFolderName("");
                                }}
                                className="p-2 text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Breadcrumbs Navigation */}
                {(currentFolder || folders.length > 0 || items.length > 0) && (
                    <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/30">
                        <div className="flex items-center gap-1 text-sm overflow-x-auto">
                            <button
                                onClick={() => navigateToBreadcrumb(-1)}
                                className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 transition-colors ${
                                    !currentFolder ? 'text-white' : 'text-slate-400'
                                }`}
                            >
                                <Home className="w-4 h-4" />
                                <span>Root</span>
                            </button>
                            {folderPath.map((folder, index) => (
                                <div key={index} className="flex items-center">
                                    <ChevronRight className="w-4 h-4 text-slate-600" />
                                    <button
                                        onClick={() => navigateToBreadcrumb(index)}
                                        className={`px-2 py-1 rounded hover:bg-slate-800 transition-colors ${
                                            index === folderPath.length - 1 ? 'text-white' : 'text-slate-400'
                                        }`}
                                    >
                                        {folder}
                                    </button>
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
                    ) : folders.length === 0 && items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 sm:py-16">
                            <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mb-4 sm:mb-6">
                                {EmptyIcon && <EmptyIcon className="w-8 sm:w-10 h-8 sm:h-10 text-slate-500" />}
                            </div>
                            <p className="text-base sm:text-lg font-medium text-slate-300 mb-2">
                                {currentFolder ? 'This folder is empty' : config.emptyMessage}
                            </p>
                            <p className="text-xs sm:text-sm text-slate-500 mb-4 sm:mb-6">
                                {currentFolder ? 'Upload files or create subfolders' : config.emptySubMessage}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCreateFolder(true)}
                                    className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    <FolderPlus className="w-4 h-4" />
                                    <span>New Folder</span>
                                </button>
                                <button
                                    onClick={handleUploadClick}
                                    className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                                >
                                    <Upload className="w-4 h-4" />
                                    <span>Upload Files</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                            {/* Folders */}
                            {folders.map((folder) => {
                                const isSelected = selectedFolderPaths.has(folder.path);
                                return (
                                    <div
                                        key={folder.path}
                                        className={`relative cursor-pointer rounded-lg border-2 transition-all group ${
                                            isSelected
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : 'border-slate-700 hover:border-slate-500'
                                        }`}
                                    >
                                        <div 
                                            onClick={() => navigateToFolder(folder)}
                                            className="aspect-video bg-slate-800 rounded-t-lg flex items-center justify-center relative"
                                        >
                                            <Folder className="w-12 h-12 text-amber-500" />
                                            {/* Selection checkbox for folders when enabled */}
                                            {allowFolderSelection && (
                                                <button
                                                    onClick={(e) => toggleFolderSelection(folder.path, e)}
                                                    className={`absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                                                        isSelected
                                                            ? 'bg-blue-500 border-blue-500'
                                                            : 'bg-slate-900/80 border-slate-500 hover:border-blue-400'
                                                    }`}
                                                    title="Select folder for video pool"
                                                >
                                                    {isSelected && <span className="text-white text-xs">✓</span>}
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-2 flex items-center justify-between gap-2">
                                            <p 
                                                className="text-xs text-slate-300 truncate flex-1 cursor-pointer" 
                                                title={folder.name}
                                                onClick={() => navigateToFolder(folder)}
                                            >
                                                {folder.name}
                                            </p>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                                                        handleDeleteFolder(folder);
                                                    }
                                                }}
                                                disabled={deletingFolders.has(folder.path)}
                                                className="flex-shrink-0 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                                title="Delete folder"
                                            >
                                                {deletingFolders.has(folder.path) ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                        {/* Selection indicator */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                <span className="text-white text-xs">✓</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            
                            {/* Files */}
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
                    <div className="text-sm text-slate-400 text-center sm:text-left">
                        {currentFolder && (
                            <span className="text-slate-500 mr-2">
                                📁 {currentFolder.split('/').pop()}
                            </span>
                        )}
                        <span>
                            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                            {selectedFolderPaths.size > 0 && (
                                <span className="text-blue-400 ml-1">
                                    + {selectedFolderPaths.size} folder{selectedFolderPaths.size !== 1 ? 's' : ''}
                                </span>
                            )}
                            {folders.length > 0 && !allowFolderSelection && ` • ${folders.length} folder${folders.length !== 1 ? 's' : ''}`}
                        </span>
                    </div>
                    <div className="flex gap-2 sm:gap-3">
                        {selectedItems.size > 0 && (
                            <>
                                <button
                                    onClick={handleOpenMoveDialog}
                                    disabled={isMovingFiles}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FolderInput className="w-4 h-4" />
                                    <span className="hidden sm:inline">Move</span>
                                </button>
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
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-sm text-slate-300 hover:text-white bg-slate-800 sm:bg-transparent hover:bg-slate-700 sm:hover:bg-transparent rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={(selectedItems.size === 0 && selectedFolderPaths.size === 0) || isAddingToTimeline}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:min-w-[140px]"
                        >
                            {isAddingToTimeline ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Adding...</span>
                                </>
                            ) : (
                                <span>{allowFolderSelection ? 'Add to Pool' : 'Add to Timeline'}</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Move Dialog */}
                {showMoveDialog && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-80 max-h-96 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-white font-medium">Move to folder</h3>
                                <button
                                    onClick={() => setShowMoveDialog(false)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1">
                                {/* Root option */}
                                <button
                                    onClick={() => handleMoveFiles(null)}
                                    disabled={isMovingFiles || currentFolder === null}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
                                >
                                    <Home className="w-4 h-4 text-slate-400" />
                                    <span>Root (no folder)</span>
                                </button>
                                {/* Folder options */}
                                {allFolders.map((folder) => (
                                    <button
                                        key={folder.id}
                                        onClick={() => handleMoveFiles(folder.path)}
                                        disabled={isMovingFiles || folder.path === currentFolder}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
                                    >
                                        <Folder className="w-4 h-4 text-amber-500" />
                                        <span className="truncate">{folder.path}</span>
                                    </button>
                                ))}
                                {allFolders.length === 0 && (
                                    <p className="text-sm text-slate-500 text-center py-4">
                                        No folders created yet
                                    </p>
                                )}
                            </div>
                            {isMovingFiles && (
                                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Moving files...</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
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

export function ImageLibraryModal(props: Omit<LibraryModalProps, 'type'>) {
    return <LibraryModal {...props} type="image" />;
}
