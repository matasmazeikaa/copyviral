"use client";

import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMediaFiles, setFilesID, setTextElements, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { storeFile, getFile } from "@/app/store";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "@/app/store/slices/loadingSlice";
import { MediaFile, LibraryItem, TextElement, MediaType } from "@/app/types";
import { FileVideo, Crown, Zap, LayoutGrid, Upload, Library, Sparkles, Music, LogOut, Link as LinkIcon, Loader2, Trash2, Type, ArrowLeft, Wand2, Video, AudioWaveform, ArrowRight } from "lucide-react";
import Logo from "../Logo";
import AITools from "./AssetsPanel/tools-section/AITools";
import MediaList from "./AssetsPanel/tools-section/MediaList";
import { MediaLibraryModal, AudioLibraryModal } from "./AssetsPanel/LibraryModal";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { categorizeFile } from "@/app/utils/utils";
import { getVideoDimensions, calculateVideoFit, getAudioDuration } from "@/app/utils/videoDimensions";
import { downloadMediaFile, uploadMediaFile } from "@/app/services/mediaLibraryService";
import { useAuth } from "@/app/contexts/AuthContext";
import { useAIAnalysis } from "@/app/contexts/AIAnalysisContext";
import { DEFAULT_TEXT_STYLE } from "@/app/constants";
import UpgradeModal from "@/app/components/UpgradeModal";
import { AIToolsModal, AIToolType } from "@/app/components/AIToolsModal";

