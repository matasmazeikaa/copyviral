import { useAppSelector } from "@/app/store";
import { setMarkerTrack, setTextElements, setMediaFiles, setTimelineZoom, setCurrentTime, setIsPlaying, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import Image from "next/image";
import Header from "./Header";
import VideoTimeline from "./elements-timeline/VideoTimeline";
import ImageTimeline from "./elements-timeline/ImageTimeline";
import AudioTimeline from "./elements-timeline/AudioTimline";
import TextTimeline from "./elements-timeline/TextTimeline";
import { throttle } from 'lodash';
import GlobalKeyHandlerProps from "../../../components/editor/keys/GlobalKeyHandlerProps";
import toast from "react-hot-toast";
import { GripVertical, Clock, Film, Type, Music, RefreshCw, X, ZoomIn, ZoomOut, Ruler, Trash2, Scissors } from 'lucide-react';
import { MediaFile, TextElement } from "@/app/types";
import { getVideoDuration } from "@/app/utils/videoDimensions";
import Waveform from "./Waveform";
export const Timeline = () => {
    const { currentTime, timelineZoom, enableMarkerTracking, activeElement, activeElementIndex, mediaFiles, textElements, duration, isPlaying, fps } = useAppSelector((state) => state.projectState);
    const dispatch = useDispatch();
    const timelineRef = useRef<HTMLDivElement>(null);
    const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [resizingItem, setResizingItem] = useState<{id: string, type: 'clip' | 'text'} | null>(null);
    const [draggingTextItem, setDraggingTextItem] = useState<{id: string, startPosition: number} | null>(null);
    const [textDragStartPos, setTextDragStartPos] = useState<{x: number, y: number, layerId: string} | null>(null);
    const draggingTextItemRef = useRef<{id: string, startPosition: number} | null>(null);
    const startXRef = useRef<number>(0);
    const startValueRef = useRef<number>(0);
    const mediaFilesRef = useRef(mediaFiles);
    const textElementsRef = useRef(textElements);
    // Cache for video durations to avoid repeated async calls
    const videoDurationCache = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        mediaFilesRef.current = mediaFiles;
    }, [mediaFiles]);

    useEffect(() => {
        textElementsRef.current = textElements;
    }, [textElements]);

    useEffect(() => {
        draggingTextItemRef.current = draggingTextItem;
    }, [draggingTextItem]);

    const throttledZoom = useMemo(() =>
        throttle((value: number) => {
            dispatch(setTimelineZoom(value));
        }, 100),
        [dispatch]
    );

    // Zoom levels (pixels per second)
    const MIN_ZOOM = 50;
    const MAX_ZOOM = 500;
    const DEFAULT_ZOOM = 100;

    // Convert zoom value to slider position (0-100)
    const zoomToSlider = (zoom: number): number => {
        return ((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
    };

    // Convert slider position (0-100) to zoom value
    const sliderToZoom = (sliderValue: number): number => {
        return MIN_ZOOM + (sliderValue / 100) * (MAX_ZOOM - MIN_ZOOM);
    };

    const handleZoomSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const sliderValue = Number(e.target.value);
        const newZoom = Math.round(sliderToZoom(sliderValue));
        dispatch(setTimelineZoom(newZoom));
    };

    const handleZoomIn = () => {
        const newZoom = Math.min(MAX_ZOOM, timelineZoom + 25);
        dispatch(setTimelineZoom(newZoom));
    };

    const handleZoomOut = () => {
        const newZoom = Math.max(MIN_ZOOM, timelineZoom - 25);
        dispatch(setTimelineZoom(newZoom));
    };

    const handleZoomFit = () => {
        // Fit timeline to show entire duration with some padding
        if (!timelineRef.current || duration === 0) return;
        
        const containerWidth = timelineRef.current.clientWidth - 32; // Account for padding
        const padding = 0.1; // 10% padding on each side
        const targetZoom = (containerWidth * (1 - padding * 2)) / duration;
        const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
        dispatch(setTimelineZoom(clampedZoom));
    };

    // Helper function to get maximum video duration (end of last video clip)
    const getMaxVideoDuration = useCallback((): number => {
        const videoClips = mediaFiles.filter(clip => clip.type === 'video');
        if (videoClips.length === 0) return 0;
        return Math.max(...videoClips.map(clip => clip.positionEnd));
    }, [mediaFiles]);

    // Snap function to snap to frame boundaries and nearby clip edges
    const snapTime = useCallback((time: number, element: any, allElements: any[], includeVideoEnds: boolean = false): number => {
        const SNAP_THRESHOLD = 0.05; // 50ms threshold for snapping
        const frameDuration = 1 / fps; // Duration of one frame
        
        // Snap to frame boundaries
        const frameSnap = Math.round(time / frameDuration) * frameDuration;
        
        // Collect all snap points from other elements (excluding current element)
        const snapPoints: number[] = [];
        allElements.forEach(el => {
            if (el.id !== element.id) {
                snapPoints.push(el.positionStart);
                snapPoints.push(el.positionEnd);
            }
        });
        
        // For audio clips, also add video clip end points for snapping
        if (includeVideoEnds) {
            const videoClips = mediaFiles.filter(clip => clip.type === 'video');
            videoClips.forEach(videoClip => {
                snapPoints.push(videoClip.positionEnd);
            });
        }
        
        // Find the closest snap point (either frame boundary or nearby clip edge)
        let closestSnap = frameSnap;
        let minDistance = Math.abs(time - frameSnap);
        
        snapPoints.forEach(snapPoint => {
            const distance = Math.abs(time - snapPoint);
            if (distance < minDistance && distance < SNAP_THRESHOLD) {
                minDistance = distance;
                closestSnap = snapPoint;
            }
        });
        
        // Always use frame snap if no nearby clip edge is found
        return closestSnap;
    }, [fps, mediaFiles]);

    const handleSplit = () => {
        let element = null;
        let elements = null;
        let setElements = null;

        if (!activeElement) {
            toast.error('No element selected.');
            return;
        }

        if (activeElement === 'media') {
            elements = [...mediaFiles];
            element = elements[activeElementIndex];
            setElements = setMediaFiles;

            if (!element) {
                toast.error('No element selected.');
                return;
            }

            const { positionStart, positionEnd } = element;

            if (currentTime <= positionStart || currentTime >= positionEnd) {
                toast.error('Marker is outside the selected element bounds.');
                return;
            }

            // Snap the split time to frame boundaries and nearby clip edges
            const snappedTime = snapTime(currentTime, element, mediaFiles);
            
            // Ensure snapped time is still within bounds
            const clampedSnappedTime = Math.max(positionStart + 0.01, Math.min(positionEnd - 0.01, snappedTime));

            const positionDuration = positionEnd - positionStart;

            // Media logic (uses startTime/endTime for trimming)
            const { startTime, endTime } = element;
            const sourceDuration = endTime - startTime;
            const ratio = (clampedSnappedTime - positionStart) / positionDuration;
            const splitSourceOffset = startTime + ratio * sourceDuration;

            const firstPart = {
                ...element,
                id: crypto.randomUUID(),
                positionStart,
                positionEnd: clampedSnappedTime,
                startTime,
                endTime: splitSourceOffset
            };

            const secondPart = {
                ...element,
                id: crypto.randomUUID(),
                positionStart: clampedSnappedTime,
                positionEnd,
                startTime: splitSourceOffset,
                endTime
            };

            elements.splice(activeElementIndex, 1, firstPart, secondPart);
        } else if (activeElement === 'text') {
            elements = [...textElements];
            element = elements[activeElementIndex];
            setElements = setTextElements;

            if (!element) {
                toast.error('No element selected.');
                return;
            }

            const { positionStart, positionEnd } = element;

            if (currentTime <= positionStart || currentTime >= positionEnd) {
                toast.error('Marker is outside the selected element.');
                return;
            }

            // Snap the split time to frame boundaries and nearby clip edges
            const snappedTime = snapTime(currentTime, element, textElements);
            
            // Ensure snapped time is still within bounds
            const clampedSnappedTime = Math.max(positionStart + 0.01, Math.min(positionEnd - 0.01, snappedTime));

            const firstPart = {
                ...element,
                id: crypto.randomUUID(),
                positionStart,
                positionEnd: clampedSnappedTime,
            };

            const secondPart = {
                ...element,
                id: crypto.randomUUID(),
                positionStart: clampedSnappedTime,
                positionEnd,
            };

            elements.splice(activeElementIndex, 1, firstPart, secondPart);
        }

        if (elements && setElements) {
            dispatch(setElements(elements as any));
            dispatch(setActiveElement(null));
            toast.success('Element split successfully.');
        }
    };

    const handleDuplicate = () => {
        let element = null;
        let elements = null;
        let setElements = null;

        if (activeElement === 'media') {
            elements = [...mediaFiles];
            element = elements[activeElementIndex];
            setElements = setMediaFiles;
        } else if (activeElement === 'text') {
            elements = [...textElements];
            element = elements[activeElementIndex];
            setElements = setTextElements;
        }

        if (!element) {
            toast.error('No element selected.');
            return;
        }

        const duplicatedElement = {
            ...element,
            id: crypto.randomUUID(),
        };

        if (elements) {
            elements.splice(activeElementIndex + 1, 0, duplicatedElement as any);
        }

        if (elements && setElements) {
            dispatch(setElements(elements as any));
            dispatch(setActiveElement(null));
            toast.success('Element duplicated successfully.');
        }
    };

    const handleDelete = (item?: MediaFile | TextElement) => {
        let idToDelete: string | null = null;
        let setElements: typeof setMediaFiles | typeof setTextElements | null = null;
        let deletedElement: MediaFile | TextElement | null = null;

        // If item is provided, delete by ID
        if (item) {
            idToDelete = item.id;
            deletedElement = item;
            // Determine which array it belongs to
            if (mediaFiles.some(m => m.id === item.id)) {
                setElements = setMediaFiles;
            } else if (textElements.some(t => t.id === item.id)) {
                setElements = setTextElements;
            }
        } else {
            // Otherwise use active element (for keyboard shortcuts)
            if (activeElement === 'media') {
                const element = mediaFiles[activeElementIndex];
                if (element) {
                    idToDelete = element.id;
                    deletedElement = element;
                    setElements = setMediaFiles;
                }
            } else if (activeElement === 'text') {
                const element = textElements[activeElementIndex];
                if (element) {
                    idToDelete = element.id;
                    deletedElement = element;
                    setElements = setTextElements;
                }
            }
        }

        if (!idToDelete || !setElements || !deletedElement) {
            toast.error('No element selected.');
            return;
        }

        // Delete by ID
        if (setElements === setMediaFiles) {
            let updatedMediaFiles = mediaFiles.filter(m => m.id !== idToDelete);
            
            // Track magnet: If it's a video clip, move subsequent clips to fill the gap
            if ('type' in deletedElement && deletedElement.type === 'video') {
                const deletedDuration = deletedElement.positionEnd - deletedElement.positionStart;
                
                // Find clips that come after the deleted clip and shift them left
                updatedMediaFiles = updatedMediaFiles.map((el) => {
                    if ('type' in el && el.type === 'video' && el.positionStart > deletedElement.positionStart) {
                        return {
                            ...el,
                            positionStart: Math.max(0, el.positionStart - deletedDuration),
                            positionEnd: Math.max(0, el.positionEnd - deletedDuration),
                        };
                    }
                    return el;
                });
            }
            
            dispatch(setMediaFiles(updatedMediaFiles));
        } else if (setElements === setTextElements) {
            const updatedTextElements = textElements.filter(t => t.id !== idToDelete);
            dispatch(setTextElements(updatedTextElements));
        }

        dispatch(setActiveElement(null));
        toast.success('Element deleted successfully.');
    };


    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return;

        // Deselect any selected item when clicking on timeline background
        dispatch(setActiveElement(null));
        dispatch(setActiveElementIndex(0));

        dispatch(setIsPlaying(false));
        const rect = timelineRef.current.getBoundingClientRect();

        const scrollOffset = timelineRef.current.scrollLeft;
        const offsetX = e.clientX - rect.left + scrollOffset;

        const seconds = offsetX / timelineZoom;
        const clampedTime = Math.max(0, Math.min(duration, seconds));

        dispatch(setCurrentTime(clampedTime));
    };

    // Clip reordering handlers
    const handleClipReorder = useCallback((fromIndex: number, toIndex: number) => {
        const videoClips = mediaFiles
            .filter((clip) => clip.type === 'video')
            .sort((a, b) => a.positionStart - b.positionStart);
        
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= videoClips.length || toIndex >= videoClips.length) {
            return;
        }

        const reorderedClips = [...videoClips];
        const [movedClip] = reorderedClips.splice(fromIndex, 1);
        reorderedClips.splice(toIndex, 0, movedClip);

        // Recalculate positions to be sequential (track magnet effect)
        let currentPosition = 0;
        const updatedClips = reorderedClips.map((clip) => {
            const clipDuration = clip.positionEnd - clip.positionStart;
            const updatedClip = {
                ...clip,
                positionStart: currentPosition,
                positionEnd: currentPosition + clipDuration,
            };
            currentPosition += clipDuration;
            return updatedClip;
        });

        // Update all media files, preserving non-video items
        const updatedMediaFiles = mediaFiles.map((file) => {
            if (file.type === 'video') {
                const updatedClip = updatedClips.find(c => c.id === file.id);
                return updatedClip || file;
            }
            return file;
        });

        dispatch(setMediaFiles(updatedMediaFiles));
    }, [mediaFiles, dispatch]);

    const handleClipDragStart = (e: React.DragEvent, index: number) => {
        setDraggedClipIndex(index);
        e.dataTransfer.effectAllowed = "move";
        const img = document.createElement('img');
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleClipDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedClipIndex === null || draggedClipIndex === index) return;
        handleClipReorder(draggedClipIndex, index);
        setDraggedClipIndex(index);
    };

    // Scrubbing handlers
    const handleScrubStart = (e: React.PointerEvent) => {
        if (resizingItem || draggingTextItem || textDragStartPos) return;
        setIsScrubbing(true);
        updateScrub(e);
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const handleScrubMove = (e: React.PointerEvent) => {
        if (resizingItem) {
            handleResizeMove(e);
        } else if (textDragStartPos || draggingTextItem) {
            handleTextDragMove(e);
        } else if (isScrubbing) {
            updateScrub(e);
        }
    };

    const handleScrubEnd = (e: React.PointerEvent) => {
        if (resizingItem) {
            handleResizeEnd(e);
        } else if (draggingTextItem) {
            handleTextDragEnd(e);
        } else {
            setIsScrubbing(false);
            (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        }
    };

    const updateScrub = (e: React.PointerEvent) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left + timelineRef.current.scrollLeft;
        const seconds = offsetX / timelineZoom;
        const clampedTime = Math.max(0, Math.min(duration, seconds));
        dispatch(setCurrentTime(clampedTime));
        dispatch(setIsPlaying(false));
    };

    // Calculate frame info
    const currentFrame = Math.round(currentTime * fps);
    const totalDurationFrames = Math.ceil(duration * fps);
    const PIXELS_PER_FRAME = timelineZoom / fps; // Convert timelineZoom (pixels per second) to pixels per frame
    const MIN_DURATION_FRAMES = Math.ceil((50 / 100) * fps); // Convert 50 pixels (0.5s) to frames

    // Resizing Logic
    const handleResizeStart = async (e: React.PointerEvent, id: string, type: 'clip' | 'text', initialValuePixels: number) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingItem({ id, type });
        startXRef.current = e.clientX;
        startValueRef.current = initialValuePixels;
        (e.target as Element).setPointerCapture(e.pointerId);

        // Pre-load video duration for video clips to enable capping
        if (type === 'clip') {
            const clip = mediaFiles.find(c => c.id === id);
            if (clip && clip.type === 'video' && clip.src && !videoDurationCache.current.has(clip.src)) {
                try {
                    const videoDuration = await getVideoDuration(clip.src);
                    videoDurationCache.current.set(clip.src, videoDuration);
                } catch (error) {
                    console.warn('Failed to get video duration:', error);
                }
            }
        }
    };

    const mouseXRef = useRef<number>(0);
    const throttledResizeUpdate = useMemo(() =>
        throttle(() => {
            const currentResizingItem = resizingItem;
            if (!currentResizingItem) return;
            
            const deltaX = mouseXRef.current - startXRef.current;
            const newPixels = startValueRef.current + deltaX;
            const currentPixelsPerFrame = timelineZoom / fps;
            const currentMinDurationFrames = Math.ceil((50 / 100) * fps);
            const newFrames = Math.max(currentMinDurationFrames, Math.floor(newPixels / currentPixelsPerFrame));
            const newDurationSeconds = newFrames / fps;

            if (currentResizingItem.type === 'clip') {
                const currentFiles = mediaFilesRef.current;
                const clip = currentFiles.find(c => c.id === currentResizingItem.id);
                if (clip) {
                    const oldPositionEnd = clip.positionEnd;
                    let newPositionEnd = clip.positionStart + newDurationSeconds;
                    const shiftAmount = newPositionEnd - oldPositionEnd;

                    // Calculate the ratio of how much the clip was extended/shrunk
                    const originalPositionDuration = oldPositionEnd - clip.positionStart;
                    const originalSourceDuration = clip.endTime - clip.startTime;
                    
                    // For audio clips: constrain to not exceed maximum video duration and apply snapping
                    if (clip.type === 'audio') {
                        const maxVideoDuration = getMaxVideoDuration();
                        // Cap audio to not exceed video duration
                        if (maxVideoDuration > 0) {
                            newPositionEnd = Math.min(newPositionEnd, maxVideoDuration);
                        }
                        // Apply snapping to video clip ends
                        const allMediaFiles = currentFiles.filter(m => m.type === 'video' || m.type === 'audio');
                        newPositionEnd = snapTime(newPositionEnd, clip, allMediaFiles, true);
                    }
                    
                    // Cap the resize to the original video duration for video clips
                    if (clip.type === 'video' && clip.src) {
                        const maxVideoDuration = videoDurationCache.current.get(clip.src);
                        if (maxVideoDuration !== undefined) {
                            // Calculate the maximum allowed source duration
                            const maxSourceDuration = maxVideoDuration;
                            const maxAllowedSourceDuration = Math.min(
                                maxSourceDuration,
                                originalSourceDuration * (newPositionEnd - clip.positionStart) / originalPositionDuration
                            );
                            
                            // Calculate the maximum allowed position duration based on the video duration
                            const maxPositionDuration = originalPositionDuration > 0 && originalSourceDuration > 0
                                ? (maxAllowedSourceDuration / originalSourceDuration) * originalPositionDuration
                                : newPositionEnd - clip.positionStart;
                            
                            // Cap newPositionEnd to not exceed the maximum allowed position duration
                            const maxAllowedPositionEnd = clip.positionStart + maxPositionDuration;
                            if (newPositionEnd > maxAllowedPositionEnd) {
                                newPositionEnd = maxAllowedPositionEnd;
                            }
                        }
                    }
                    
                    // Calculate newPositionDuration after potential capping
                    const newPositionDuration = newPositionEnd - clip.positionStart;
                    
                    // Update endTime proportionally to match the new timeline duration
                    // This ensures the video source plays for the full duration of the clip
                    // Safeguard against division by zero
                    const durationRatio = originalPositionDuration > 0 
                        ? newPositionDuration / originalPositionDuration 
                        : 1;
                    const newEndTime = clip.startTime + (originalSourceDuration * durationRatio);

                    // Update the resized clip and push subsequent clips
                    const updatedMediaFiles = currentFiles.map(m => {
                        if (m.id === currentResizingItem.id) {
                            return { 
                                ...m, 
                                positionEnd: newPositionEnd,
                                endTime: newEndTime
                            };
                        }
                        // Only push subsequent video clips if the resized clip is also a video
                        // Audio clips should not push video clips
                        if (clip.type === 'video' && m.type === 'video' && m.positionStart > clip.positionStart) {
                            const actualShiftAmount = newPositionEnd - oldPositionEnd;
                            return {
                                ...m,
                                positionStart: Math.max(0, m.positionStart + actualShiftAmount),
                                positionEnd: Math.max(0, m.positionEnd + actualShiftAmount),
                            };
                        }
                        return m;
                    });
                    dispatch(setMediaFiles(updatedMediaFiles));
                }
            } else if (currentResizingItem.type === 'text') {
                const currentElements = textElementsRef.current;
                const layer = currentElements.find(l => l.id === currentResizingItem.id);
                if (layer) {
                    const newPositionEnd = layer.positionStart + newDurationSeconds;
                    dispatch(setTextElements(currentElements.map(t => 
                        t.id === currentResizingItem.id 
                            ? { ...t, positionEnd: newPositionEnd }
                            : t
                    )));
                }
            }
        }, 50), [resizingItem, dispatch, fps, timelineZoom, getMaxVideoDuration, snapTime]);

    const handleResizeMove = (e: React.PointerEvent) => {
        if (!resizingItem) return;
        e.stopPropagation();
        mouseXRef.current = e.clientX;
        throttledResizeUpdate();
    };

    const handleResizeEnd = (e: React.PointerEvent) => {
        setResizingItem(null);
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    // Text drag handlers
    const handleTextDragStart = (e: React.PointerEvent, layer: TextElement) => {
        e.preventDefault();
        e.stopPropagation();
        setTextDragStartPos({ x: e.clientX, y: e.clientY, layerId: layer.id });
        startXRef.current = e.clientX;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const mouseXTextDragRef = useRef<number>(0);
    const throttledTextDragUpdate = useMemo(() =>
        throttle(() => {
            const currentDraggingItem = draggingTextItemRef.current;
            if (!currentDraggingItem) return;
            
            const currentElements = textElementsRef.current;
            const layer = currentElements.find(l => l.id === currentDraggingItem.id);
            if (!layer) return;

            const deltaX = mouseXTextDragRef.current - startXRef.current;
            const deltaSeconds = deltaX / timelineZoom;
            const newPositionStart = Math.max(0, currentDraggingItem.startPosition + deltaSeconds);
            const duration = layer.positionEnd - layer.positionStart;
            const newPositionEnd = newPositionStart + duration;

            // Snap to frame boundaries and nearby clip edges
            const snappedStart = snapTime(newPositionStart, layer, currentElements);
            const snappedEnd = snappedStart + duration;

            dispatch(setTextElements(currentElements.map(t => 
                t.id === currentDraggingItem.id 
                    ? { ...t, positionStart: snappedStart, positionEnd: snappedEnd }
                    : t
            )));
        }, 50), [dispatch, timelineZoom, snapTime]);

    const handleTextDragMove = (e: React.PointerEvent) => {
        if (!textDragStartPos) return;
        e.stopPropagation();
        
        const deltaX = Math.abs(e.clientX - textDragStartPos.x);
        const deltaY = Math.abs(e.clientY - textDragStartPos.y);
        const DRAG_THRESHOLD = 5; // pixels
        
        // Only start dragging if user has moved enough
        if (!draggingTextItem && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
            const layer = textElementsRef.current.find(l => l.id === textDragStartPos.layerId);
            if (layer) {
                setDraggingTextItem({ id: layer.id, startPosition: layer.positionStart });
            }
        }
        
        if (draggingTextItem) {
            mouseXTextDragRef.current = e.clientX;
            throttledTextDragUpdate();
        }
    };

    const handleTextDragEnd = (e: React.PointerEvent) => {
        const wasDragging = draggingTextItem !== null;
        const layerId = textDragStartPos?.layerId;
        setDraggingTextItem(null);
        setTextDragStartPos(null);
        (e.target as Element).releasePointerCapture(e.pointerId);
        
        // Selection is now handled in onPointerDown, so we don't need to handle it here
    };

    return (
        <div className="w-full h-80 bg-[#0f172a] border-t border-slate-800 flex flex-col shrink-0 z-30 z-1">
            {/* Timeline Header */}
            <div className="h-10 bg-[#1e293b] border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2 text-slate-400">
                    <Film className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Timeline</span>
                </div>
                <div className="flex items-center gap-4">
                    {/* Split Button - Only show when item is selected */}
                    {activeElement && (() => {
                        let canSplit = false;
                        if (activeElement === 'media') {
                            const element = mediaFiles[activeElementIndex];
                            if (element) {
                                canSplit = currentTime > element.positionStart && currentTime < element.positionEnd;
                            }
                        } else if (activeElement === 'text') {
                            const element = textElements[activeElementIndex];
                            if (element) {
                                canSplit = currentTime > element.positionStart && currentTime < element.positionEnd;
                            }
                        }
                        return (
                            <button
                                onClick={handleSplit}
                                disabled={!canSplit}
                                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded transition-colors border border-blue-500/30 hover:border-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-blue-400 disabled:hover:bg-transparent"
                                title={canSplit ? "Split at Playhead (S)" : "Place playhead within element to split"}
                            >
                                <Scissors className="w-4 h-4" />
                            </button>
                        );
                    })()}
                    {/* Delete Button - Only show when item is selected */}
                    {activeElement && (
                        <button
                            onClick={() => handleDelete()}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors border border-red-500/30 hover:border-red-500/50"
                            title="Delete Selected Item"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleZoomFit}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
                            title="Fit to Timeline"
                        >
                            <Ruler className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleZoomOut}
                            disabled={timelineZoom <= MIN_ZOOM}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <div className="flex items-center w-40">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={zoomToSlider(timelineZoom)}
                                onChange={handleZoomSliderChange}
                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                title={`Zoom: ${timelineZoom}px/s`}
                            />
                        </div>
                        <button
                            onClick={handleZoomIn}
                            disabled={timelineZoom >= MAX_ZOOM}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                    <span className="text-[10px] text-slate-500">
                        {isScrubbing ? 'Scrubbing' : 'Ready'}
                    </span>
                    <div className="flex items-center gap-2 text-slate-400 bg-slate-900/50 px-3 py-1 rounded-md">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs font-mono text-blue-400">{currentFrame} / {totalDurationFrames} frames ({currentTime.toFixed(1)}s / {duration.toFixed(1)}s)</span>
                    </div>
                </div>
            </div>

            {/* Tracks Container */}
            <div 
                className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative p-4 select-none cursor-crosshair" 
                ref={timelineRef}
                onPointerDown={handleScrubStart}
                onPointerMove={handleScrubMove}
                onPointerUp={handleScrubEnd}
                onPointerLeave={handleScrubEnd}
            >
                {/* Time Ruler (Background) - showing frames */}
                <div className="absolute top-0 left-4 h-full pointer-events-none opacity-20 flex z-0" style={{ width: `${Math.max(totalDurationFrames * PIXELS_PER_FRAME + 200, 2000)}px` }}>
                    {Array.from({ length: Math.ceil(totalDurationFrames / fps) + 1 }).map((_, i) => {
                        const frameAtSecond = i * fps;
                        const pixelsAtSecond = frameAtSecond * PIXELS_PER_FRAME;
                        return (
                            <div key={i} className="h-full border-l border-slate-400 flex flex-col justify-between" style={{ width: `${fps * PIXELS_PER_FRAME}px`, left: `${pixelsAtSecond}px`, position: 'absolute' }}>
                                <span className="text-[10px] pl-1 text-slate-400">{i}s ({frameAtSecond}f)</span>
                            </div>
                        );
                    })}
                </div>

                <div className="relative z-10 flex flex-col gap-2 min-w-max pt-6 pb-6">
                    {/* Track 1: Text Layers - Stack only when overlapping */}
                    {(() => {
                        // Helper function to check if two time ranges overlap
                        const doRangesOverlap = (a: TextElement, b: TextElement): boolean => {
                            return !(a.positionEnd <= b.positionStart || b.positionEnd <= a.positionStart);
                        };

                        // Sort by z-index first, then by start time
                        const sortedTextElements = textElements
                            .slice()
                            .sort((a, b) => {
                                const zDiff = (a.zIndex ?? 0) - (b.zIndex ?? 0);
                                if (zDiff !== 0) return zDiff;
                                return a.positionStart - b.positionStart;
                            });

                        // Assign tracks: elements only get new tracks if they overlap with existing elements on that track
                        const tracks: TextElement[][] = [];
                        
                        sortedTextElements.forEach(layer => {
                            // Find the first track where this layer doesn't overlap with any existing layer
                            let assignedTrack = -1;
                            for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
                                const track = tracks[trackIndex];
                                const hasOverlap = track.some(existingLayer => doRangesOverlap(layer, existingLayer));
                                if (!hasOverlap) {
                                    assignedTrack = trackIndex;
                                    break;
                                }
                            }
                            
                            // If no track found without overlap, create a new one
                            if (assignedTrack === -1) {
                                tracks.push([layer]);
                            } else {
                                tracks[assignedTrack].push(layer);
                            }
                        });

                        // Render each track
                        return tracks.map((track, trackIndex) => (
                            <div 
                                key={`track-${trackIndex}`}
                                className="flex items-center h-8 gap-0.5 relative"
                                style={{ marginTop: trackIndex === 0 ? '0.5rem' : '0.25rem' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {track.map((layer) => {
                                    const textDuration = layer.positionEnd - layer.positionStart;
                                    const textWidth = textDuration * timelineZoom;
                                    const zIndex = layer.zIndex ?? 0;
                                    const isDragging = draggingTextItem?.id === layer.id;
                                    return (
                                        <div
                                            key={layer.id}
                                            onPointerDown={(e) => {
                                                // Don't start drag if clicking on resize handle
                                                if ((e.target as HTMLElement).closest('.resize-handle')) return;
                                                
                                                // Select the text element
                                                const layerIndex = textElements.findIndex(t => t.id === layer.id);
                                                if (layerIndex !== -1) {
                                                    dispatch(setActiveElement('text'));
                                                    dispatch(setActiveElementIndex(layerIndex));
                                                }
                                                
                                                handleTextDragStart(e, layer);
                                            }}
                                            className={`absolute h-8 rounded-md border flex items-center px-2 cursor-move select-none overflow-hidden group transition-all duration-200
                                                ${resizingItem?.id === layer.id ? 'ring-2 ring-purple-500 z-20 border-purple-500' : ''}
                                                ${isDragging ? 'ring-2 ring-purple-400 opacity-90 z-30 border-purple-400' : ''}
                                                ${activeElement === 'text' && textElements[activeElementIndex]?.id === layer.id ? 'bg-purple-900/60 border-2 border-white shadow-lg shadow-white/20 z-20' : 'bg-purple-900/40 border border-purple-500/30 hover:bg-purple-900/60'}
                                            `}
                                            style={{
                                                left: `${layer.positionStart * timelineZoom}px`,
                                                width: `${textWidth}px`,
                                                position: 'absolute',
                                                zIndex: isDragging ? 30 : (activeElement === 'text' && textElements[activeElementIndex]?.id === layer.id ? 20 : 10),
                                                transition: (resizingItem?.id === layer.id || isDragging) ? 'none' : 'width 0.1s ease-out, left 0.1s ease-out'
                                            }}
                                        >
                                            <Type className="w-3 h-3 mr-2 text-purple-200 shrink-0" />
                                            <span className="text-xs text-purple-100 truncate font-medium">{layer.text || 'New Text Layer'}</span>
                                            {zIndex !== 0 && (
                                                <span className="text-[8px] font-mono text-purple-400/80 ml-1 px-1 bg-purple-800/50 rounded">
                                                    z:{zIndex}
                                                </span>
                                            )}
                                            <span className="text-[9px] font-mono text-purple-300/70 ml-2">
                                                {Math.round(layer.positionStart * fps)}-{Math.round(layer.positionEnd * fps)}f
                                            </span>
                                            {/* Resize Handle (Text) */}
                                            <div 
                                                className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-purple-400/50 transition-colors z-20"
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    handleResizeStart(e, layer.id, 'text', textWidth);
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ));
                    })()}

                    {/* Track 2: Video Clips */}
                    <div className="flex items-center h-24 gap-0.5 relative" onClick={(e) => e.stopPropagation()}>
                        {mediaFiles.filter((clip) => clip.type === 'video').length === 0 && (
                            <div className="text-slate-500 text-sm italic ml-4 flex items-center gap-2 border border-dashed border-slate-700 rounded-lg px-8 py-4">
                                Open Library to add clips
                            </div>
                        )}
                        {mediaFiles
                            .filter((clip) => clip.type === 'video')
                            .sort((a, b) => a.positionStart - b.positionStart)
                            .map((clip, index) => {
                                const clipDuration = clip.positionEnd - clip.positionStart;
                                const clipWidth = clipDuration * timelineZoom;
                                const videoClips = mediaFiles.filter((c) => c.type === 'video').sort((a, b) => a.positionStart - b.positionStart);
                                const actualIndex = videoClips.findIndex(c => c.id === clip.id);
                                
                                return (
                                    <div
                                        key={clip.id}
                                        draggable={true}
                                        onDragStart={(e) => handleClipDragStart(e, actualIndex)}
                                        onDragOver={(e) => handleClipDragOver(e, actualIndex)}
                                        onDragEnd={() => setDraggedClipIndex(null)}
                                        className={`group relative h-24 bg-slate-800 rounded-md border overflow-hidden select-none transition-transform active:cursor-grabbing cursor-grab
                                            ${draggedClipIndex === actualIndex ? 'opacity-50 scale-95' : 'opacity-100'}
                                            ${resizingItem?.id === clip.id ? 'ring-2 ring-blue-500 z-20 border-blue-500' : ''}
                                            ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-2 border-white z-20 shadow-lg shadow-white/20' : 'border border-slate-600 hover:border-slate-400'}
                                        `}
                                        style={{ 
                                            width: `${clipWidth}px`,
                                            left: `${clip.positionStart * timelineZoom}px`,
                                            position: 'absolute',
                                            transition: resizingItem?.id === clip.id ? 'none' : 'width 0.1s ease-out, transform 0.2s'
                                        }}
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                            // Only select if not clicking on resize handle or delete button
                                            if (!(e.target as HTMLElement).closest('.resize-handle') && 
                                                !(e.target as HTMLElement).closest('button')) {
                                                const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                                dispatch(setActiveElement('media'));
                                                dispatch(setActiveElementIndex(allMediaIndex));
                                            }
                                        }}
                                    >
                                        {/* Video Preview Background - Leave space for waveform at bottom */}
                                        {clip.src && (
                                            <video 
                                                src={clip.src}
                                                className="absolute inset-0 w-full object-cover opacity-60 pointer-events-none rounded-md"
                                                style={{ height: 'calc(100% - 48px)', top: 0 }}
                                                muted
                                                onLoadedMetadata={(e) => { e.currentTarget.currentTime = 1; }}
                                            />
                                        )}
                                        <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center bg-black/20 cursor-grab active:cursor-grabbing hover:bg-black/40 transition-colors z-10 rounded-l-md">
                                            <GripVertical className="w-4 h-4 text-white/50" />
                                        </div>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pl-6 pr-4" style={{ bottom: '48px', top: 0 }}>
                                            <span className="text-xs font-medium text-white truncate w-full text-center drop-shadow-md z-10 px-2 relative mix-blend-difference">
                                                {clip.fileName}
                                            </span>
                                        </div>
                                        {/* Waveform Visualization - CapCut style at bottom */}
                                        {clip.src && clipWidth > 50 && (
                                            <div 
                                                className="absolute bottom-0 left-6 right-4 pointer-events-none z-30" 
                                                style={{ 
                                                    height: '48px',
                                                    width: 'calc(100% - 40px)',
                                                    background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                                                    borderRadius: '0 0 6px 6px'
                                                }}
                                            >
                                                <Waveform 
                                                    src={clip.src} 
                                                    width={Math.max(clipWidth - 40, 100)} 
                                                    height={48}
                                                    color={activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? "#ffffff" : "#60a5fa"}
                                                    volume={clip.volume ?? 50}
                                                />
                                            </div>
                                        )}
                                        {/* Delete Button */}
                                        <button 
                                            className="absolute right-1 top-1 p-1 bg-black/60 hover:bg-red-500 text-white rounded cursor-pointer z-30 transition-colors opacity-0 group-hover:opacity-100" 
                                            title="Remove Clip"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dispatch(setActiveElement('media'));
                                                dispatch(setActiveElementIndex(mediaFiles.findIndex(m => m.id === clip.id)));
                                                handleDelete(clip);
                                            }}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        {/* Resize Handle */}
                                        <div 
                                            className="resize-handle absolute right-0 top-0 bottom-0 w-4 cursor-col-resize bg-blue-500/0 hover:bg-blue-500/50 group-hover:bg-blue-500/30 transition-colors flex items-center justify-center z-20"
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                handleResizeStart(e, clip.id, 'clip', clipWidth);
                                            }}
                                        >
                                            <div className="w-0.5 h-8 bg-white/50 rounded-full"></div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Track 3: Audio */}
                    {mediaFiles.filter((clip) => clip.type === 'audio').length > 0 && (
                        <div className="flex items-center h-8 gap-0.5 relative" onClick={(e) => e.stopPropagation()}>
                            {mediaFiles
                                .filter((clip) => clip.type === 'audio')
                                .map((clip) => {
                                    const audioDuration = clip.positionEnd - clip.positionStart;
                                    const audioWidth = audioDuration * timelineZoom;
                                    return (
                                        <div 
                                            key={clip.id}
                                            className={`group relative h-8 bg-blue-900/30 rounded-md border overflow-hidden select-none transition-transform
                                                ${resizingItem?.id === clip.id ? 'ring-2 ring-blue-500 z-20 border-blue-500' : ''}
                                                ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-2 border-white z-20 shadow-lg shadow-white/20' : 'border border-blue-500/30 hover:border-blue-400'}
                                            `}
                                            style={{ 
                                                width: `${audioWidth}px`, 
                                                left: `${clip.positionStart * timelineZoom}px`, 
                                                position: 'absolute',
                                                transition: resizingItem?.id === clip.id ? 'none' : 'width 0.1s ease-out'
                                            }}
                                            title={clip.fileName}
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                // Only select if not clicking on resize handle or delete button
                                                if (!(e.target as HTMLElement).closest('.resize-handle') && 
                                                    !(e.target as HTMLElement).closest('button')) {
                                                    const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                                    dispatch(setActiveElement('media'));
                                                    dispatch(setActiveElementIndex(allMediaIndex));
                                                }
                                            }}
                                        >
                                            {/* Audio Icon and Label - Positioned at top */}
                                            <div className="absolute top-0 left-0 right-0 h-6 flex items-center px-2 pointer-events-none z-10">
                                                <Music className="w-3 h-3 mr-1 text-blue-400 shrink-0" />
                                                <span className="text-[10px] text-blue-200 truncate font-medium">{clip.fileName}</span>
                                            </div>
                                            {/* Waveform Visualization - Compact at bottom */}
                                            {clip.src && audioWidth > 50 && (
                                                <div 
                                                    className="absolute bottom-0 left-0 right-0 pointer-events-none z-0" 
                                                    style={{ 
                                                        height: '20px',
                                                        width: '100%',
                                                        background: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)',
                                                        borderRadius: '0 0 6px 6px'
                                                    }}
                                                >
                                                    <Waveform 
                                                        src={clip.src} 
                                                        width={Math.max(audioWidth, 100)} 
                                                        height={20}
                                                        color={activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? "#ffffff" : "#60a5fa"}
                                                        volume={clip.volume ?? 50}
                                                    />
                                                </div>
                                            )}
                                            {/* Delete Button */}
                                            <button 
                                                className="absolute right-1 top-1 p-1 bg-black/60 hover:bg-red-500 text-white rounded cursor-pointer z-30 transition-colors opacity-0 group-hover:opacity-100" 
                                                title="Remove Clip"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(clip);
                                                }}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                            {/* Resize Handle */}
                                            <div 
                                                className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-400/50 transition-colors z-20"
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    handleResizeStart(e, clip.id, 'clip', audioWidth);
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Playhead */}
                <div 
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                    style={{ left: `${currentFrame * PIXELS_PER_FRAME + 16}px` }}
                >
                    <div className="absolute -top-0 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45 transform rounded-sm shadow-sm"></div>
                </div>
            </div>
            <GlobalKeyHandlerProps handleDuplicate={handleDuplicate} handleSplit={handleSplit} handleDelete={handleDelete} />
        </div>
    );
};

export default memo(Timeline)
