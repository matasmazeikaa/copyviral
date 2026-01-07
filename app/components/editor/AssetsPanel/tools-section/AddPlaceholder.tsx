"use client";

import { useState, useEffect } from 'react';
import { MediaFile, MediaType } from '../../../../types';
import { useAppDispatch, useAppSelector } from '../../../../store';
import { setMediaFiles } from '../../../../store/slices/projectSlice';
import toast from 'react-hot-toast';
import Image from 'next/image';

const DEFAULT_PLACEHOLDER_DURATION = 5;

export default function AddPlaceholder() {
    const { mediaFiles, currentTime } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const [isExpanded, setIsExpanded] = useState(false);
    const [placeholderConfig, setPlaceholderConfig] = useState<{
        type: MediaType;
        duration: number;
        positionStart: number;
    }>({
        type: 'video',
        duration: DEFAULT_PLACEHOLDER_DURATION,
        positionStart: currentTime,
    });

    // Update positionStart when currentTime changes
    useEffect(() => {
        if (!isExpanded) {
            setPlaceholderConfig(prev => ({ ...prev, positionStart: currentTime }));
        }
    }, [currentTime, isExpanded]);

    const handleAddPlaceholder = () => {
        const placeholderId = crypto.randomUUID();

        // Canvas dimensions
        const CANVAS_WIDTH = 1080;
        const CANVAS_HEIGHT = 1920;
        
        // Placeholder dimensions
        const placeholderWidth = 1920;
        const placeholderHeight = 1080;
        
        // Center the placeholder
        const x = Math.max(0, (CANVAS_WIDTH - placeholderWidth) / 2);
        const y = Math.max(0, (CANVAS_HEIGHT - placeholderHeight) / 2);

        const newPlaceholder: MediaFile = {
            id: placeholderId,
            fileName: `Placeholder (${placeholderConfig.type})`,
            fileId: '', // No file ID for placeholders
            startTime: 0,
            endTime: placeholderConfig.duration,
            positionStart: placeholderConfig.positionStart,
            positionEnd: placeholderConfig.positionStart + placeholderConfig.duration,
            includeInMerge: true,
            x: x,
            y: y,
            width: placeholderWidth,
            height: placeholderHeight,
            rotation: 0,
            opacity: 100,
            crop: { x: 0, y: 0, width: 1920, height: 1080 },
            playbackSpeed: 1,
            volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
            type: placeholderConfig.type,
            zIndex: 0,
            isPlaceholder: true,
            placeholderType: placeholderConfig.type,
        };

        const updatedMedia = [...mediaFiles, newPlaceholder];
        dispatch(setMediaFiles(updatedMedia));
        toast.success('Placeholder added successfully.');
        setIsExpanded(false);
    };

    const handleQuickAdd = (type: MediaType) => {
        const placeholderId = crypto.randomUUID();
        const relevantClips = mediaFiles.filter(clip => clip.type === type);
        const lastEnd = relevantClips.length > 0
            ? Math.max(...relevantClips.map(f => f.positionEnd))
            : currentTime;
        
        // Canvas dimensions
        const CANVAS_WIDTH = 1080;
        const CANVAS_HEIGHT = 1920;
        
        // Placeholder dimensions
        const placeholderWidth = 1920;
        const placeholderHeight = 1080;
        
        // Center the placeholder
        const x = Math.max(0, (CANVAS_WIDTH - placeholderWidth) / 2);
        const y = Math.max(0, (CANVAS_HEIGHT - placeholderHeight) / 2);
        
        const newPlaceholder: MediaFile = {
            id: placeholderId,
            fileName: `Placeholder (${type})`,
            fileId: '',
            startTime: 0,
            endTime: DEFAULT_PLACEHOLDER_DURATION,
            positionStart: lastEnd,
            positionEnd: lastEnd + DEFAULT_PLACEHOLDER_DURATION,
            includeInMerge: true,
            x: x,
            y: y,
            width: placeholderWidth,
            height: placeholderHeight,
            rotation: 0,
            opacity: 100,
            crop: { x: 0, y: 0, width: 1920, height: 1080 },
            playbackSpeed: 1,
            volume: 50, // 0 dB default (50 = 0 dB, 0-50 maps to -60 to 0 dB, 50-100 maps to 0 to +12 dB)
            type: type,
            zIndex: 0,
            isPlaceholder: true,
            placeholderType: type,
        };

        const updatedMedia = [...mediaFiles, newPlaceholder];
        dispatch(setMediaFiles(updatedMedia));
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} placeholder added successfully.`);
    };

    if (!isExpanded) {
        return (
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white">Placeholders</h3>
                    <button
                        onClick={() => setIsExpanded(true)}
                        className="text-xs text-gray-400 hover:text-white"
                    >
                        Advanced
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => handleQuickAdd('video')}
                        className="flex flex-col items-center justify-center p-3 bg-[#27272A] hover:bg-[#3F3F46] border border-gray-700 rounded-md transition-colors"
                    >
                        <Image
                            alt="Video Placeholder"
                            className="h-6 w-6 mb-1"
                            height={24}
                            width={24}
                            src="https://www.svgrepo.com/show/532727/video.svg"
                        />
                        <span className="text-xs text-white">Video</span>
                    </button>
                    <button
                        onClick={() => handleQuickAdd('image')}
                        className="flex flex-col items-center justify-center p-3 bg-[#27272A] hover:bg-[#3F3F46] border border-gray-700 rounded-md transition-colors"
                    >
                        <Image
                            alt="Image Placeholder"
                            className="h-6 w-6 mb-1"
                            height={24}
                            width={24}
                            src="https://www.svgrepo.com/show/535454/image.svg"
                        />
                        <span className="text-xs text-white">Image</span>
                    </button>
                    <button
                        onClick={() => handleQuickAdd('audio')}
                        className="flex flex-col items-center justify-center p-3 bg-[#27272A] hover:bg-[#3F3F46] border border-gray-700 rounded-md transition-colors"
                    >
                        <Image
                            alt="Audio Placeholder"
                            className="h-6 w-6 mb-1"
                            height={24}
                            width={24}
                            src="https://www.svgrepo.com/show/532708/music.svg"
                        />
                        <span className="text-xs text-white">Audio</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Add Placeholder</h3>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="text-xs text-gray-400 hover:text-white"
                >
                    Simple
                </button>
            </div>
            <div className="p-4 bg-[#27272A] rounded-lg border border-gray-700">
                <div className="space-y-4">
                    {/* Placeholder Type */}
                    <div>
                        <label className="block text-xs font-medium text-white mb-1">Media Type</label>
                        <select
                            value={placeholderConfig.type}
                            onChange={(e) => setPlaceholderConfig({ ...placeholderConfig, type: e.target.value as MediaType })}
                            className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500 text-sm"
                        >
                            <option value="video">Video</option>
                            <option value="image">Image</option>
                            <option value="audio">Audio</option>
                        </select>
                    </div>

                    {/* Start Time and Duration */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-white mb-1">Start Time (s)</label>
                            <input
                                type="number"
                                value={placeholderConfig.positionStart}
                                onChange={(e) => setPlaceholderConfig({ ...placeholderConfig, positionStart: Number(e.target.value) })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500 text-sm"
                                min={0}
                                step={0.1}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-white mb-1">Duration (s)</label>
                            <input
                                type="number"
                                value={placeholderConfig.duration}
                                onChange={(e) => setPlaceholderConfig({ ...placeholderConfig, duration: Number(e.target.value) })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500 text-sm"
                                min={0.1}
                                step={0.1}
                            />
                        </div>
                    </div>

                    {/* Add Placeholder Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleAddPlaceholder}
                            className="px-4 py-2 bg-white text-black hover:bg-[#ccc] rounded text-sm"
                        >
                            Add Placeholder
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

