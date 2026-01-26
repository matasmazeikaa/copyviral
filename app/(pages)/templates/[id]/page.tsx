'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { 
    Template, 
    TemplateSlot, 
    TemplateTextElement,
    TemplateImage,
    LibraryItem,
    MediaFolder 
} from '@/app/types';
import { getTemplate } from '@/app/services/templateService';
import { downloadMediaFileById, listUserMediaFilesInFolder } from '@/app/services/mediaLibraryService';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft,
    Loader2,
    Video,
    Type,
    Shuffle,
    Download,
    ChevronRight,
    ChevronLeft,
    Clock,
    Check,
    Film,
    Wand2,
    Package,
    Plus,
    X,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Music,
    Folder,
    RefreshCw
} from 'lucide-react';
import { BatchExport } from '@/app/components/editor/render/BatchExport';
import { LibraryModal } from '@/app/components/editor/AssetsPanel/LibraryModal';
import { Player, PlayerRef } from '@remotion/player';
import { TemplatePreviewComposition } from '@/app/components/editor/player/remotion/TemplatePreviewComposition';

type Step = 'videos' | 'text' | 'export';

interface SelectedVideo {
    id: string;
    file?: File;
    src: string;
    name: string;
    libraryItem: LibraryItem;
    fromFolder?: string; // Track which folder this video came from (if any)
}

interface PoolFolder {
    id: string;
    path: string;
    name: string;
    videos: SelectedVideo[];
    isLoading?: boolean;
}

