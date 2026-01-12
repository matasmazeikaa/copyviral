"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LibraryItem, MediaType } from "@/app/types";
import { listUserMediaFiles } from "@/app/services/mediaLibraryService";
import { useAuth } from "@/app/contexts/AuthContext";
import { X, Loader2, Upload, CheckCircle, XCircle, Film, Image as ImageIcon, Music } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/app/utils/supabase/client";
import { categorizeFile } from "@/app/utils/utils";

interface MediaLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddToTimeline: (items: LibraryItem[]) => void;
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

export function MediaLibraryModal({ isOpen, onClose, onAddToTimeline }: MediaLibraryModalProps) {
    const { user } = useAuth();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && user) {
            loadLibraryItems();
        }
    }, [isOpen, user]);

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
            setItems(libraryItems);
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

    const handleAdd = () => {
        const selected = items.filter(item => selectedItems.has(item.id));
        if (selected.length === 0) {
            toast.error('Please select at least one item');
            return;
        }
        onAddToTimeline(selected);
        setSelectedItems(new Set());
        onClose();
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
        const fileName = `${fileId}.${fileExt}`;
        const filePath = `${userFolder}/${fileName}`;

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            setUploadingFiles(prev => prev.map(f => 
                f.id === uploadId 
                    ? { ...f, status: 'error', error: 'File exceeds 5GB limit' }
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
            // Reload library items
            await loadLibraryItems();
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const removeUploadingFile = (uploadId: string) => {
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
    };

    const getFileIcon = (type: MediaType) => {
        switch (type) {
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

    const isUploading = uploadingFiles.some(f => f.status === 'uploading');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Media Library</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleUploadClick}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                            accept="video/*,image/*"
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
                                    {/* File type icon */}
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

                                    {/* File info and progress */}
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

                                    {/* Close button for errors */}
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

                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <p>No media files in library</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                                        {item.type === 'video' ? (
                                            <video
                                                src={item.url}
                                                className="w-full h-full object-cover rounded-t-lg"
                                                muted
                                            />
                                        ) : item.type === 'image' ? (
                                            <img
                                                src={item.url}
                                                alt={item.name}
                                                className="w-full h-full object-cover rounded-t-lg"
                                            />
                                        ) : (
                                            <div className="text-slate-500 text-sm">{item.type}</div>
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <p className="text-xs text-slate-300 truncate" title={item.name}>
                                            {item.name}
                                        </p>
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

                <div className="flex items-center justify-between p-6 border-t border-slate-800">
                    <span className="text-sm text-slate-400">
                        {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={selectedItems.size === 0}
                            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add to Timeline
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
