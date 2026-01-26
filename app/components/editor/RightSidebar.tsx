"use client";

import { useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMediaFiles, setTextElements } from "@/app/store/slices/projectSlice";
import { MediaFile, TextElement } from "@/app/types";
import GenerateVideoButton from "./render/gst";
import { calculateVideoFit } from "@/app/utils/videoDimensions";
import MediaProperties from "./PropertiesSection/MediaProperties";
import { Layers } from "lucide-react";

export default function RightSidebar() {
    const { textElements, mediaFiles, activeElement, activeElementIndex } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const [videoScale, setVideoScale] = useState<'fit' | 'fill'>('fill');
    const [manualScale, setManualScale] = useState(1);
    const [timestampsOverlay, setTimestampsOverlay] = useState(false);
    const [editAllText, setEditAllText] = useState(false);
    const [editAllVideos, setEditAllVideos] = useState(false);

    // Get video files and check if there are multiple
    const videoFiles = mediaFiles.filter(m => m.type === 'video');
    const hasMultipleVideos = videoFiles.length > 1;
    const selectedMedia = mediaFiles[activeElementIndex];
    const isVideoSelected = activeElement === 'media' && selectedMedia?.type === 'video';

    // Helper function to update text elements (single or all based on editAllText mode)
    const updateTextElements = (index: number, updates: Partial<TextElement>) => {
        if (editAllText) {
            // Apply changes to all text elements
            const updated = textElements.map((t) => ({ ...t, ...updates }));
            dispatch(setTextElements(updated));
        } else {
            // Apply changes only to the selected text element
            const updated = textElements.map((t, i) =>
                i === index ? { ...t, ...updates } : t
            );
            dispatch(setTextElements(updated));
        }
    };

    // Sync local state with media files when they change
    useEffect(() => {
        if (videoFiles.length > 0) {
            // Get the selected video's scale settings, or first video if none selected
            const targetVideo = isVideoSelected ? selectedMedia : videoFiles[0];
            if (targetVideo?.aspectRatioFit) {
                if (targetVideo.aspectRatioFit === 'cover') {
                    setVideoScale('fill');
                } else {
                    // '16:9', 'original', '1:1' all map to 'fit'
                    setVideoScale('fit');
                }
            }
            if (targetVideo?.zoom !== undefined) {
                setManualScale(targetVideo.zoom);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaFiles, activeElementIndex, isVideoSelected]);


    const handleVideoScaleChange = (scale: 'fit' | 'fill') => {
        setVideoScale(scale);
        
        const updated = mediaFiles.map(media => {
            // Only update if: editAllVideos is on, OR this is the selected video
            const shouldUpdate = editAllVideos 
                ? media.type === 'video'
                : (isVideoSelected && media.id === selectedMedia?.id);
            
            if (shouldUpdate && media.type === 'video' && media.originalWidth && media.originalHeight) {
                // 'fit' = 16:9 letterbox, 'fill' = cover (fill 9:16)
                const aspectRatioFit = scale === 'fill' ? 'cover' : '16:9';
                const zoom = media.zoom || 1.0;
                const fitResult = calculateVideoFit(
                    media.originalWidth,
                    media.originalHeight,
                    aspectRatioFit,
                    zoom
                );
                return {
                    ...media,
                    aspectRatioFit,
                    width: fitResult.width,
                    height: fitResult.height,
                    x: fitResult.x,
                    y: fitResult.y,
                } as MediaFile;
            }
            return media;
        });
        dispatch(setMediaFiles(updated));
    };

    const handleManualScaleChange = (scale: number) => {
        setManualScale(scale);
        
        const updated = mediaFiles.map(media => {
            // Only update if: editAllVideos is on, OR this is the selected video
            const shouldUpdate = editAllVideos 
                ? media.type === 'video'
                : (isVideoSelected && media.id === selectedMedia?.id);
            
            if (shouldUpdate && media.type === 'video' && media.originalWidth && media.originalHeight) {
                const aspectRatioFit = media.aspectRatioFit || 'original';
                const fitResult = calculateVideoFit(
                    media.originalWidth,
                    media.originalHeight,
                    aspectRatioFit,
                    scale
                );
                return {
                    ...media,
                    zoom: scale,
                    width: fitResult.width,
                    height: fitResult.height,
                    x: fitResult.x,
                    y: fitResult.y,
                } as MediaFile;
            }
            return media;
        });
        dispatch(setMediaFiles(updated));
    };

    return (
        <div className="w-full lg:w-72 bg-[#0f172a] lg:border-l border-slate-800 flex flex-col h-full overflow-y-auto shrink-0 scrollbar-hide">
            <div className="p-4 lg:p-6 space-y-4 lg:space-y-6">
                {/* Media Properties - Show when video/audio is selected */}
                {activeElement === 'media' && mediaFiles[activeElementIndex] && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Properties
                            </h2>
                            {selectedMedia?.type === 'video' && hasMultipleVideos && (
                                <button
                                    onClick={() => setEditAllVideos(!editAllVideos)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                                        editAllVideos
                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                                    }`}
                                    title="Apply changes to all video clips"
                                >
                                    <Layers className="w-3 h-3" />
                                    {editAllVideos ? 'Editing All' : 'Edit All'}
                                </button>
                            )}
                        </div>
                        {editAllVideos && selectedMedia?.type === 'video' && hasMultipleVideos && (
                            <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                <p className="text-[10px] text-purple-300 font-medium">
                                    Changes will apply to all {videoFiles.length} video clips
                                </p>
                            </div>
                        )}
                        <MediaProperties editAll={editAllVideos} />
                    </div>
                )}

                {/* Text Properties - Show when text is selected */}
                {activeElement === 'text' && textElements[activeElementIndex] && (() => {
                    const text = textElements[activeElementIndex];
                    const index = activeElementIndex;
                    return (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Text Properties
                                </h2>
                                {textElements.length > 1 && (
                                    <button
                                        onClick={() => setEditAllText(!editAllText)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                                            editAllText
                                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                                        }`}
                                        title="Apply changes to all text elements"
                                    >
                                        <Layers className="w-3 h-3" />
                                        {editAllText ? 'Editing All' : 'Edit All'}
                                    </button>
                                )}
                            </div>
                            {editAllText && (
                                <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                    <p className="text-[10px] text-purple-300 font-medium">
                                        Changes will apply to all {textElements.length} text elements
                                    </p>
                                </div>
                            )}
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-2">Text Content</label>
                                    <textarea
                                        value={text.text}
                                        onChange={(e) => updateTextElements(index, { text: e.target.value })}
                                        className="w-full p-2 text-sm font-medium text-white bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[3rem]"
                                        rows={Math.min(Math.max(text.text.split('\n').length, 1), 4)}
                                        wrap="soft"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                            VERTICAL POS: {text.y}
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1920"
                                            step="1"
                                            value={text.y}
                                            onChange={(e) => updateTextElements(index, { y: Number(e.target.value) })}
                                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                            SIZE: {text.fontSize}
                                        </label>
                                        <input
                                            type="range"
                                            min="12"
                                            max="200"
                                            step="1"
                                            value={text.fontSize || 48}
                                            onChange={(e) => updateTextElements(index, { fontSize: Number(e.target.value) })}
                                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                            COLOR
                                        </label>
                                        <input
                                            type="color"
                                            value={text.color || '#ffffff'}
                                            onChange={(e) => updateTextElements(index, { color: e.target.value })}
                                            className="w-full h-8 rounded border border-slate-700 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Video Scaling - Only show when a video is selected or editing all videos */}
                {(isVideoSelected || editAllVideos) && (
                    <div>
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Video Scaling (9:16)
                        </h2>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => handleVideoScaleChange('fit')}
                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                                    videoScale === 'fit'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                                title="16:9 letterbox with black bars"
                            >
                                Fit (16:9)
                            </button>
                            <button
                                onClick={() => handleVideoScaleChange('fill')}
                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                                    videoScale === 'fill'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                                title="Fill entire 9:16 canvas"
                            >
                                Fill
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2">
                                SCALE: {Math.round(manualScale * 100)}%
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="3"
                                step="0.1"
                                value={manualScale}
                                onChange={(e) => handleManualScaleChange(Number(e.target.value))}
                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>
                )}

                {/* Generate Video Button */}
                <div>
                    <GenerateVideoButton />
                    <p className="text-[10px] text-slate-500 mt-2 text-center">
                        Downloads ready after generation
                    </p>
                </div>
            </div>
        </div>
    );
}

