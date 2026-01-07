"use client";

import { useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMediaFiles, setTextElements, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { MediaFile, TextElement } from "@/app/types";
import GenerateVideoButton from "./render/GenerateVideoButton";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { DEFAULT_TEXT_STYLE } from "@/app/constants";
import { calculateVideoFit } from "@/app/utils/videoDimensions";
import MediaProperties from "./PropertiesSection/MediaProperties";

export default function RightSidebar() {
    const { textElements, mediaFiles, activeElement, activeElementIndex } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const [videoScale, setVideoScale] = useState<'fit' | 'fill' | '1:1'>('1:1');
    const [manualScale, setManualScale] = useState(1);
    const [variations, setVariations] = useState(1);
    const [timestampsOverlay, setTimestampsOverlay] = useState(false);

    // Sync local state with media files when they change
    useEffect(() => {
        const videoFiles = mediaFiles.filter(m => m.type === 'video');
        if (videoFiles.length > 0) {
            // Get the first video's scale settings to sync UI
            const firstVideo = videoFiles[0];
            if (firstVideo.aspectRatioFit) {
                if (firstVideo.aspectRatioFit === '1:1') {
                    setVideoScale('1:1');
                } else if (firstVideo.aspectRatioFit === 'cover') {
                    setVideoScale('fill');
                } else {
                    setVideoScale('fit');
                }
            }
            if (firstVideo.zoom !== undefined) {
                setManualScale(firstVideo.zoom);
            }
        }
    }, [mediaFiles]);

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
    };

    const handleDeleteText = (id: string) => {
        const updated = textElements.filter(t => t.id !== id);
        dispatch(setTextElements(updated));
        if (activeElement === 'text' && activeElementIndex >= updated.length) {
            dispatch(setActiveElement(null));
        }
    };

    const handleSelectText = (index: number) => {
        dispatch(setActiveElement('text'));
        dispatch(setActiveElementIndex(index));
    };

    const handleVideoScaleChange = (scale: 'fit' | 'fill' | '1:1') => {
        setVideoScale(scale);
        // Update all video media files with the new scale and recalculate dimensions
        const updated = mediaFiles.map(media => {
            if (media.type === 'video' && media.originalWidth && media.originalHeight) {
                const aspectRatioFit = scale === '1:1' ? '1:1' : scale === 'fill' ? 'cover' : 'original';
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
        // Update all video media files with the new zoom and recalculate dimensions
        const updated = mediaFiles.map(media => {
            if (media.type === 'video' && media.originalWidth && media.originalHeight) {
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
        <div className="w-80 bg-[#0f172a] border-l border-slate-800 flex flex-col h-full overflow-y-auto shrink-0">
            <div className="p-6 space-y-6">
                {/* Media Properties - Show when video/audio is selected */}
                {activeElement === 'media' && mediaFiles[activeElementIndex] && (
                    <div>
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Properties
                        </h2>
                        <MediaProperties />
                    </div>
                )}

                {/* Video Scaling */}
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
                        >
                            Fit
                        </button>
                        <button
                            onClick={() => handleVideoScaleChange('fill')}
                            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                                videoScale === 'fill'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            Fill (9:16)
                        </button>
                        <button
                            onClick={() => handleVideoScaleChange('1:1')}
                            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                                videoScale === '1:1'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            1:1
                        </button>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-2">
                            MANUAL SCALE: {manualScale}x
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

                {/* Text Layers */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Text Layers
                        </h2>
                        <button
                            onClick={handleAddText}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" />
                            Add Text
                        </button>
                    </div>

                    <div className="space-y-3">
                        {textElements.map((text, index) => (
                            <div
                                key={text.id}
                                className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                    activeElement === 'text' && activeElementIndex === index
                                        ? 'bg-blue-500/20 border-blue-500/50'
                                        : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                                }`}
                                onClick={() => handleSelectText(index)}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <textarea
                                        value={text.text}
                                        onChange={(e) => {
                                            const updated = textElements.map((t, i) =>
                                                i === index ? { ...t, text: e.target.value } : t
                                            );
                                            dispatch(setTextElements(updated));
                                        }}
                                        className="flex-1 text-sm font-medium text-white bg-transparent border-none outline-none focus:ring-0 p-0 resize-y min-h-[1.5rem]"
                                        rows={Math.min(Math.max(text.text.split('\n').length, 1), 4)}
                                        wrap="soft"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteText(text.id);
                                        }}
                                        className="text-slate-400 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                {activeElement === 'text' && activeElementIndex === index && (
                                    <div className="mt-2 pt-2 border-t border-slate-700">
                                        <div className="flex gap-2 mb-2">
                                            {['Inter', 'Impact', 'Marker', 'Serif'].map((font) => (
                                                <button
                                                    key={font}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const updated = textElements.map((t, i) =>
                                                            i === index ? { ...t, font: font } : t
                                                        );
                                                        dispatch(setTextElements(updated));
                                                    }}
                                                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded transition-colors ${
                                                        text.font === font || (!text.font && font === 'Inter')
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {font}
                                                </button>
                                            ))}
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
                                                    onChange={(e) => {
                                                        const updated = textElements.map((t, i) =>
                                                            i === index ? { ...t, y: Number(e.target.value) } : t
                                                        );
                                                        dispatch(setTextElements(updated));
                                                    }}
                                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    onClick={(e) => e.stopPropagation()}
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
                                                    onChange={(e) => {
                                                        const updated = textElements.map((t, i) =>
                                                            i === index ? { ...t, fontSize: Number(e.target.value) } : t
                                                        );
                                                        dispatch(setTextElements(updated));
                                                    }}
                                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                                        COLOR
                                                    </label>
                                                    <input
                                                        type="color"
                                                        value={text.color || '#ffffff'}
                                                        onChange={(e) => {
                                                            const updated = textElements.map((t, i) =>
                                                                i === index ? { ...t, color: e.target.value } : t
                                                            );
                                                            dispatch(setTextElements(updated));
                                                        }}
                                                        className="w-full h-8 rounded border border-slate-700 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Generate Video Button */}
                <div>
                    <GenerateVideoButton variations={variations} />
                    <p className="text-[10px] text-slate-500 mt-2 text-center">
                        Downloads ready after generation
                    </p>
                </div>
            </div>
        </div>
    );
}