const DEFAULT_MEDIA_TIME = 2;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export default function LeftSidebar() {
    const { mediaFiles, filesID, id: projectId, textElements, projectName } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const router = useRouter();
    const { user, usageInfo, isPremium, canUseAI } = useAuth();
    const { startAnalysis, isAnalyzing } = useAIAnalysis();
    const [isImporting, setIsImporting] = useState(false);
    const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
    const [isAudioLibraryModalOpen, setIsAudioLibraryModalOpen] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);

    // Real user stats from AuthContext
    const creditsUsed = usageInfo?.used ?? null;
    const creditsLimit = typeof usageInfo?.limit === 'number' ? usageInfo.limit : 3;
    const isUsageLoading = usageInfo === null;

    // Get audio track from mediaFiles
    const audioTrack = mediaFiles.find(m => m.type === 'audio');

    // Handle AI tool selection from modal
    const handleAIToolSelect = async (tool: AIToolType, url: string) => {
        if (!user) {
            toast.error('You must be logged in to use AI tools');
            return;
        }

        if (!canUseAI) {
            setShowUpgradeModal(true);
            return;
        }

        // Audio beats is coming soon
        if (tool === 'audio-beats') {
            toast('Audio Beat Sync is coming soon! 🎵', { icon: '🚀' });
            return;
        }

        setIsAIModalOpen(false);

        // Use context to trigger analysis directly (no navigation delay)
        startAnalysis(url);
    };

    const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        if (newFiles.length === 0) return;

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

        // IMMEDIATELY add all files to the loading tracker before any processing
        const filesWithIds = mediaFilesToAdd.map(file => {
            const fileType = categorizeFile(file.type);
            const shouldTrackProgress = fileType === 'video' || fileType === 'audio' || (fileType === 'image' && file.size > 1024 * 1024);
            return {
                file,
                fileId: crypto.randomUUID(),
                fileType,
                shouldTrackProgress,
            };
        });

        // Add all trackable files to loader immediately
        for (const { fileId, file, fileType, shouldTrackProgress } of filesWithIds) {
            if (shouldTrackProgress) {
                dispatch(addMediaLoading({ fileId, fileName: file.name, type: fileType }));
            }
        }

        const updatedFiles = [...(filesID || [])];
        const updatedMedia = [...mediaFiles];
        
        let replacedCount = 0;
        let addedCount = 0;

        // Process each file
        const processFile = async ({ file, fileId, fileType, shouldTrackProgress }: typeof filesWithIds[0]) => {
            let supabaseFileId: string | undefined;
            
            try {
                if (shouldTrackProgress) {
                    // Upload to Supabase first (for fallback when IndexedDB is cleared)
                    // Progress 0-50% for upload
                    dispatch(updateMediaProgress({ fileId, progress: 5 }));
                    if (user) {
                        try {
                            const libraryItem = await uploadMediaFile(file, user.id);
                            const fileExt = file.name.split('.').pop() || (fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'jpg');
                            supabaseFileId = `${libraryItem.id}.${fileExt}`;
                        } catch (uploadError: any) {
                            console.warn(`Failed to upload ${fileType} to Supabase (will continue with local storage only):`, uploadError);
                        }
                    }
                    dispatch(updateMediaProgress({ fileId, progress: 50 }));
                }
                
                // Store file with progress tracking (50-100%)
                if (shouldTrackProgress) {
                    await storeFile(file, fileId, (progress) => {
                        dispatch(updateMediaProgress({ fileId, progress: 50 + (progress * 0.5) }));
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
                return null;
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

            return {
                file,
                fileId,
                fileType,
                supabaseFileId,
                originalWidth,
                originalHeight,
                initialFit,
            };
        };

        // Process all files in parallel
        const results = await Promise.all(filesWithIds.map(processFile));

        // Add successful results to media array
        for (const result of results) {
            if (!result) continue;

            const { file, fileId, fileType, supabaseFileId, originalWidth, originalHeight, initialFit } = result;

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
                    volume: 50,
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

        const fileId = crypto.randomUUID();
        
        // Track loading for audio IMMEDIATELY before download starts
        dispatch(addMediaLoading({ fileId, fileName: libraryItem.name, type: 'audio' }));
        dispatch(updateMediaProgress({ fileId, progress: 5 }));

        try {
            // Download file from Supabase with simulated progress
            let currentProgress = 5;
            const maxDownloadProgress = 45;
            
            const progressInterval = setInterval(() => {
                const remaining = maxDownloadProgress - currentProgress;
                const increment = Math.max(0.5, remaining * 0.08);
                currentProgress = Math.min(maxDownloadProgress, currentProgress + increment);
                dispatch(updateMediaProgress({ fileId, progress: Math.round(currentProgress) }));
            }, 200);

            let file: File;
            try {
                file = await downloadMediaFile(libraryItem, user.id);
                clearInterval(progressInterval);
                dispatch(updateMediaProgress({ fileId, progress: 50 }));
            } catch (downloadError) {
                clearInterval(progressInterval);
                throw downloadError;
            }
            
            // Construct Supabase file ID from library item (format: {fileId}.{ext})
            const supabaseFileId = libraryItem.id
                ? (() => {
                      const fileExt = libraryItem.name.split('.').pop() || 'mp3';
                      return `${libraryItem.id}.${fileExt}`;
                  })()
                : undefined;
            
            try {
                // Store file in IndexedDB with progress tracking (50-100%)
                await storeFile(file, fileId, (progress) => {
                    dispatch(updateMediaProgress({ fileId, progress: 50 + (progress * 0.5) }));
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

    const handleLogout = () => {
        router.push('/');
    };

    const handleOpenLibrary = () => {
        setIsLibraryModalOpen(true);
    };

    const handleAddLibraryItemsToTimeline = async (items: LibraryItem[]) => {
        if (items.length === 0) return;

        if (!user) {
            toast.error('You must be logged in to add files from library');
            return;
        }

        // Filter valid items first
        const validItems = items.filter(item => 
            item.url && (!item.status || item.status === 'completed')
        );

        if (validItems.length === 0) {
            toast.error('No valid items to add');
            return;
        }

        // IMMEDIATELY add all items to the loading tracker before any downloads begin
        // This ensures the loader appears right away and shows all items at once
        const itemsWithFileIds = validItems.map(item => ({
            libraryItem: item,
            fileId: crypto.randomUUID(),
            fileType: item.type || 'video' as MediaType, // Will be updated after download
        }));

        // Add all items to loading tracker immediately
        for (const { fileId, libraryItem, fileType } of itemsWithFileIds) {
            dispatch(addMediaLoading({ fileId, fileName: libraryItem.name, type: fileType }));
        }

        const updatedFiles = [...(filesID || [])];
        const updatedMedia = [...mediaFiles];
        
        let replacedCount = 0;
        let addedCount = 0;

        // Helper to simulate progress during download (since Supabase doesn't provide download progress)
        const downloadWithSimulatedProgress = async (
            libraryItem: LibraryItem, 
            userId: string, 
            fileId: string
        ): Promise<File> => {
            // Start simulated progress animation
            let currentProgress = 5;
            const maxDownloadProgress = 45; // Will go from 5 to 45 during download
            
            const progressInterval = setInterval(() => {
                // Slowly increment progress to give feedback (ease out to slow down as it approaches max)
                const remaining = maxDownloadProgress - currentProgress;
                const increment = Math.max(0.5, remaining * 0.08); // Decreasing increments
                currentProgress = Math.min(maxDownloadProgress, currentProgress + increment);
                dispatch(updateMediaProgress({ fileId, progress: Math.round(currentProgress) }));
            }, 200);

            try {
                const file = await downloadMediaFile(libraryItem, userId);
                clearInterval(progressInterval);
                dispatch(updateMediaProgress({ fileId, progress: 50 }));
                return file;
            } catch (error) {
                clearInterval(progressInterval);
                throw error;
            }
        };

        // Process all items in parallel
        const processItem = async ({ libraryItem, fileId, fileType: initialFileType }: typeof itemsWithFileIds[0]) => {
            try {
                // Download file from Supabase with simulated progress (0-50%)
                dispatch(updateMediaProgress({ fileId, progress: 5 }));
                const file = await downloadWithSimulatedProgress(libraryItem, user.id, fileId);
                
                const fileType = libraryItem.type || categorizeFile(file.type);
                
                // Construct Supabase file ID (format: {fileId}.{ext})
                const supabaseFileId = libraryItem.id
                    ? (() => {
                          const fileExt = libraryItem.name.split('.').pop() || 
                              (fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'jpg');
                          return `${libraryItem.id}.${fileExt}`;
                      })()
                    : undefined;
                
                // Store in IndexedDB with progress tracking (50-100%)
                try {
                    await storeFile(file, fileId, (progress) => {
                        // Map 0-100 to 50-100 for the caching phase
                        dispatch(updateMediaProgress({ fileId, progress: 50 + (progress * 0.5) }));
                    });
                    dispatch(completeMediaLoading({ fileId }));
                    updatedFiles.push(fileId);
                } catch (error: any) {
                    dispatch(errorMediaLoading({ fileId, error: error.message || `Failed to cache ${fileType}` }));
                    console.error('Error storing file:', error);
                    toast.error(`Failed to load ${libraryItem.name}`);
                    return null;
                }
                
                // Skip audio files (handled separately)
                if (fileType === 'audio') {
                    return null;
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

                return {
                    libraryItem,
                    fileId,
                    fileType,
                    file,
                    supabaseFileId,
                    originalWidth,
                    originalHeight,
                    initialFit,
                };
            } catch (error: any) {
                dispatch(errorMediaLoading({ fileId, error: error.message || 'Failed to download' }));
                console.error('Error adding library item to timeline:', error);
                toast.error(`Failed to add ${libraryItem.name}: ${error.message}`);
                return null;
            }
        };

        // Process all items in parallel
        const results = await Promise.all(itemsWithFileIds.map(processItem));

        // Add successful results to media array
        for (const result of results) {
            if (!result) continue;

            const { libraryItem, fileId, fileType, file, supabaseFileId, originalWidth, originalHeight, initialFit } = result;

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

    const handleAddText = () => {
        const lastEnd = textElements.length > 0 ? Math.max(...textElements.map(f => f.positionEnd)) : 0;
        // Get the highest z-index from existing text elements, or default to 0
        const maxZIndex = textElements.length > 0 
            ? Math.max(...textElements.map(t => t.zIndex ?? 0))
            : -1;

        const newTextElement: TextElement = {
            ...DEFAULT_TEXT_STYLE,
            id: crypto.randomUUID(),
            text: "My Epic Trip",
            positionStart: lastEnd || 0,
            positionEnd: lastEnd + 3 || 3,
            x: 540,
            y: 576, // 30% of 1920
            fontSize: 48,
            zIndex: maxZIndex + 1, // Assign a z-index higher than all existing text elements
        };
        dispatch(setTextElements([...textElements, newTextElement]));
        dispatch(setActiveElement('text'));
        dispatch(setActiveElementIndex(textElements.length));
        toast.success("Text layer added");
    };

    const handleGoToProjects = () => {
        router.push('/');
    };

    return (
        <div className="w-full lg:w-72 bg-[#0f172a] lg:border-r border-slate-800 flex flex-col h-full overflow-hidden shrink-0 z-20">
            <div className="p-4 lg:p-6 border-b border-slate-800">
                <div className="flex items-center gap-2 lg:gap-3 mb-1">
                    <button
                        onClick={handleGoToProjects}
                        className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors group"
                        title="Back to Projects"
                    >
                        <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                    </button>
                    <button
                        onClick={handleGoToProjects}
                        className="flex items-center gap-2 group flex-1 min-w-0 hover:opacity-90 transition-opacity"
                    >
                        <Logo className="text-white" />
                    </button>
                    {isPremium && (
                        <span className="px-1.5 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-[10px] font-bold rounded flex items-center gap-1 shrink-0">
                            <Crown className="w-3 h-3 fill-current" /> PRO
                        </span>
                    )}
                </div>
                
                {user && (
                    <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                                <Zap className="w-3 h-3 text-yellow-400" /> AI Credits
                            </span>
                            <span className="text-xs text-white font-mono">
                                {isPremium ? '∞' : isUsageLoading ? '-/-' : `${creditsUsed}/${creditsLimit}`}
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all ${
                                    isPremium 
                                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 w-full' 
                                        : !canUseAI 
                                            ? 'bg-gradient-to-r from-red-500 to-orange-500' 
                                            : 'bg-blue-500'
                                }`}
                                style={{ width: isPremium ? '100%' : isUsageLoading ? '0%' : `${Math.min(((creditsUsed ?? 0) / creditsLimit) * 100, 100)}%` }}
                            />
                        </div>
                        {!isPremium && (
                            <button 
                                onClick={() => setShowUpgradeModal(true)}
                                className={`w-full mt-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                                    !canUseAI 
                                        ? 'text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/25'
                                        : 'text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30'
                                }`}
                            >
                                <Crown className="w-3 h-3" /> {!canUseAI ? 'Unlock More AI Credits' : 'Upgrade to PRO'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-4 lg:space-y-6 scrollbar-hide">
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
                        <button 
                            onClick={handleAddText}
                            className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-xl transition-all"
                        >
                            <Type className="w-6 h-6 mb-2" />
                            <span className="text-xs font-bold">Add Text</span>
                        </button>
                    </div>
                </div>

                {/* AI Tools Button */}
                <div>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> AI Tools
                    </h2>
                    <button 
                        onClick={() => setIsAIModalOpen(true)}
                        disabled={isAnalyzing}
                        className="w-full group relative text-left"
                    >
                        {/* Animated gradient border */}
                        <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-xl opacity-60 blur-[1px] group-hover:opacity-100 transition-opacity duration-500" 
                            style={{ 
                                backgroundSize: '200% 200%',
                                animation: 'gradient-x 3s ease infinite'
                            }} 
                        />
                        <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/30 backdrop-blur border border-transparent rounded-xl p-3 overflow-hidden">
                            {/* Background effects */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <div className="absolute top-2 right-3 opacity-30 group-hover:opacity-60 transition-opacity">
                                    <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
                                </div>
                                <div className="absolute -top-10 -right-10 w-20 h-20 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
                            </div>

                            <div className="relative flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform">
                                        <Wand2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                                        <span className="text-[6px] font-bold text-yellow-900">AI</span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
                                        Quick Start with AI
                                    </h3>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="flex items-center gap-1">
                                            <Video className="w-3 h-3 text-purple-400" />
                                            <span className="text-[10px] text-purple-300">Reference</span>
                                        </div>
                                        <span className="text-slate-600">|</span>
                                        <div className="flex items-center gap-1">
                                            <AudioWaveform className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[10px] text-cyan-300">Beats</span>
                                            <span className="text-[8px] px-1 py-0.5 bg-cyan-500/20 rounded text-cyan-400 font-medium">Soon</span>
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                            </div>
                        </div>
                    </button>
                </div>

                {/* Audio Track */}
                <div className="pb-4">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Audio Track</h2>
                    {!audioTrack ? (
                        <div className="space-y-2"> 
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

            {/* Upgrade Modal */}
            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                usedCount={creditsUsed ?? 0}
                limitCount={creditsLimit}
            />

            {/* AI Tools Modal */}
            <AIToolsModal
                isOpen={isAIModalOpen}
                onClose={() => setIsAIModalOpen(false)}
                onSelectTool={handleAIToolSelect}
                currentProject={{
                    projectName: projectName || 'Current Project',
                    mediaFilesCount: mediaFiles?.length || 0,
                    textElementsCount: textElements?.length || 0
                }}
                isProcessing={isAnalyzing}
            />
        </div>
    );
}

