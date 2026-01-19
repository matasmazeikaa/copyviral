"use client";

import { listFiles, useAppDispatch, useAppSelector, storeFile, store } from "../../../../store";
import { setMediaFiles, setFilesID } from "../../../../store/slices/projectSlice";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "../../../../store/slices/loadingSlice";
import { categorizeFile } from "../../../../utils/utils";
import Image from 'next/image';
import { useAuth } from "../../../../contexts/AuthContext";
import toast from 'react-hot-toast';
import { MediaFile } from "../../../../types";
import { uploadMediaFile } from "../../../../services/mediaLibraryService";
import { getAudioDuration } from "../../../../utils/videoDimensions";
import { validateFilesForUpload } from "../../../../constants/storage";

const DEFAULT_MEDIA_TIME = 2;

export default function UploadAudio() {
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

        // Validate files (check size limit: 1GB)
        const { validFiles: newFiles, errors } = validateFilesForUpload(selectedFiles);
        
        // Show errors for invalid files
        errors.forEach(error => toast.error(error));
        
        if (newFiles.length === 0) {
            e.target.value = "";
            return;
        }

        const updatedFiles = [...filesID || []];
        const updatedMedia = [...mediaFiles];
        
        // Process each file and get its duration
        for (const file of newFiles) {
            const fileId = crypto.randomUUID();
            const fileType = categorizeFile(file.type);
            
            // Only handle audio files
            if (fileType !== 'audio') {
                continue;
            }
            
            // Create temporary src from file
            const tempSrc = URL.createObjectURL(file);
            
            // Get actual audio duration
            let audioDuration = DEFAULT_MEDIA_TIME;
            try {
                audioDuration = await getAudioDuration(file);
            } catch (error) {
                console.warn('Failed to get audio duration, using default:', error);
                // Keep DEFAULT_MEDIA_TIME as fallback
            }
            
            // Calculate position - audio files typically start at 0 and span the full audio duration
            const relevantClips = mediaFiles.filter(clip => clip.type === 'audio');
            const lastEnd = relevantClips.length > 0
                ? Math.max(...relevantClips.map(f => f.positionEnd))
                : 0;
            
            // Add media file immediately with uploading status
            const newMediaFile: MediaFile = {
                id: crypto.randomUUID(),
                fileName: file.name,
                fileId: fileId,
                startTime: 0,
                endTime: audioDuration,
                src: tempSrc,
                positionStart: 0,
                positionEnd: audioDuration,
                includeInMerge: true,
                playbackSpeed: 1,
                volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
                type: fileType,
                zIndex: 0,
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
        
        // Store files to IndexedDB with progress tracking
        newFiles.forEach(async (file, index) => {
            const fileId = updatedFiles[updatedFiles.length - newFiles.length + index];
            const fileType = categorizeFile(file.type);
            
            // Only track loading for audio files
            if (fileType === 'audio') {
                // Add to loading tracker
                dispatch(addMediaLoading({ fileId, fileName: file.name, type: fileType }));
                
                try {
                    // Upload to Supabase first (for fallback when IndexedDB is cleared)
                    let supabaseFileId: string | undefined;
                    try {
                        const libraryItem = await uploadMediaFile(file, user.id);
                        // The Supabase file ID is stored as {fileId}.{ext} in the user's folder
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
                    dispatch(errorMediaLoading({ fileId, error: error.message || 'Failed to load audio' }));
                    
                    // Update status to error
                    const currentMediaFiles = store.getState().projectState.mediaFiles;
                    dispatch(setMediaFiles(
                        currentMediaFiles.map(m => m.fileId === fileId ? { ...m, status: 'error' as const } : m)
                    ));
                }
            }
        });
    };

    return (
        <div>
            <label
                htmlFor="audio-upload"
                className="cursor-pointer rounded-full bg-white border border-solid border-transparent transition-colors flex flex-row gap-2 items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-auto py-2 px-2 sm:px-5 sm:w-auto"
            >
                <Image
                    alt="Upload Audio"
                    className="Black"
                    height={12}
                    width={12}
                    src="https://www.svgrepo.com/show/514275/upload-cloud.svg"
                />
                <span className="text-xs">Upload Audio</span>
            </label>
            <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="audio-upload"
            />
        </div>
    );
}