export default function TemplatePage({ params }: { params: { id: string } }) {
    const { id } = params;
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    const templateType = (searchParams.get('type') as 'community' | 'personal') || 'community';
    
    // State
    const [template, setTemplate] = useState<Template | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentStep, setCurrentStep] = useState<Step>('videos');
    
    // Video selection state
    const [selectedVideos, setSelectedVideos] = useState<SelectedVideo[]>([]);
    const [slotAssignments, setSlotAssignments] = useState<Map<string, SelectedVideo>>(new Map());
    const [poolFolders, setPoolFolders] = useState<PoolFolder[]>([]); // Folders added to the video pool
    
    // Slot selection for media library
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    
    // Video preview state
    const [previewVideo, setPreviewVideo] = useState<SelectedVideo | null>(null);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [isPreviewMuted, setIsPreviewMuted] = useState(true);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    
    // Template preview player state (Remotion-based)
    const templatePlayerRef = useRef<PlayerRef>(null);
    
    // Text editing state
    const [editedTexts, setEditedTexts] = useState<Map<string, string>>(new Map());
    const [regeneratingTextId, setRegeneratingTextId] = useState<string | null>(null);
    
    // Export state
    const [selectedVariationCount, setSelectedVariationCount] = useState<number>(1);
    const [showBatchExport, setShowBatchExport] = useState(false);
    
    // Audio state (loaded from template's Supabase storage)
    const [audioFile, setAudioFile] = useState<{
        src: string;
        supabaseFileId?: string;
        fileName?: string;
        duration?: number;
        folder?: string | null;
    } | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    
    // Static images state (loaded from template's Supabase storage)
    const [loadedImages, setLoadedImages] = useState<(TemplateImage & { src: string })[]>([]);
    
    // Track blob URLs that were created during template loading for cleanup
    const loadedBlobUrls = useRef<string[]>([]);
    
    // Reset all state when template ID changes
    useEffect(() => {
        // Reset selection state
        setSelectedVideos([]);
        setSlotAssignments(new Map());
        setPoolFolders([]);
        setSelectedSlotId(null);
        setShowLibraryModal(false);
        setPreviewVideo(null);
        setIsPreviewPlaying(false);
        setEditedTexts(new Map());
        setSelectedVariationCount(1);
        setShowBatchExport(false);
        setAudioFile(null);
        setLoadedImages([]);
        setCurrentStep('videos');
        
        // Cleanup any existing blob URLs
        loadedBlobUrls.current.forEach(url => {
            URL.revokeObjectURL(url);
        });
        loadedBlobUrls.current = [];
    }, [id]);
    
    // Load template
    useEffect(() => {
        const loadTemplate = async () => {
            setIsLoading(true);
            try {
                const data = await getTemplate(id, templateType);
                if (data) {
                    setTemplate(data);
                    
                    // Initialize text values from template
                    const initialTexts = new Map<string, string>();
                    data.templateData.textElements.forEach(text => {
                        initialTexts.set(text.id, text.text);
                    });
                    setEditedTexts(initialTexts);
                    
                    // Load audio from Supabase if template has audio
                    // NOTE: Video slots are NOT pre-filled - they are empty placeholders for users to fill
                    if (data.templateData.audioSupabaseFileId && user?.id) {
                        setIsLoadingAudio(true);
                        console.log('[Template Audio] Loading audio:', {
                            supabaseFileId: data.templateData.audioSupabaseFileId,
                            fileName: data.templateData.audioFileName,
                            folder: data.templateData.audioFolder,
                            userId: user.id,
                        });
                        try {
                            let audioFileData: File | null = null;
                            let loadedFolder = data.templateData.audioFolder;
                            
                            // Try the specified folder first (or root if not specified)
                            try {
                                audioFileData = await downloadMediaFileById(
                                    data.templateData.audioSupabaseFileId,
                                    data.templateData.audioFileName || 'template_audio.mp4',
                                    user.id,
                                    data.templateData.audioFolder
                                );
                            } catch (firstError) {
                                console.warn('Audio not found in primary location, trying _ai_ref folder...', firstError);
                                
                                // Fallback: try _ai_ref folder (where AI-generated audio is stored)
                                // This handles templates saved before audioFolder was being persisted
                                if (!data.templateData.audioFolder || data.templateData.audioFolder !== '_ai_ref') {
                                    try {
                                        audioFileData = await downloadMediaFileById(
                                            data.templateData.audioSupabaseFileId,
                                            data.templateData.audioFileName || 'template_audio.mp4',
                                            user.id,
                                            '_ai_ref'
                                        );
                                        loadedFolder = '_ai_ref';
                                        console.log('Audio found in _ai_ref folder');
                                    } catch (fallbackError) {
                                        console.warn('Audio not found in _ai_ref folder either:', fallbackError);
                                        throw firstError; // Re-throw original error
                                    }
                                } else {
                                    throw firstError;
                                }
                            }
                            
                            if (audioFileData) {
                                const audioSrc = URL.createObjectURL(audioFileData);
                                loadedBlobUrls.current.push(audioSrc); // Track for cleanup
                                console.log('[Template Audio] Audio loaded successfully from folder:', loadedFolder);
                                setAudioFile({
                                    src: audioSrc,
                                    supabaseFileId: data.templateData.audioSupabaseFileId,
                                    fileName: data.templateData.audioFileName,
                                    duration: data.templateData.audioDuration,
                                    folder: loadedFolder,
                                });
                            }
                        } catch (audioError) {
                            console.error('[Template Audio] Failed to load template audio:', audioError);
                            // Don't fail the whole template load if audio fails
                        } finally {
                            setIsLoadingAudio(false);
                        }
                    }
                    
                    // Load static images from Supabase if template has them
                    console.log('[Template Load] Images in template:', data.templateData.images?.length || 0);
                    if (data.templateData.images && data.templateData.images.length > 0 && user?.id) {
                        console.log('[Template Load] Loading static images:', data.templateData.images);
                        const loadedImgs: (TemplateImage & { src: string })[] = [];
                        
                        await Promise.all(
                            data.templateData.images.map(async (image) => {
                                try {
                                    console.log('[Template Load] Downloading image:', image.fileName, image.supabaseFileId);
                                    const fileData = await downloadMediaFileById(
                                        image.supabaseFileId,
                                        image.fileName,
                                        user.id,
                                        image.supabaseFolder
                                    );
                                    const src = URL.createObjectURL(fileData);
                                    loadedBlobUrls.current.push(src); // Track for cleanup
                                    loadedImgs.push({ ...image, src });
                                    console.log('[Template Load] Successfully loaded image:', image.fileName);
                                } catch (err) {
                                    console.error(`[Template Load] Failed to load static image ${image.fileName}:`, err);
                                }
                            })
                        );
                        
                        console.log('[Template Load] Total images loaded:', loadedImgs.length);
                        if (loadedImgs.length > 0) {
                            setLoadedImages(loadedImgs);
                        }
                    } else {
                        console.log('[Template Load] No static images to load');
                    }
                } else {
                    toast.error('Template not found');
                    router.push('/');
                }
            } catch (error) {
                console.error('Error loading template:', error);
                toast.error('Failed to load template');
            } finally {
                setIsLoading(false);
            }
        };
        
        loadTemplate();
    }, [id, templateType, user?.id, router]);
    
    // Cleanup URLs only on unmount
    useEffect(() => {
        // Copy ref value to variable for cleanup function
        const blobUrlsToCleanup = loadedBlobUrls.current;
        return () => {
            // Cleanup loaded blob URLs that were created during template loading
            blobUrlsToCleanup.forEach(url => {
                URL.revokeObjectURL(url);
            });
        };
    }, []);
    
    // Handle slot click to open media library
    const handleSlotClick = (slotId: string) => {
        setSelectedSlotId(slotId);
        setShowLibraryModal(true);
    };
    
    // Handle media selection from library modal
    const handleMediaSelect = (items: LibraryItem[]) => {
        if (items.length === 0 || !template) return;
        
        // Get all existing videos (individual + folder videos) to check for duplicates
        const allExistingVideos = [
            ...selectedVideos,
            ...poolFolders.flatMap(f => f.videos)
        ];
        
        // For each selected item, either reuse existing SelectedVideo or create new one
        // This ensures slot assignments reference the same objects as the video pool
        const videosForAssignment: SelectedVideo[] = [];
        const newVideosForPool: SelectedVideo[] = [];
        
        items.forEach(item => {
            // Check if this library item is already in the pool (individual OR folder)
            const existing = allExistingVideos.find(v => v.libraryItem.id === item.id);
            
            if (existing) {
                // Reuse the existing video object for slot assignment
                videosForAssignment.push(existing);
            } else {
                // Create new video object
                const newVideo: SelectedVideo = {
                    id: crypto.randomUUID(),
                    src: item.url,
                    name: item.name,
                    libraryItem: item
                };
                videosForAssignment.push(newVideo);
                newVideosForPool.push(newVideo);
            }
        });
        
        // If we have a specific slot selected, assign videos starting from that slot
        if (selectedSlotId) {
            const slots = template.templateData.slots;
            const startIndex = slots.findIndex(s => s.id === selectedSlotId);
            
            if (startIndex !== -1) {
                // First add any new videos to the pool
                if (newVideosForPool.length > 0) {
                    setSelectedVideos(prev => [...prev, ...newVideosForPool]);
                }
                
                // Then assign to slots (using same references as pool)
                setSlotAssignments(prev => {
                    const newMap = new Map(prev);
                    
                    videosForAssignment.forEach((video, idx) => {
                        const slotIndex = startIndex + idx;
                        if (slotIndex < slots.length) {
                            newMap.set(slots[slotIndex].id, video);
                        }
                    });
                    
                    return newMap;
                });
                
                // Set last assigned as preview
                setPreviewVideo(videosForAssignment[videosForAssignment.length - 1]);
                
                // Show feedback
                const assignedCount = Math.min(videosForAssignment.length, slots.length - startIndex);
                if (assignedCount > 1) {
                    toast.success(`Assigned ${assignedCount} videos to slots ${startIndex + 1}-${startIndex + assignedCount}`);
                }
            }
        } else {
            // Adding more videos to the pool only
            if (newVideosForPool.length > 0) {
                setSelectedVideos(prev => [...prev, ...newVideosForPool]);
                setPreviewVideo(newVideosForPool[newVideosForPool.length - 1]);
                toast.success(`Added ${newVideosForPool.length} video${newVideosForPool.length > 1 ? 's' : ''} to pool`);
            } else if (items.length > 0) {
                toast('Videos already in pool', { icon: 'ℹ️' });
            }
        }
        
        setSelectedSlotId(null);
        setShowLibraryModal(false);
    };
    
    // Handle adding more videos (not for specific slot)
    const handleAddMoreVideos = () => {
        setSelectedSlotId(null);
        setShowLibraryModal(true);
    };

    // Handle folder selection for the video pool
    const handleFolderSelect = async (folders: MediaFolder[]) => {
        if (!user || folders.length === 0) return;

        // Filter out folders that are already in the pool
        const newFolders = folders.filter(
            f => !poolFolders.some(pf => pf.path === f.path)
        );

        if (newFolders.length === 0) {
            toast('Folders already in pool', { icon: 'ℹ️' });
            return;
        }

        // Add folders with loading state
        const foldersToAdd: PoolFolder[] = newFolders.map(f => ({
            id: crypto.randomUUID(),
            path: f.path,
            name: f.name,
            videos: [],
            isLoading: true,
        }));

        setPoolFolders(prev => [...prev, ...foldersToAdd]);

        // Load videos from each folder
        for (const folder of foldersToAdd) {
            try {
                const items = await listUserMediaFilesInFolder(user.id, folder.path);
                // Filter for videos/images only, excluding system files
                const mediaItems = items.filter(item => 
                    (item.type === 'video' || item.type === 'image') &&
                    !item.name.includes('_thumb.') &&
                    !item.folder?.includes('thumbnails') &&
                    !item.folder?.includes('_ai_ref')
                );
                
                const videos: SelectedVideo[] = mediaItems.map(item => ({
                    id: crypto.randomUUID(),
                    src: item.url,
                    name: item.name,
                    libraryItem: item,
                    fromFolder: folder.path,
                }));

                setPoolFolders(prev => prev.map(pf => 
                    pf.id === folder.id 
                        ? { ...pf, videos, isLoading: false }
                        : pf
                ));

                if (videos.length > 0) {
                    toast.success(`Loaded ${videos.length} video${videos.length > 1 ? 's' : ''} from "${folder.name}"`);
                } else {
                    toast(`No videos found in "${folder.name}"`, { icon: 'ℹ️' });
                }
            } catch (error) {
                console.error('Error loading folder videos:', error);
                setPoolFolders(prev => prev.map(pf => 
                    pf.id === folder.id 
                        ? { ...pf, isLoading: false }
                        : pf
                ));
                toast.error(`Failed to load videos from "${folder.name}"`);
            }
        }
    };

    // Refresh videos from a folder
    const refreshFolder = async (folderId: string) => {
        if (!user) return;
        
        const folder = poolFolders.find(f => f.id === folderId);
        if (!folder) return;

        setPoolFolders(prev => prev.map(pf => 
            pf.id === folderId ? { ...pf, isLoading: true } : pf
        ));

        try {
            const items = await listUserMediaFilesInFolder(user.id, folder.path);
            // Filter for videos/images only, excluding system files
            const mediaItems = items.filter(item => 
                (item.type === 'video' || item.type === 'image') &&
                !item.name.includes('_thumb.') &&
                !item.folder?.includes('thumbnails') &&
                !item.folder?.includes('_ai_ref')
            );
            
            const videos: SelectedVideo[] = mediaItems.map(item => ({
                id: crypto.randomUUID(),
                src: item.url,
                name: item.name,
                libraryItem: item,
                fromFolder: folder.path,
            }));

            setPoolFolders(prev => prev.map(pf => 
                pf.id === folderId 
                    ? { ...pf, videos, isLoading: false }
                    : pf
            ));

            toast.success(`Refreshed "${folder.name}" - ${videos.length} video${videos.length !== 1 ? 's' : ''}`);
        } catch (error) {
            console.error('Error refreshing folder:', error);
            setPoolFolders(prev => prev.map(pf => 
                pf.id === folderId ? { ...pf, isLoading: false } : pf
            ));
            toast.error('Failed to refresh folder');
        }
    };

    // Remove a folder from the pool
    const removeFolder = (folderId: string) => {
        const folder = poolFolders.find(f => f.id === folderId);
        if (!folder) return;

        // Remove folder from pool
        setPoolFolders(prev => prev.filter(f => f.id !== folderId));

        // Also clear any slot assignments that used videos from this folder
        setSlotAssignments(prev => {
            const newMap = new Map(prev);
            Array.from(newMap.entries()).forEach(([slotId, video]) => {
                if (video.fromFolder === folder.path) {
                    newMap.delete(slotId);
                }
            });
            return newMap;
        });
    };
    
    // Remove a video from selection
    const removeVideo = (videoId: string) => {
        setSelectedVideos(prev => prev.filter(v => v.id !== videoId));
        
        // Also remove from any slot assignments
        setSlotAssignments(prev => {
            const newMap = new Map(prev);
            Array.from(newMap.entries()).forEach(([slotId, video]) => {
                if (video.id === videoId) {
                    newMap.delete(slotId);
                }
            });
            return newMap;
        });
        
        // Clear preview if it was this video
        if (previewVideo?.id === videoId) {
            setPreviewVideo(null);
        }
    };
    
    // Preview video controls
    const togglePreviewPlay = () => {
        if (previewVideoRef.current) {
            if (isPreviewPlaying) {
                previewVideoRef.current.pause();
            } else {
                previewVideoRef.current.play();
            }
            setIsPreviewPlaying(!isPreviewPlaying);
        }
    };
    
    const togglePreviewMute = () => {
        if (previewVideoRef.current) {
            previewVideoRef.current.muted = !isPreviewMuted;
            setIsPreviewMuted(!isPreviewMuted);
        }
    };
    
    // Template preview player controls
    // Template duration calculation
    const templateDuration = template?.templateData.slots.reduce((max, slot) => 
        Math.max(max, slot.positionEnd), 0) || audioFile?.duration || 0;
    
    const fps = 30;
    
    // Convert slot assignments Map to plain object for Remotion inputProps
    const getSlotAssignmentsForRemtion = useCallback(() => {
        const result: Record<string, { id: string; src: string; type: 'video' | 'image' | 'audio' | 'unknown' }> = {};
        slotAssignments.forEach((video, slotId) => {
            result[slotId] = {
                id: video.id,
                src: video.src,
                type: video.libraryItem.type || 'video',
            };
        });
        return result;
    }, [slotAssignments]);
    
    // Convert edited texts Map to plain object for Remotion inputProps  
    const getEditedTextsForRemotion = useCallback(() => {
        const result: Record<string, string> = {};
        editedTexts.forEach((text, id) => {
            result[id] = text;
        });
        return result;
    }, [editedTexts]);
    
    // Get all videos from both individual selection and folders
    const getAllPoolVideos = useCallback((): SelectedVideo[] => {
        const folderVideos = poolFolders.flatMap(f => f.videos);
        // Combine individual videos and folder videos, avoiding duplicates by libraryItem.id
        const allVideos = [...selectedVideos];
        folderVideos.forEach(fv => {
            if (!allVideos.some(v => v.libraryItem.id === fv.libraryItem.id)) {
                allVideos.push(fv);
            }
        });
        return allVideos;
    }, [selectedVideos, poolFolders]);

    // Randomly assign videos to slots
    const randomizeAssignments = useCallback(() => {
        const allVideos = getAllPoolVideos();
        if (!template || allVideos.length === 0) return;
        
        const slots = template.templateData.slots;
        const newAssignments = new Map<string, SelectedVideo>();
        
        // Shuffle videos
        const shuffledVideos = [...allVideos].sort(() => Math.random() - 0.5);
        
        // Assign to slots (cycle if fewer videos than slots)
        slots.forEach((slot, index) => {
            const videoIndex = index % shuffledVideos.length;
            newAssignments.set(slot.id, shuffledVideos[videoIndex]);
        });
        
        setSlotAssignments(newAssignments);
        toast.success('Slots shuffled!');
    }, [template, getAllPoolVideos]);
    
    // Handle text change
    const handleTextChange = (textId: string, value: string) => {
        setEditedTexts(prev => {
            const newMap = new Map(prev);
            newMap.set(textId, value);
            return newMap;
        });
    };
    
    // Regenerate text with AI
    const regenerateText = async (textElement: TemplateTextElement) => {
        if (!user) {
            toast.error('Please sign in to use AI features');
            return;
        }
        
        setRegeneratingTextId(textElement.id);
        
        try {
            const response = await fetch('/api/ai/regenerate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalText: textElement.text,
                    currentText: editedTexts.get(textElement.id) || textElement.text,
                    context: template?.name || 'video template'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to regenerate text');
            }
            
            const data = await response.json();
            handleTextChange(textElement.id, data.text);
            toast.success('Text regenerated!');
        } catch (error: any) {
            console.error('Error regenerating text:', error);
            toast.error(error.message || 'Failed to regenerate text');
        } finally {
            setRegeneratingTextId(null);
        }
    };
    
    // Handle export - opens the BatchExport modal
    const handleExport = () => {
        if (!template || slotAssignments.size === 0) {
            toast.error('Please select videos for all slots');
            return;
        }
        
        setShowBatchExport(true);
    };
    
    // Step validation - consider both individual videos and folder videos
    const totalPoolVideos = getAllPoolVideos().length;
    const canProceedFromVideos = totalPoolVideos > 0 && slotAssignments.size === template?.templateData.slots.length;
    const canProceedFromText = true; // Text editing is optional
    
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };
    
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                    <p className="text-slate-400">Loading template...</p>
                </div>
            </div>
        );
    }
    
    if (!template) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-slate-400">Template not found</p>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
            
            <div className="relative flex">
                {/* Main Content */}
                <div className="flex-1 max-w-4xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back</span>
                    </button>
                    
                    <div className="text-center">
                        <h1 className="text-xl sm:text-2xl font-bold text-white">{template.name}</h1>
                        <p className="text-sm text-slate-400">
                            {template.templateData.slots.length} slots • {template.templateData.textElements.length} text elements
                            {template.templateData.audioSupabaseFileId && ' • 🎵 Audio included'}
                        </p>
                    </div>
                    
                    <div className="w-20" /> {/* Spacer for centering */}
                </div>
                
                {/* Template Preview Player - Remotion-based */}
                {(slotAssignments.size > 0 || loadedImages.length > 0) && (
                    <div className="mb-6 flex justify-center">
                        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 max-w-xs w-full">
                            {/* Remotion Player */}
                            <div className="rounded-lg overflow-hidden mb-3">
                                <Player
                                    ref={templatePlayerRef}
                                    component={TemplatePreviewComposition as React.ComponentType<Record<string, unknown>>}
                                    inputProps={{
                                        slots: template.templateData.slots,
                                        slotAssignments: getSlotAssignmentsForRemtion(),
                                        textElements: template.templateData.textElements,
                                        editedTexts: getEditedTextsForRemotion(),
                                        images: loadedImages,
                                        audioSrc: audioFile?.src,
                                    }}
                                    durationInFrames={Math.max(1, Math.floor(templateDuration * fps))}
                                    compositionWidth={template.templateData.resolution.width || 1080}
                                    compositionHeight={template.templateData.resolution.height || 1920}
                                    fps={fps}
                                    style={{ 
                                        width: '100%',
                                        aspectRatio: template.templateData.aspectRatio === '9:16' ? '9/16' : 
                                                     template.templateData.aspectRatio === '1:1' ? '1/1' : '16/9',
                                    }}
                                    controls
                                    clickToPlay
                                    doubleClickToFullscreen={false}
                                />
                            </div>
                            
                            {/* Audio indicator */}
                            {audioFile && (
                                <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                                    <Music className="w-3.5 h-3.5 text-purple-400" />
                                    <span>Audio included</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {(['videos', 'text', 'export'] as Step[]).map((step, index) => {
                        const isActive = currentStep === step;
                        const isPast = ['videos', 'text', 'export'].indexOf(currentStep) > index;
                        const icons = { videos: Video, text: Type, export: Download };
                        const Icon = icons[step];
                        
                        return (
                            <div key={step} className="flex items-center">
                                <button
                                    onClick={() => setCurrentStep(step)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                                        isActive
                                            ? 'bg-purple-600 text-white'
                                            : isPast
                                            ? 'bg-purple-600/20 text-purple-300'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {isPast && !isActive ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <Icon className="w-4 h-4" />
                                    )}
                                    <span className="hidden sm:inline capitalize">{step === 'videos' ? 'Select Videos' : step === 'text' ? 'Edit Text' : 'Export'}</span>
                                </button>
                                {index < 2 && (
                                    <ChevronRight className="w-5 h-5 text-slate-600 mx-2" />
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {/* Step Content */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                    {/* Step 1: Video Selection */}
                    {currentStep === 'videos' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Assign Videos to Slots</h2>
                                    <p className="text-sm text-slate-400">
                                        Click on a slot to select a video from your library
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleAddMoreVideos}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Add Videos</span>
                                    </button>
                                    <button
                                        onClick={randomizeAssignments}
                                        disabled={totalPoolVideos === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Shuffle className="w-4 h-4" />
                                        <span>Shuffle</span>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Template Slots - Clickable */}
                            <div className="bg-slate-800/50 rounded-xl p-4">
                                <h3 className="text-sm font-medium text-slate-300 mb-3">Template Slots <span className="text-slate-500">(click to change)</span></h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {template.templateData.slots.map((slot, index) => {
                                        const assigned = slotAssignments.get(slot.id);
                                        return (
                                            <button
                                                key={slot.id}
                                                onClick={() => handleSlotClick(slot.id)}
                                                onMouseEnter={() => assigned && setPreviewVideo(assigned)}
                                                className={`group relative aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-all hover:scale-[1.02] ${
                                                    assigned
                                                        ? 'border-purple-500 bg-purple-500/10 hover:border-purple-400'
                                                        : 'border-slate-600 bg-slate-800/50 hover:border-purple-500 hover:bg-purple-500/5'
                                                }`}
                                            >
                                                {assigned ? (
                                                    <>
                                                        <div className="absolute inset-0 rounded-lg overflow-hidden">
                                                            {assigned.libraryItem.type === 'video' ? (
                                                                <video 
                                                                    src={assigned.src} 
                                                                    className="w-full h-full object-cover" 
                                                                    muted 
                                                                />
                                                            ) : (
                                                                <img 
                                                                    src={assigned.src} 
                                                                    alt="" 
                                                                    className="w-full h-full object-cover" 
                                                                />
                                                            )}
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <span className="text-xs text-white font-medium">Change</span>
                                                            </div>
                                                        </div>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-white/80 truncate max-w-[60%]">{assigned.name}</span>
                                                                <div className="flex items-center gap-1 text-[10px] text-white/60">
                                                                    <Clock className="w-2.5 h-2.5" />
                                                                    <span>{formatDuration(slot.duration)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="flex flex-col items-center justify-center">
                                                            <div className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center mb-2 group-hover:bg-purple-500/20 transition-colors">
                                                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-purple-400 transition-colors" />
                                                            </div>
                                                            <span className="text-xs text-slate-400 font-medium">Slot {index + 1}</span>
                                                            <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                                                                <Clock className="w-2.5 h-2.5" />
                                                                <span>{formatDuration(slot.duration)}</span>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            {/* Video Pool - Always visible */}
                            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-medium text-white flex items-center gap-2">
                                            <Shuffle className="w-4 h-4 text-purple-400" />
                                            Video Pool for Variations
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Add videos or folders for unique variations when generating multiple exports
                                        </p>
                                    </div>
                                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
                                        {totalPoolVideos} video{totalPoolVideos !== 1 ? 's' : ''} total
                                    </span>
                                </div>

                                {/* Folders Section */}
                                {poolFolders.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                                            <Folder className="w-3.5 h-3.5 text-amber-500" />
                                            Folders ({poolFolders.length})
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {poolFolders.map(folder => (
                                                <div 
                                                    key={folder.id}
                                                    className="relative group bg-slate-800/80 rounded-lg border border-slate-700 hover:border-amber-500/50 transition-colors"
                                                >
                                                    <div className="px-3 py-2 flex items-center gap-2">
                                                        <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-white truncate max-w-[100px]" title={folder.name}>
                                                                {folder.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {folder.isLoading ? (
                                                                    <span className="flex items-center gap-1">
                                                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                                        Loading...
                                                                    </span>
                                                                ) : (
                                                                    `${folder.videos.length} video${folder.videos.length !== 1 ? 's' : ''}`
                                                                )}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => refreshFolder(folder.id)}
                                                            disabled={folder.isLoading}
                                                            className="p-1 text-slate-500 hover:text-white rounded transition-colors disabled:opacity-50"
                                                            title="Refresh folder"
                                                        >
                                                            <RefreshCw className={`w-3 h-3 ${folder.isLoading ? 'animate-spin' : ''}`} />
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFolder(folder.id)}
                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Individual Videos Section */}
                                {(selectedVideos.length > 0 || poolFolders.length === 0) && (
                                    <div>
                                        {poolFolders.length > 0 && selectedVideos.length > 0 && (
                                            <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                                                <Film className="w-3.5 h-3.5 text-purple-400" />
                                                Individual Videos ({selectedVideos.length})
                                            </h4>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {selectedVideos.map(video => (
                                                <div 
                                                    key={video.id}
                                                    className="relative group"
                                                    onMouseEnter={() => setPreviewVideo(video)}
                                                >
                                                    <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-slate-700 hover:border-purple-500 transition-colors cursor-pointer">
                                                        {video.libraryItem.type === 'video' ? (
                                                            <video 
                                                                src={video.src} 
                                                                className="w-full h-full object-cover" 
                                                                muted 
                                                            />
                                                        ) : (
                                                            <img 
                                                                src={video.src} 
                                                                alt={video.name} 
                                                                className="w-full h-full object-cover" 
                                                            />
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => removeVideo(video.id)}
                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={handleAddMoreVideos}
                                                className="w-16 h-16 rounded-lg border-2 border-dashed border-purple-500/50 hover:border-purple-400 hover:bg-purple-500/10 flex flex-col items-center justify-center transition-all group"
                                            >
                                                <Plus className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                                                <span className="text-[9px] text-purple-400 mt-0.5">Add</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                {totalPoolVideos > template.templateData.slots.length && (
                                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
                                        <Check className="w-3.5 h-3.5" />
                                        <span>
                                            {totalPoolVideos - template.templateData.slots.length} extra video{totalPoolVideos - template.templateData.slots.length !== 1 ? 's' : ''} will create more variety in your exports!
                                        </span>
                                    </div>
                                )}
                                
                                {totalPoolVideos === 0 && (
                                    <p className="text-xs text-slate-500 mt-2 text-center">
                                        Click on slots above or use &quot;Add Videos&quot; to build your pool (you can add individual videos or entire folders)
                                    </p>
                                )}
                            </div>
                            
                            <p className="text-sm text-slate-500 text-center">
                                {slotAssignments.size}/{template.templateData.slots.length} slots filled
                            </p>
                        </div>
                    )}
                    
                    {/* Step 2: Text Editing */}
                    {currentStep === 'text' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Edit Text Elements</h2>
                                <p className="text-sm text-slate-400">
                                    Customize the text or use AI to regenerate
                                </p>
                            </div>
                            
                            {template.templateData.textElements.length === 0 ? (
                                <div className="text-center py-12 bg-slate-800/30 rounded-xl">
                                    <Type className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                    <p className="text-slate-400">No text elements in this template</p>
                                    <p className="text-sm text-slate-500">Continue to export</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {template.templateData.textElements.map((textElement, index) => (
                                        <div
                                            key={textElement.id}
                                            className="bg-slate-800/50 rounded-xl p-4"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm font-medium text-slate-300">
                                                    Text {index + 1}
                                                    <span className="text-slate-500 ml-2">
                                                        ({formatDuration(textElement.positionStart)} - {formatDuration(textElement.positionEnd)})
                                                    </span>
                                                </label>
                                                <button
                                                    onClick={() => regenerateText(textElement)}
                                                    disabled={regeneratingTextId === textElement.id}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 text-purple-300 rounded-lg text-sm transition-all disabled:opacity-50"
                                                >
                                                    {regeneratingTextId === textElement.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Wand2 className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>Regenerate</span>
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={editedTexts.get(textElement.id) || ''}
                                                onChange={(e) => handleTextChange(textElement.id, e.target.value)}
                                                placeholder={textElement.placeholder || 'Enter text...'}
                                                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Step 3: Export */}
                    {currentStep === 'export' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Generate Variations</h2>
                                <p className="text-sm text-slate-400">
                                    Create multiple unique videos with randomized slot assignments
                                </p>
                            </div>
                            
                            {/* Variation Count Selection */}
                            <div className="bg-slate-800/50 rounded-xl p-6">
                                <h3 className="text-sm font-medium text-slate-300 mb-4">How many variations?</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    {[1, 2, 5, 10].map(count => (
                                        <button
                                            key={count}
                                            onClick={() => setSelectedVariationCount(count)}
                                            className={`py-4 rounded-xl font-bold text-xl transition-all ${
                                                selectedVariationCount === count
                                                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                            }`}
                                        >
                                            {count}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 mt-3 text-center">
                                    Each variation will have a different random arrangement of your selected videos
                                </p>
                            </div>
                            
                            {/* Summary */}
                            <div className="bg-slate-800/50 rounded-xl p-6">
                                <h3 className="text-sm font-medium text-slate-300 mb-4">Export Summary</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-slate-400">
                                        <span>Videos in pool:</span>
                                        <span className="text-white">
                                            {totalPoolVideos}
                                            {poolFolders.length > 0 && (
                                                <span className="text-slate-500 text-xs ml-1">
                                                    ({selectedVideos.length} individual + {poolFolders.reduce((sum, f) => sum + f.videos.length, 0)} from {poolFolders.length} folder{poolFolders.length !== 1 ? 's' : ''})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Template slots:</span>
                                        <span className="text-white">{template.templateData.slots.length}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Text elements:</span>
                                        <span className="text-white">{template.templateData.textElements.length}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Audio track:</span>
                                        <span className={audioFile ? 'text-emerald-400' : template.templateData.audioSupabaseFileId ? 'text-yellow-400' : 'text-slate-500'}>
                                            {audioFile 
                                                ? '✓ Included' 
                                                : isLoadingAudio 
                                                    ? 'Loading...' 
                                                    : template.templateData.audioSupabaseFileId 
                                                        ? 'Loading failed' 
                                                        : 'None'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Variations to generate:</span>
                                        <span className="text-white font-bold">{selectedVariationCount}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Export Button */}
                            <button
                                onClick={handleExport}
                                disabled={slotAssignments.size < template.templateData.slots.length}
                                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/25 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Package className="w-5 h-5" />
                                <span>Generate {selectedVariationCount} Video{selectedVariationCount > 1 ? 's' : ''}</span>
                            </button>
                        </div>
                    )}
                </div>
                
                {/* Navigation Buttons */}
                <div className="flex justify-between mt-6">
                    <button
                        onClick={() => {
                            const steps: Step[] = ['videos', 'text', 'export'];
                            const currentIndex = steps.indexOf(currentStep);
                            if (currentIndex > 0) {
                                setCurrentStep(steps[currentIndex - 1]);
                            }
                        }}
                        disabled={currentStep === 'videos'}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span>Back</span>
                    </button>
                    
                    {currentStep !== 'export' && (
                        <button
                            onClick={() => {
                                const steps: Step[] = ['videos', 'text', 'export'];
                                const currentIndex = steps.indexOf(currentStep);
                                if (currentIndex < steps.length - 1) {
                                    setCurrentStep(steps[currentIndex + 1]);
                                }
                            }}
                            disabled={currentStep === 'videos' && !canProceedFromVideos}
                            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>Continue</span>
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
                </div>
                
                
            </div>
            
            {/* Library Modal */}
            <LibraryModal
                isOpen={showLibraryModal}
                onClose={() => {
                    setShowLibraryModal(false);
                    setSelectedSlotId(null);
                }}
                onAddToTimeline={handleMediaSelect}
                onSelectFolders={handleFolderSelect}
                allowFolderSelection={true}
                type="video"
            />
            
            {/* Batch Export Modal */}
            {template && (
                <BatchExport
                    isOpen={showBatchExport}
                    onClose={() => setShowBatchExport(false)}
                    templateData={template.templateData}
                    selectedVideos={getAllPoolVideos()}
                    slotAssignments={slotAssignments}
                    editedTexts={editedTexts}
                    variationCount={selectedVariationCount}
                    audioFile={audioFile}
                    loadedImages={loadedImages}
                />
            )}
        </div>
    );
}
