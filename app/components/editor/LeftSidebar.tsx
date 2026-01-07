"use client";

import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMediaFiles, setFilesID } from "@/app/store/slices/projectSlice";
import { storeFile, getFile } from "@/app/store";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "@/app/store/slices/loadingSlice";
import { MediaFile, LibraryItem } from "@/app/types";
import { FileVideo, Crown, Zap, LayoutGrid, Upload, Library, Sparkles, Music, LogOut, Link as LinkIcon, Loader2, Trash2 } from "lucide-react";
import AITools from "./AssetsPanel/tools-section/AITools";
import MediaList from "./AssetsPanel/tools-section/MediaList";
import { MediaLibraryModal } from "./AssetsPanel/MediaLibraryModal";
import { AudioLibraryModal } from "./AssetsPanel/AudioLibraryModal";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { categorizeFile } from "@/app/utils/utils";
import { getVideoDimensions, calculateVideoFit, getAudioDuration } from "@/app/utils/videoDimensions";
import { downloadMediaFile, uploadMediaFile } from "@/app/services/mediaLibraryService";
import { useAuth } from "@/app/contexts/AuthContext";

const DEFAULT_MEDIA_TIME = 2;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export default function LeftSidebar() {
    const { mediaFiles, filesID, id: projectId } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const router = useRouter();
    const { user } = useAuth();
    const [isImporting, setIsImporting] = useState(false);
    const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
    const [isAudioLibraryModalOpen, setIsAudioLibraryModalOpen] = useState(false);

    // Mock user stats - in real app, this would come from auth/API
    const userStats = {
        isPremium: false,
        creditsUsed: 3,
        creditsLimit: 5,
    };

    // Get audio track from mediaFiles
    const audioTrack = mediaFiles.find(m => m.type === 'audio');

    const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        if (newFiles.length === 0) return;

        const updatedFiles = [...(filesID || [])];
        const updatedMedia = [...mediaFiles];
        
        // Filter out audio files (they're handled separately)
        const mediaFilesToAdd = newFiles.filter(file => {
            const fileType = categorizeFile(file.type);
            return fileType !== 'audio';
        });

        if (mediaFilesToAdd.length === 0) {
            toast.error("Audio files should be uploaded using the Audio Track section");
            e.target.value = "";
            return;
        }

        let replacedCount = 0;
        let addedCount = 0;

        // Process each media file
        for (const file of mediaFilesToAdd) {
            const fileId = crypto.randomUUID();
            const fileType = categorizeFile(file.type);
            
            // Track loading for videos, audio, and large images
            let supabaseFileId: string | undefined;
            const shouldTrackProgress = fileType === 'video' || fileType === 'audio' || (fileType === 'image' && file.size > 1024 * 1024);
            
            if (shouldTrackProgress) {
                dispatch(addMediaLoading({ fileId, fileName: file.name, type: fileType }));
                
                // Upload to Supabase first (for fallback when IndexedDB is cleared)
                if (user) {
                    try {
                        const libraryItem = await uploadMediaFile(file, user.id);
                        const fileExt = file.name.split('.').pop() || (fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'jpg');
                        supabaseFileId = `${libraryItem.id}.${fileExt}`;
                    } catch (uploadError: any) {
                        console.warn(`Failed to upload ${fileType} to Supabase (will continue with local storage only):`, uploadError);
                        // Continue without Supabase ID - media will work locally but won't have fallback
                    }
                }
            }
            
            // Store file with progress tracking for videos, audio, and large images
            try {
                if (shouldTrackProgress) {
                    await storeFile(file, fileId, (progress) => {
                        dispatch(updateMediaProgress({ fileId, progress }));
                    });
                    dispatch(completeMediaLoading({ fileId }));
                } else {
                    await storeFile(file, fileId);
                }
                updatedFiles.push(fileId);
            } catch (error: any) {
                if (shouldTrackProgress) {
                    dispatch(errorMediaLoading({ fileId, error: error.message || `Failed to load ${fileType}` }));
                }
                console.error('Error storing file:', error);
                toast.error(`Failed to load ${file.name}`);
                continue;
            }
            
            // Get video dimensions if it's a video
            let originalWidth: number | undefined;
            let originalHeight: number | undefined;
            let initialFit: { width: number; height: number; x: number; y: number } | undefined;

            if (fileType === 'video') {
                try {
                    const dimensions = await getVideoDimensions(file);
                    originalWidth = dimensions.width;
                    originalHeight = dimensions.height;
                    const fit = calculateVideoFit(dimensions.width, dimensions.height, 'original', 1.0);
                    initialFit = {
                        width: fit.width,
                        height: fit.height,
                        x: fit.x,
                        y: fit.y,
                    };
                } catch (error) {
                    console.error('Failed to get video dimensions:', error);
                    // Fallback to default dimensions
                    originalWidth = CANVAS_WIDTH;
                    originalHeight = CANVAS_HEIGHT;
                    initialFit = {
                        width: CANVAS_WIDTH,
                        height: CANVAS_HEIGHT,
                        x: 0,
                        y: 0,
                    };
                }
            }

            // Check if there are placeholders of the matching type that can be replaced
            const matchingPlaceholders = updatedMedia.filter(
                clip => clip.isPlaceholder && 
                (clip.placeholderType === fileType || clip.placeholderType === undefined) &&
                clip.type === fileType
            );

            if (matchingPlaceholders.length > 0) {
                // Replace the first matching placeholder
                const placeholderToReplace = matchingPlaceholders[0];
                const placeholderIndex = updatedMedia.findIndex(m => m.id === placeholderToReplace.id);

                // Calculate actual duration from the file or use placeholder duration
                const duration = placeholderToReplace.positionEnd - placeholderToReplace.positionStart;

                // Use calculated fit for videos, or placeholder values for other types
                const finalFit = fileType === 'video' && initialFit 
                    ? initialFit 
                    : {
                        x: placeholderToReplace.x || 0,
                        y: placeholderToReplace.y || 0,
                        width: placeholderToReplace.width || CANVAS_WIDTH,
                        height: placeholderToReplace.height || CANVAS_HEIGHT,
                    };

                updatedMedia[placeholderIndex] = {
                    ...placeholderToReplace,
                    fileName: file.name,
                    fileId: fileId,
                    startTime: 0,
                    endTime: duration,
                    src: URL.createObjectURL(file),
                    includeInMerge: true,
                    x: finalFit.x,
                    y: finalFit.y,
                    width: finalFit.width,
                    height: finalFit.height,
                    rotation: placeholderToReplace.rotation || 0,
                    opacity: placeholderToReplace.opacity || 100,
                    crop: placeholderToReplace.crop || { x: 0, y: 0, width: finalFit.width, height: finalFit.height },
                    playbackSpeed: placeholderToReplace.playbackSpeed || 1,
                    volume: placeholderToReplace.volume || 100,
                    type: fileType,
                    zIndex: placeholderToReplace.zIndex || 0,
                    aspectRatioFit: fileType === 'video' ? 'original' : undefined,
                    zoom: fileType === 'video' ? 1.0 : undefined,
                    originalWidth: fileType === 'video' ? originalWidth : undefined,
                    originalHeight: fileType === 'video' ? originalHeight : undefined,
                    isPlaceholder: false,
                    placeholderType: undefined,
                    supabaseFileId: supabaseFileId,
                };
                replacedCount++;
            } else {
                // No placeholder to replace, add new media as before
                // Calculate timeline position (add after the last media of the same type)
                const relevantClips = updatedMedia.filter(clip => clip.type === fileType);
                const lastEnd = relevantClips.length > 0
                    ? Math.max(...relevantClips.map(f => f.positionEnd))
                    : 0;

                // Use calculated fit for videos, or default values for other types
                const finalFit = fileType === 'video' && initialFit 
                    ? initialFit 
                    : {
                        x: 0,
                        y: 0,
                        width: CANVAS_WIDTH,
                        height: CANVAS_HEIGHT,
                    };

                // Create MediaFile and add to timeline
                const mediaId = crypto.randomUUID();
                updatedMedia.push({
                    id: mediaId,
                    fileName: file.name,
                    fileId: fileId,
                    startTime: 0,
                    endTime: DEFAULT_MEDIA_TIME,
                    src: URL.createObjectURL(file),
                    positionStart: lastEnd,
                    positionEnd: lastEnd + DEFAULT_MEDIA_TIME,
                    includeInMerge: true,
                    x: finalFit.x,
                    y: finalFit.y,
                    width: finalFit.width,
                    height: finalFit.height,
                    rotation: 0,
                    opacity: 100,
                    crop: { x: 0, y: 0, width: finalFit.width, height: finalFit.height },
                    playbackSpeed: 1,
                    volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
                    type: fileType,
                    zIndex: 0,
                    aspectRatioFit: fileType === 'video' ? 'original' : undefined,
                    zoom: fileType === 'video' ? 1.0 : undefined,
                    originalWidth: fileType === 'video' ? originalWidth : undefined,
                    originalHeight: fileType === 'video' ? originalHeight : undefined,
                    supabaseFileId: supabaseFileId,
                });
                addedCount++;
            }
        }

        dispatch(setFilesID(updatedFiles));
        dispatch(setMediaFiles(updatedMedia));
        e.target.value = "";
        
        // Show appropriate toast message
        if (replacedCount > 0 && addedCount > 0) {
            toast.success(`Replaced ${replacedCount} placeholder(s) and added ${addedCount} new clip(s)`);
        } else if (replacedCount > 0) {
            toast.success(`Replaced ${replacedCount} placeholder(s) with media`);
        } else {
            toast.success(`Added ${addedCount} media file(s) to timeline`);
        }
    };

    const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!user || !projectId) {
            toast.error('You must be logged in and have a project open to upload audio');
            e.target.value = "";
            return;
        }

        const fileId = crypto.randomUUID();
        
        // Add to loading tracker
        dispatch(addMediaLoading({ fileId, fileName: file.name, type: 'audio' }));
        
        try {
            // Upload to Supabase first (for fallback when IndexedDB is cleared)
            let supabaseFileId: string | undefined;
            try {
                const libraryItem = await uploadMediaFile(file, user.id);
                const fileExt = file.name.split('.').pop() || 'mp3';
                supabaseFileId = `${libraryItem.id}.${fileExt}`;
            } catch (uploadError: any) {
                console.warn('Failed to upload audio to Supabase (will continue with local storage only):', uploadError);
                // Continue without Supabase ID - audio will work locally but won't have fallback
            }
            
            // Store file in IndexedDB with progress tracking
            await storeFile(file, fileId, (progress) => {
                dispatch(updateMediaProgress({ fileId, progress }));
            });
            
            dispatch(completeMediaLoading({ fileId }));
            
            const updatedFiles = [...(filesID || []), fileId];
            dispatch(setFilesID(updatedFiles));

            // Create audio MediaFile
            const audioMediaFile: MediaFile = {
                id: crypto.randomUUID(),
                fileName: file.name,
                fileId: fileId,
                type: "audio",
                startTime: 0,
                endTime: 0, // Will be set when audio loads
                positionStart: 0,
                positionEnd: 0,
                includeInMerge: true,
                playbackSpeed: 1,
                volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
                zIndex: 0,
                src: URL.createObjectURL(file),
                supabaseFileId: supabaseFileId,
            };

            // Remove existing audio track if any
            const filteredMedia = mediaFiles.filter(m => m.type !== 'audio');
            dispatch(setMediaFiles([...filteredMedia, audioMediaFile]));
            toast.success("Audio track added");
        } catch (error: any) {
            toast.error(`Failed to upload audio: ${error.message}`);
            dispatch(errorMediaLoading({ fileId, error: error.message || 'Failed to load audio' }));
        } finally {
            e.target.value = "";
        }
    };

    const handleRemoveAudio = () => {
        const filtered = mediaFiles.filter(m => m.type !== 'audio');
        dispatch(setMediaFiles(filtered));
        toast.success("Audio track removed");
    };

    const handleAddAudioFromLibrary = async (items: LibraryItem[]) => {
        if (items.length === 0) return;

        if (!user) {
            toast.error('You must be logged in to add audio from library');
            return;
        }

        // Use the first selected audio file
        const libraryItem = items[0];
        
        // Skip items without URL or not completed
        if (!libraryItem.url || (libraryItem.status && libraryItem.status !== 'completed')) {
            toast.error('Selected audio file is not available');
            return;
        }

        try {
            // Download file from Supabase
            const file = await downloadMediaFile(libraryItem, user.id);
            
            const fileId = crypto.randomUUID();
            
            // Construct Supabase file ID from library item (format: {fileId}.{ext})
            const supabaseFileId = libraryItem.id
                ? (() => {
                      const fileExt = libraryItem.name.split('.').pop() || 'mp3';
                      return `${libraryItem.id}.${fileExt}`;
                  })()
                : undefined;
            
            // Track loading for audio
            dispatch(addMediaLoading({ fileId, fileName: libraryItem.name, type: 'audio' }));
            
            try {
                // Store file in IndexedDB with progress tracking
                await storeFile(file, fileId, (progress) => {
                    dispatch(updateMediaProgress({ fileId, progress }));
                });
                dispatch(completeMediaLoading({ fileId }));
            } catch (error: any) {
                dispatch(errorMediaLoading({ fileId, error: error.message || 'Failed to load audio' }));
                throw error;
            }
            
            const updatedFiles = [...(filesID || []), fileId];
            dispatch(setFilesID(updatedFiles));

            // Get actual audio duration
            let audioDuration = DEFAULT_MEDIA_TIME;
            try {
                audioDuration = await getAudioDuration(file);
            } catch (error) {
                console.warn('Failed to get audio duration, using default:', error);
                // Keep DEFAULT_MEDIA_TIME as fallback
            }

            // Create audio MediaFile
            const audioMediaFile: MediaFile = {
                id: crypto.randomUUID(),
                fileName: libraryItem.name,
                fileId: fileId,
                type: "audio",
                startTime: 0,
                endTime: audioDuration,
                positionStart: 0,
                positionEnd: audioDuration,
                includeInMerge: true,
                playbackSpeed: 1,
                volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
                zIndex: 0,
                src: URL.createObjectURL(file),
                supabaseFileId: supabaseFileId,
            };

            // Remove existing audio track if any
            const filteredMedia = mediaFiles.filter(m => m.type !== 'audio');
            dispatch(setMediaFiles([...filteredMedia, audioMediaFile]));
            toast.success("Audio track added from library");
        } catch (error: any) {
            console.error('Error adding audio from library:', error);
            toast.error(`Failed to add audio: ${error.message}`);
        }
    };

    const handleImportReference = async (file: File) => {
        setIsImporting(true);
        try {
            // This will be handled by AITools component
            // For now, just show a message
            toast.success("Reference import handled by AI Tools");
        } catch (error) {
            console.error(error);
            toast.error("Failed to import reference");
        } finally {
            setIsImporting(false);
        }
    };

    const handleUpgrade = () => {
        toast.success("Upgrade to PRO feature coming soon!");
    };

    const handleLogout = () => {
        router.push('/');
    };

    const handleOpenLibrary = () => {
        setIsLibraryModalOpen(true);
    };

    const handleAddLibraryItemsToTimeline = async (items: LibraryItem[]) => {
        if (items.length === 0) return;

        const updatedFiles = [...(filesID || [])];
        const updatedMedia = [...mediaFiles];
        
        let replacedCount = 0;
        let addedCount = 0;

        // Process each library item
        for (const libraryItem of items) {
            // Skip items without URL or not completed
            if (!libraryItem.url || (libraryItem.status && libraryItem.status !== 'completed')) {
                continue;
            }

            try {
                // Download file from Supabase
                if (!user) {
                    toast.error('You must be logged in to add files from library');
                    continue;
                }

                const file = await downloadMediaFile(libraryItem, user.id);
                
                const fileType = libraryItem.type || categorizeFile(file.type);
                
                // Store in IndexedDB with progress tracking for videos
                const fileId = crypto.randomUUID();
                
                // Construct Supabase file ID (format: {fileId}.{ext})
                const supabaseFileId = libraryItem.id
                    ? (() => {
                          const fileExt = libraryItem.name.split('.').pop() || 
                              (fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'jpg');
                          return `${libraryItem.id}.${fileExt}`;
                      })()
                    : undefined;
                
                // Track loading for videos, audio, and large images
                const shouldTrackProgress = fileType === 'video' || fileType === 'audio' || (fileType === 'image' && file.size > 1024 * 1024);
                
                if (shouldTrackProgress) {
                    dispatch(addMediaLoading({ fileId, fileName: libraryItem.name, type: fileType }));
                }
                
                try {
                    if (shouldTrackProgress) {
                        await storeFile(file, fileId, (progress) => {
                            dispatch(updateMediaProgress({ fileId, progress }));
                        });
                        dispatch(completeMediaLoading({ fileId }));
                    } else {
                        await storeFile(file, fileId);
                    }
                    updatedFiles.push(fileId);
                } catch (error: any) {
                    if (shouldTrackProgress) {
                        dispatch(errorMediaLoading({ fileId, error: error.message || `Failed to load ${fileType}` }));
                    }
                    console.error('Error storing file:', error);
                    toast.error(`Failed to load ${libraryItem.name}`);
                    continue;
                }
                
                // Skip audio files (handled separately)
                if (fileType === 'audio') {
                    continue;
                }
                
                // Get video dimensions if it's a video
                let originalWidth: number | undefined;
                let originalHeight: number | undefined;
                let initialFit: { width: number; height: number; x: number; y: number } | undefined;

                if (fileType === 'video') {
                    try {
                        const dimensions = await getVideoDimensions(file);
                        originalWidth = dimensions.width;
                        originalHeight = dimensions.height;
                        const fit = calculateVideoFit(dimensions.width, dimensions.height, 'original', 1.0);
                        initialFit = {
                            width: fit.width,
                            height: fit.height,
                            x: fit.x,
                            y: fit.y,
                        };

                    } catch (error) {
                        console.error('Failed to get video dimensions:', error);
                        originalWidth = CANVAS_WIDTH;
                        originalHeight = CANVAS_HEIGHT;
                        initialFit = {
                            width: CANVAS_WIDTH,
                            height: CANVAS_HEIGHT,
                            x: 0,
                            y: 0,
                        };
                    }
                }

                // Check if there are placeholders of the matching type that can be replaced
                const matchingPlaceholders = updatedMedia.filter(
                    clip => clip.isPlaceholder && 
                    (clip.placeholderType === fileType || clip.placeholderType === undefined) &&
                    clip.type === fileType
                );

                if (matchingPlaceholders.length > 0) {
                    // Replace the first matching placeholder
                    const placeholderToReplace = matchingPlaceholders[0];
                    const placeholderIndex = updatedMedia.findIndex(m => m.id === placeholderToReplace.id);

                    const duration = placeholderToReplace.positionEnd - placeholderToReplace.positionStart;

                    const finalFit = fileType === 'video' && initialFit 
                        ? initialFit 
                        : {
                            x: placeholderToReplace.x || 0,
                            y: placeholderToReplace.y || 0,
                            width: placeholderToReplace.width || CANVAS_WIDTH,
                            height: placeholderToReplace.height || CANVAS_HEIGHT,
                        };

                    updatedMedia[placeholderIndex] = {
                        ...placeholderToReplace,
                        fileName: libraryItem.name,
                        fileId: fileId,
                        startTime: 0,
                        endTime: duration,
                        src: URL.createObjectURL(file),
                        includeInMerge: true,
                        x: finalFit.x,
                        y: finalFit.y,
                        width: finalFit.width,
                        height: finalFit.height,
                        rotation: placeholderToReplace.rotation || 0,
                        opacity: placeholderToReplace.opacity || 100,
                        crop: placeholderToReplace.crop || { x: 0, y: 0, width: finalFit.width, height: finalFit.height },
                        playbackSpeed: placeholderToReplace.playbackSpeed || 1,
                        volume: placeholderToReplace.volume || 100,
                        type: fileType,
                        zIndex: placeholderToReplace.zIndex || 0,
                        aspectRatioFit: fileType === 'video' ? 'original' : undefined,
                        zoom: fileType === 'video' ? 1.0 : undefined,
                        originalWidth: fileType === 'video' ? originalWidth : undefined,
                        originalHeight: fileType === 'video' ? originalHeight : undefined,
                        isPlaceholder: false,
                        placeholderType: undefined,
                        supabaseFileId: supabaseFileId,
                    };
                    replacedCount++;
                } else {
                    // No placeholder to replace, add new media
                    const relevantClips = updatedMedia.filter(clip => clip.type === fileType);
                    const lastEnd = relevantClips.length > 0
                        ? Math.max(...relevantClips.map(f => f.positionEnd))
                        : 0;

                    const finalFit = fileType === 'video' && initialFit 
                        ? initialFit 
                        : {
                            x: 0,
                            y: 0,
                            width: CANVAS_WIDTH,
                            height: CANVAS_HEIGHT,
                        };

                    const mediaId = crypto.randomUUID();
                    updatedMedia.push({
                        id: mediaId,
                        fileName: libraryItem.name,
                        fileId: fileId,
                        startTime: 0,
                        endTime: DEFAULT_MEDIA_TIME,
                        src: URL.createObjectURL(file),
                        positionStart: lastEnd,
                        positionEnd: lastEnd + DEFAULT_MEDIA_TIME,
                        includeInMerge: true,
                        x: finalFit.x,
                        y: finalFit.y,
                        width: finalFit.width,
                        height: finalFit.height,
                        rotation: 0,
                        opacity: 100,
                        crop: { x: 0, y: 0, width: finalFit.width, height: finalFit.height },
                        playbackSpeed: 1,
                        volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
                        type: fileType,
                        zIndex: 0,
                        aspectRatioFit: fileType === 'video' ? 'original' : undefined,
                        zoom: fileType === 'video' ? 1.0 : undefined,
                        originalWidth: fileType === 'video' ? originalWidth : undefined,
                        originalHeight: fileType === 'video' ? originalHeight : undefined,
                        supabaseFileId: supabaseFileId,
                    });
                    addedCount++;
                }
            } catch (error: any) {
                console.error('Error adding library item to timeline:', error);
                toast.error(`Failed to add ${libraryItem.name}: ${error.message}`);
            }
        }

        dispatch(setFilesID(updatedFiles));
        dispatch(setMediaFiles(updatedMedia));
        
        // Show appropriate toast message
        if (replacedCount > 0 && addedCount > 0) {
            toast.success(`Replaced ${replacedCount} placeholder(s) and added ${addedCount} new clip(s)`);
        } else if (replacedCount > 0) {
            toast.success(`Replaced ${replacedCount} placeholder(s) with media`);
        } else if (addedCount > 0) {
            toast.success(`Added ${addedCount} media file(s) to timeline`);
        }
    };

    const handleOpenGallery = () => {
        toast.success("Template gallery coming soon!");
    };

    return (
        <div className="w-80 bg-[#0f172a] border-r border-slate-800 flex flex-col h-full overflow-hidden shrink-0 z-20">
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                    <FileVideo className="w-6 h-6 text-blue-500" />
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        TokCut
                    </h1>
                    {userStats?.isPremium && (
                        <span className="px-1.5 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-[10px] font-bold rounded ml-2 flex items-center gap-1">
                            <Crown className="w-3 h-3 fill-current" /> PRO
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-500 font-medium">CLOUD RENDER MODE</p>
                
                {userStats && (
                    <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                                <Zap className="w-3 h-3 text-yellow-400" /> Cloud Credits
                            </span>
                            <span className="text-xs text-white font-mono">
                                {userStats.isPremium ? '∞' : `${userStats.creditsUsed}/${userStats.creditsLimit}`}
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all ${userStats.isPremium ? 'bg-gradient-to-r from-yellow-400 to-orange-500 w-full' : 'bg-blue-500'}`}
                                style={{ width: userStats.isPremium ? '100%' : `${Math.min((userStats.creditsUsed / userStats.creditsLimit) * 100, 100)}%` }}
                            />
                        </div>
                        {!userStats.isPremium && (
                            <button 
                                onClick={handleUpgrade}
                                className="w-full mt-3 py-1.5 text-xs font-bold text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                                <Crown className="w-3 h-3" /> Upgrade to PRO
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Media Library Action */}
                <div>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Library className="w-4 h-4" /> Assets
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleOpenLibrary}
                            className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-xl transition-all"
                        >
                            <Library className="w-6 h-6 mb-2" />
                            <span className="text-xs font-bold">Library</span>
                        </button>
                    </div>
                </div>

                {/* AI Reference Copy */}
                <AITools />

                {/* Audio Track */}
                <div className="pb-4">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Audio Track</h2>
                    {!audioTrack ? (
                        <div className="space-y-2">
                            <label className="flex items-center justify-center w-full h-12 border border-slate-700 rounded-xl bg-slate-800/30 hover:bg-slate-800 cursor-pointer transition-all gap-2 group">
                                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                                    <Upload className="w-3 h-3" />
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200">Upload Audio</span>
                                <input type="file" accept="audio/*" className="hidden" onChange={handleUploadAudio} />
                            </label>
                            <button 
                                onClick={() => setIsAudioLibraryModalOpen(true)}
                                className="flex items-center justify-center w-full h-12 border border-slate-700 rounded-xl bg-slate-800/30 hover:bg-slate-800 transition-all gap-2 group"
                            >
                                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                                    <Library className="w-3 h-3" />
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200">Open Audio Library</span>
                            </button>
                        </div>
                    ) : (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                                        <Music className="w-3 h-3" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-blue-100 truncate">{audioTrack.fileName}</p>
                                    </div>
                                </div>
                                <button onClick={handleRemoveAudio} className="text-blue-300 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <label className="flex-1 flex items-center justify-center h-9 border border-slate-700 rounded-lg bg-slate-800/30 hover:bg-slate-800 cursor-pointer transition-all gap-2 group">
                                    <Upload className="w-3 h-3 text-slate-400 group-hover:text-slate-200" />
                                    <span className="text-xs text-slate-400 group-hover:text-slate-200">Replace</span>
                                    <input type="file" accept="audio/*" className="hidden" onChange={handleUploadAudio} />
                                </label>
                                <button 
                                    onClick={() => setIsAudioLibraryModalOpen(true)}
                                    className="flex-1 flex items-center justify-center h-9 border border-slate-700 rounded-lg bg-slate-800/30 hover:bg-slate-800 transition-all gap-2 group"
                                >
                                    <Library className="w-3 h-3 text-slate-400 group-hover:text-slate-200" />
                                    <span className="text-xs text-slate-400 group-hover:text-slate-200">Library</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors py-2 rounded hover:bg-red-500/10">
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>

            {/* Media Library Modal */}
            <MediaLibraryModal
                isOpen={isLibraryModalOpen}
                onClose={() => setIsLibraryModalOpen(false)}
                onAddToTimeline={handleAddLibraryItemsToTimeline}
            />

            {/* Audio Library Modal */}
            <AudioLibraryModal
                isOpen={isAudioLibraryModalOpen}
                onClose={() => setIsAudioLibraryModalOpen(false)}
                onAddToTimeline={handleAddAudioFromLibrary}
            />
        </div>
    );
}

