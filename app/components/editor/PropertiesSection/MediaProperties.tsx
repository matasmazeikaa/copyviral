"use client";

import { useAppSelector } from '../../../store';
import { setActiveElement, setMediaFiles, setTextElements } from '../../../store/slices/projectSlice';
import { MediaFile } from '../../../types';
import { useAppDispatch } from '../../../store';
import { calculateVideoFit } from '../../../utils/videoDimensions';

// Convert volume (0-100) to dB (-60 to +12)
// 0-100 maps to -60dB to +12dB, with 50 = 0dB
function volumeToDB(volume: number): number {
    // Map 0-100 to -60 to +12
    // 50 (middle) = 0dB
    if (volume <= 0) return -60;
    if (volume >= 100) return 12;
    
    // Linear mapping: 0-50 maps to -60 to 0, 50-100 maps to 0 to +12
    if (volume <= 50) {
        return (volume / 50) * 60 - 60; // 0-50 -> -60 to 0
    } else {
        return ((volume - 50) / 50) * 12; // 50-100 -> 0 to +12
    }
}

// Convert dB (-60 to +12) to volume (0-100)
function dbToVolume(db: number): number {
    if (db <= -60) return 0;
    if (db >= 12) return 100;
    
    // Inverse mapping
    if (db <= 0) {
        return ((db + 60) / 60) * 50; // -60 to 0 -> 0 to 50
    } else {
        return 50 + (db / 12) * 50; // 0 to +12 -> 50 to 100
    }
}

export default function MediaProperties() {
    const { mediaFiles, activeElementIndex } = useAppSelector((state) => state.projectState);
    const mediaFile = mediaFiles[activeElementIndex];
    const dispatch = useAppDispatch();
    const onUpdateMedia = (id: string, updates: Partial<MediaFile>) => {
        dispatch(setMediaFiles(mediaFiles.map(media =>
            media.id === id ? { ...media, ...updates } : media
        )));
    };

    // Handle aspect ratio fit change for videos
    const handleAspectRatioChange = (fit: 'original' | '1:1' | 'cover' | '16:9') => {
        if (mediaFile.type !== 'video' || !mediaFile.originalWidth || !mediaFile.originalHeight) {
            return;
        }

        const zoom = mediaFile.zoom || 1.0;
        const fitResult = calculateVideoFit(
            mediaFile.originalWidth,
            mediaFile.originalHeight,
            fit,
            zoom
        );

        onUpdateMedia(mediaFile.id, {
            aspectRatioFit: fit,
            width: fitResult.width,
            height: fitResult.height,
            x: fitResult.x,
            y: fitResult.y,
        });
    };

    // Handle zoom change for videos
    const handleZoomChange = (newZoom: number) => {
        if (mediaFile.type !== 'video' || !mediaFile.originalWidth || !mediaFile.originalHeight) {
            return;
        }

        const fit = mediaFile.aspectRatioFit || 'original';
        const fitResult = calculateVideoFit(
            mediaFile.originalWidth,
            mediaFile.originalHeight,
            fit,
            newZoom
        );

        onUpdateMedia(mediaFile.id, {
            zoom: newZoom,
            width: fitResult.width,
            height: fitResult.height,
            x: fitResult.x,
            y: fitResult.y,
        });
    };

    if (!mediaFile) return null;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-8">
                {/* Source Video */}
                {/* <div className="space-y-2">
                    <h4 className="font-semibold">Source Video</h4>
                    <div className="flex items-center space-x-4">
                        <div>
                            <label className="block text-sm">Start (s)</label>
                            <input
                                type="number"
                                readOnly={true}
                                value={mediaFile.startTime}
                                min={0}
                                onChange={(e) => onUpdateMedia(mediaFile.id, {
                                    startTime: Number(e.target.value),
                                    endTime: mediaFile.endTime
                                })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm">End (s)</label>
                            <input
                                type="number"
                                readOnly={true}
                                value={mediaFile.endTime}
                                min={mediaFile.startTime}
                                onChange={(e) => onUpdateMedia(mediaFile.id, {
                                    startTime: mediaFile.startTime,
                                    endTime: Number(e.target.value)
                                })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500"
                            />
                        </div>
                    </div>
                </div> */}
                {/* Timing Position */}
                {/* <div className="space-y-2">
                    <h4 className="font-semibold">Timing Position</h4>
                    <div className="flex items-center space-x-4">
                        <div>
                            <label className="block text-sm">Start (s)</label>
                            <input
                                type="number"
                                readOnly={true}
                                value={mediaFile.positionStart}
                                min={0}
                                onChange={(e) => onUpdateMedia(mediaFile.id, {
                                    positionStart: Number(e.target.value),
                                    positionEnd: Number(e.target.value) + (mediaFile.positionEnd - mediaFile.positionStart)
                                })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm">End (s)</label>
                            <input
                                type="number"
                                readOnly={true}
                                value={mediaFile.positionEnd}
                                min={mediaFile.positionStart}
                                onChange={(e) => onUpdateMedia(mediaFile.id, {
                                    positionEnd: Number(e.target.value)
                                })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500"
                            />
                        </div>
                    </div>
                </div> */}
                {/* Audio Properties */}
                {(mediaFile.type === "video" || mediaFile.type === "audio") && <div className="space-y-2">
                    <h4 className="font-semibold">Audio Properties</h4>
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm mb-2 text-white font-medium">
                                Volume: <span className="text-blue-400 font-bold">{volumeToDB(mediaFile.volume ?? 50).toFixed(1)} dB</span>
                            </label>
                            <div className="relative">
                                <input
                                    type="range"
                                    min="-60"
                                    max="12"
                                    step="0.1"
                                    value={volumeToDB(mediaFile.volume ?? 50)}
                                    onChange={(e) => {
                                        const dbValue = Number(e.target.value);
                                        const volumeValue = dbToVolume(dbValue);
                                        onUpdateMedia(mediaFile.id, { volume: volumeValue });
                                    }}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                    style={{
                                        background: `linear-gradient(to right, 
                                            #ef4444 0%, 
                                            #ef4444 ${((0 - (-60)) / (12 - (-60))) * 100}%, 
                                            #22c55e ${((0 - (-60)) / (12 - (-60))) * 100}%, 
                                            #22c55e 100%)`
                                    }}
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>-60 dB</span>
                                    <span className="font-bold text-white">0 dB</span>
                                    <span>+12 dB</span>
                                </div>
                            </div>
                        </div>
                        {/* TODO: Add playback speed */}
                        {/* <div>
                            <label className="block text-sm">Speed</label>
                            <input
                                type="number"
                                min="0.1"
                                max="4"
                                step="0.1"
                                value={mediaFile.playbackSpeed || 1}
                                onChange={(e) => onUpdateMedia(mediaFile.id, { playbackSpeed: Number(e.target.value) })}
                                className="w-full p-2 bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:ring-2 focus:ring-white-500 focus:border-white-500"
                            />
                        </div> */}
                    </div>
                </div>}
                <div >
                </div>
            </div>
        </div >
    );
}