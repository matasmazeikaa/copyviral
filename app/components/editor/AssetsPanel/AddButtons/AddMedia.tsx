"use client";

import { getFile, useAppDispatch, useAppSelector } from "../../../../store";
import { setMediaFiles } from "../../../../store/slices/projectSlice";
import { storeFile } from "../../../../store";
import { categorizeFile } from "../../../../utils/utils";
import { getVideoDimensions, calculateVideoFit } from "../../../../utils/videoDimensions";
import Image from 'next/image';
import toast from 'react-hot-toast';

const DEFAULT_MEDIA_TIME = 2;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export default function AddMedia({ fileId }: { fileId: string }) {
    const { mediaFiles } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();

    const handleFileChange = async () => {
        const updatedMedia = [...mediaFiles];
        const file = await getFile(fileId);
        const fileType = categorizeFile(file.type);

        if (fileId) {
            // Check if there are placeholders of the matching type that can be replaced
            const matchingPlaceholders = mediaFiles.filter(
                clip => clip.isPlaceholder && 
                (clip.placeholderType === fileType || clip.placeholderType === undefined)
            );

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
                };

                dispatch(setMediaFiles(updatedMedia));
                toast.success('Placeholder replaced with media successfully.');
            } else {
                // No placeholder to replace, add new media as before
                const mediaId = crypto.randomUUID();
                const relevantClips = mediaFiles.filter(clip => clip.type === fileType);
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
                });

                dispatch(setMediaFiles(updatedMedia));
                toast.success('Media added successfully.');
            }
        }
    };

    return (
        <div
        >
            <label
                className="cursor-pointer rounded-full bg-white border border-solid border-transparent transition-colors flex flex-col items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium sm:text-base py-2 px-2"
            >
                <Image
                    alt="Add Project"
                    className="Black"
                    height={12}
                    width={12}
                    src="https://www.svgrepo.com/show/513803/add.svg"
                />
                {/* <span className="text-xs">Add Media</span> */}
                <button
                    onClick={handleFileChange}
                >
                </button>
            </label>
        </div>
    );
}
