"use client";

import { listFiles, useAppDispatch, useAppSelector, storeFile, store } from "../../../../store";
import { setMediaFiles, setFilesID } from "../../../../store/slices/projectSlice";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "../../../../store/slices/loadingSlice";
import { categorizeFile } from "../../../../utils/utils";
import Image from 'next/image';
import { useAuth } from "../../../../contexts/AuthContext";
import toast from 'react-hot-toast';
import { MediaFile } from "../../../../types";
import { getVideoDimensions, calculateVideoFit } from "../../../../utils/videoDimensions";
import { uploadMediaFile } from "../../../../services/mediaLibraryService";
import { ACCEPT_MEDIA_TYPES, validateFilesForUpload } from "../../../../constants/storage";

const DEFAULT_MEDIA_TIME = 2;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export default function AddMedia() {
    const { mediaFiles, filesID, id: projectId } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const { user } = useAuth();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;

        if (!user || !projectId) {
            toast.error('You must be logged in and have a project open to upload files');
            e.target.value = "";
            return;
        }

        // Validate files (check size limit: 1GB, and type: video/audio only)
        const { validFiles: newFiles, errors } = validateFilesForUpload(selectedFiles);
        
        // Show errors for invalid files
        errors.forEach(error => toast.error(error));
        
        if (newFiles.length === 0) {
            e.target.value = "";
            return;
        }

        const updatedFiles = [...filesID || []];
        const updatedMedia = [...mediaFiles];
        
        for (const file of newFiles) {
            const fileId = crypto.randomUUID();
            const fileType = categorizeFile(file.type);
            
            // Create temporary src from file
            const tempSrc = URL.createObjectURL(file);
            
            // Calculate position
            const relevantClips = mediaFiles.filter(clip => clip.type === fileType);
            const lastEnd = relevantClips.length > 0
                ? Math.max(...relevantClips.map(f => f.positionEnd))
                : 0;
            
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
            
            const finalFit = fileType === 'video' && initialFit 
                ? initialFit 
                : {
                    x: 0,
                    y: 0,
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                };
            
            // Add media file immediately with uploading status
            const newMediaFile: MediaFile = {
                id: crypto.randomUUID(),
                fileName: file.name,
                fileId: fileId,
                startTime: 0,
                endTime: DEFAULT_MEDIA_TIME,
                src: tempSrc,
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
                status: 'uploading',
                // supabaseFileId will be set after upload to Supabase
            };
            
            updatedMedia.push(newMediaFile);
            updatedFiles.push(fileId);
        }
        
        // Dispatch all media files at once to avoid multiple re-renders
        dispatch(setMediaFiles(updatedMedia));
        dispatch(setFilesID(updatedFiles));
        e.target.value = "";
        
        // Store files to IndexedDB with progress tracking (for video, audio, and large images)
        newFiles.forEach(async (file, index) => {
            const fileId = updatedFiles[updatedFiles.length - newFiles.length + index];
            const fileType = categorizeFile(file.type);
            
            // Track loading for video, audio, and large images (> 1MB)
            const shouldTrackProgress = fileType === 'video' || fileType === 'audio' || (fileType === 'image' && file.size > 1024 * 1024);
            
            if (shouldTrackProgress) {
                // Add to loading tracker
                dispatch(addMediaLoading({ fileId, fileName: file.name, type: fileType }));
                
                try {
                    // Upload to Supabase first (for fallback when IndexedDB is cleared)
                    let supabaseFileId: string | undefined;
                    try {
                        const libraryItem = await uploadMediaFile(file, user.id);
                        // The Supabase file ID is stored as {fileId}.{ext} in the user's folder
                        const fileExt = file.name.split('.').pop() || (fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'jpg');
                        supabaseFileId = `${libraryItem.id}.${fileExt}`;
                    } catch (uploadError: any) {
                        console.warn(`Failed to upload ${fileType} to Supabase (will continue with local storage only):`, uploadError);
                        // Continue without Supabase ID - media will work locally but won't have fallback
                    }
                    
                    // Store file in IndexedDB with progress tracking
                    await storeFile(file, fileId, (progress) => {
                        dispatch(updateMediaProgress({ fileId, progress }));
                    });
                    
                    // Update media file with Supabase file ID
                    const currentMediaFiles = store.getState().projectState.mediaFiles;
                    dispatch(setMediaFiles(
                        currentMediaFiles.map(m => 
                            m.fileId === fileId 
                                ? { ...m, status: 'ready' as const, supabaseFileId } 
                                : m
                        )
                    ));
                    
                    // Mark as completed
                    dispatch(completeMediaLoading({ fileId }));
                } catch (error: any) {
                    toast.error(`Failed to load ${file.name}: ${error.message}`);
                    console.error('Loading error:', error);
                    dispatch(errorMediaLoading({ fileId, error: error.message || `Failed to load ${fileType}` }));
                    
                    // Update status to error
                    const currentMediaFiles = store.getState().projectState.mediaFiles;
                    dispatch(setMediaFiles(
                        currentMediaFiles.map(m => m.fileId === fileId ? { ...m, status: 'error' as const } : m)
                    ));
                }
            } else {
                // For small images, just store without progress tracking
                try {
                    await storeFile(file, fileId);
                    const currentMediaFiles = store.getState().projectState.mediaFiles;
                    dispatch(setMediaFiles(
                        currentMediaFiles.map(m => m.fileId === fileId ? { ...m, status: 'ready' as const } : m)
                    ));
                } catch (error: any) {
                    toast.error(`Failed to load ${file.name}: ${error.message}`);
                    console.error('Loading error:', error);
                    const currentMediaFiles = store.getState().projectState.mediaFiles;
                    dispatch(setMediaFiles(
                        currentMediaFiles.map(m => m.fileId === fileId ? { ...m, status: 'error' as const } : m)
                    ));
                }
            }
        });
    };

    return (
        <div
        >
            <label
                htmlFor="file-upload"
                className="cursor-pointer rounded-full bg-white border border-solid border-transparent transition-colors flex flex-row gap-2 items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-auto py-2 px-2 sm:px-5 sm:w-auto"
            >
                <Image
                    alt="Add Project"
                    className="Black"
                    height={12}
                    width={12}
                    src="https://www.svgrepo.com/show/514275/upload-cloud.svg"
                />
                <span className="text-xs">Add Media</span>
            </label>
            <input
                type="file"
                accept={ACCEPT_MEDIA_TYPES}
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
            />
        </div>
    );
}
