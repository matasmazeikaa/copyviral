import { useAppSelector } from "@/app/store";
import { setTextElements, setMediaFiles, setTimelineZoom, setCurrentTime, setIsPlaying, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { throttle } from 'lodash';
import GlobalKeyHandlerProps from "../../../components/editor/keys/GlobalKeyHandlerProps";
import toast from "react-hot-toast";
import { Clock, Film, Type, Music, X, ZoomIn, ZoomOut, Ruler, Trash2, Scissors } from 'lucide-react';
import { MediaFile, TextElement } from "@/app/types";
import { getVideoDuration } from "@/app/utils/videoDimensions";
import Waveform from "./Waveform";
interface TimelineProps {
    isMobile?: boolean;
}

export const Timeline = ({ isMobile = false }: TimelineProps) => {
    const { currentTime, timelineZoom, enableMarkerTracking, activeElement, activeElementIndex, mediaFiles, textElements, duration, isPlaying, fps } = useAppSelector((state) => state.projectState);
    const dispatch = useDispatch();
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [resizingItem, setResizingItem] = useState<{id: string, type: 'clip' | 'text'} | null>(null);
    const [draggingTextItem, setDraggingTextItem] = useState<{id: string, startPosition: number} | null>(null);
    const [textDragStartPos, setTextDragStartPos] = useState<{x: number, y: number, layerId: string} | null>(null);
    const draggingTextItemRef = useRef<{id: string, startPosition: number} | null>(null);
    const [draggingAudioItem, setDraggingAudioItem] = useState<{id: string, startPosition: number} | null>(null);
    const [audioDragStartPos, setAudioDragStartPos] = useState<{x: number, y: number, clipId: string} | null>(null);
    const draggingAudioItemRef = useRef<{id: string, startPosition: number} | null>(null);
    // Video dragging state (pointer-based for mobile support)
    const [draggingVideoItem, setDraggingVideoItem] = useState<{id: string, startPosition: number} | null>(null);
    const [videoDragStartPos, setVideoDragStartPos] = useState<{x: number, y: number, clipId: string} | null>(null);
    const draggingVideoItemRef = useRef<{id: string, startPosition: number} | null>(null);
    const startXRef = useRef<number>(0);
    const startValueRef = useRef<number>(0);
    const mediaFilesRef = useRef(mediaFiles);
    const textElementsRef = useRef(textElements);
    // Cache for video durations to avoid repeated async calls
    const videoDurationCache = useRef<Map<string, number>>(new Map());
    
    // Auto-scroll state for edge dragging
    const autoScrollRef = useRef<number | null>(null);
    const lastPointerXRef = useRef<number>(0);

    useEffect(() => {
        mediaFilesRef.current = mediaFiles;
    }, [mediaFiles]);

    useEffect(() => {
        textElementsRef.current = textElements;
    }, [textElements]);

    useEffect(() => {
        draggingTextItemRef.current = draggingTextItem;
    }, [draggingTextItem]);

    useEffect(() => {
        draggingAudioItemRef.current = draggingAudioItem;
    }, [draggingAudioItem]);

    useEffect(() => {
        draggingVideoItemRef.current = draggingVideoItem;
    }, [draggingVideoItem]);

    // Auto-scroll when dragging near edges
    const SCROLL_EDGE_SIZE = 80; // pixels from edge to start scrolling
    const SCROLL_SPEED_MAX = 15; // max pixels per frame
    
    const startAutoScroll = useCallback(() => {
        if (autoScrollRef.current !== null) return;
        
        const scroll = () => {
            if (!timelineRef.current) {
                autoScrollRef.current = null;
                return;
            }
            
            const rect = timelineRef.current.getBoundingClientRect();
            const pointerX = lastPointerXRef.current;
            const distanceFromRight = rect.right - pointerX;
            const distanceFromLeft = pointerX - rect.left;
            
            let scrollAmount = 0;
            
            if (distanceFromRight < SCROLL_EDGE_SIZE && distanceFromRight > 0) {
                // Scroll right - speed increases as pointer gets closer to edge
                const intensity = 1 - (distanceFromRight / SCROLL_EDGE_SIZE);
                scrollAmount = Math.ceil(intensity * SCROLL_SPEED_MAX);
            } else if (distanceFromLeft < SCROLL_EDGE_SIZE && distanceFromLeft > 0) {
                // Scroll left - speed increases as pointer gets closer to edge
                const intensity = 1 - (distanceFromLeft / SCROLL_EDGE_SIZE);
                scrollAmount = -Math.ceil(intensity * SCROLL_SPEED_MAX);
            }
            
            if (scrollAmount !== 0) {
                timelineRef.current.scrollLeft += scrollAmount;
                // Also update the startXRef to account for the scroll, keeping relative position
                startXRef.current -= scrollAmount;
            }
            
            autoScrollRef.current = requestAnimationFrame(scroll);
        };
        
        autoScrollRef.current = requestAnimationFrame(scroll);
    }, []);
    
    const stopAutoScroll = useCallback(() => {
        if (autoScrollRef.current !== null) {
            cancelAnimationFrame(autoScrollRef.current);
            autoScrollRef.current = null;
        }
    }, []);
    
    // Cleanup auto-scroll on unmount
    useEffect(() => {
        return () => {
            if (autoScrollRef.current !== null) {
                cancelAnimationFrame(autoScrollRef.current);
            }
        };
    }, []);
    
    // Auto-scroll timeline to follow playhead during playback (desktop only)
    useEffect(() => {
        if (isMobile || !isPlaying || !enableMarkerTracking || !timelineRef.current) return;
        
        const container = timelineRef.current;
        const playheadPosition = currentTime * timelineZoom + 16; // 16px is the left padding
        const containerLeft = container.scrollLeft;
        const containerRight = containerLeft + container.clientWidth;
        
        // Keep playhead in the center-right area of the visible timeline
        const targetScrollZone = container.clientWidth * 0.7; // 70% from left edge
        const targetPosition = containerLeft + targetScrollZone;
        
        // If playhead is past the target zone, scroll to keep it visible
        if (playheadPosition > containerRight - 50) {
            // Playhead is going off the right edge - scroll right
            container.scrollLeft = playheadPosition - targetScrollZone;
        } else if (playheadPosition < containerLeft + 50) {
            // Playhead is going off the left edge - scroll left
            container.scrollLeft = Math.max(0, playheadPosition - 50);
        }
    }, [currentTime, timelineZoom, isPlaying, enableMarkerTracking, isMobile]);

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

            const firstPart: MediaFile = {
                ...element,
                id: crypto.randomUUID(),
                positionStart,
                positionEnd: clampedSnappedTime,
                startTime,
                endTime: splitSourceOffset,
                // Explicitly preserve audio properties to ensure they're not lost
                volume: element.volume,
                playbackSpeed: element.playbackSpeed,
            };

            const secondPart: MediaFile = {
                ...element,
                id: crypto.randomUUID(),
                positionStart: clampedSnappedTime,
                positionEnd,
                startTime: splitSourceOffset,
                endTime,
                // Explicitly preserve audio properties to ensure they're not lost
                volume: element.volume,
                playbackSpeed: element.playbackSpeed,
            };

            console.log('Split media - Original volume:', element.volume, 'First part volume:', firstPart.volume, 'Second part volume:', secondPart.volume);
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
                const deletedPositionStart = deletedElement.positionStart;
                const deletedDuration = deletedElement.positionEnd - deletedPositionStart;
                
                // Find clips that come after the deleted clip and shift them left
                updatedMediaFiles = updatedMediaFiles.map((el) => {
                    if ('type' in el && el.type === 'video' && el.positionStart > deletedPositionStart) {
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

    // Scrubbing handlers
    const handleScrubStart = (e: React.PointerEvent) => {
        if (resizingItem || draggingTextItem || textDragStartPos || draggingAudioItem || audioDragStartPos || draggingVideoItem || videoDragStartPos) return;
        setIsScrubbing(true);
        updateScrub(e);
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const handleScrubMove = (e: React.PointerEvent) => {
        if (resizingItem) {
            handleResizeMove(e);
        } else if (textDragStartPos || draggingTextItem) {
            handleTextDragMove(e);
        } else if (audioDragStartPos || draggingAudioItem) {
            handleAudioDragMove(e);
        } else if (videoDragStartPos || draggingVideoItem) {
            handleVideoDragMove(e);
        } else if (isScrubbing) {
            updateScrub(e);
        }
    };

    const handleScrubEnd = (e: React.PointerEvent) => {
        if (resizingItem) {
            handleResizeEnd(e);
        } else if (draggingTextItem || textDragStartPos) {
            handleTextDragEnd(e);
        } else if (draggingAudioItem || audioDragStartPos) {
            handleAudioDragEnd(e);
        } else if (draggingVideoItem || videoDragStartPos) {
            handleVideoDragEnd(e);
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
                    
                    // For audio clips: apply snapping to video clip ends (but don't cap to video duration)
                    if (clip.type === 'audio') {
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
        }, 50), [resizingItem, dispatch, fps, timelineZoom, snapTime]);

    const handleResizeMove = (e: React.PointerEvent) => {
        if (!resizingItem) return;
        e.stopPropagation();
        mouseXRef.current = e.clientX;
        // Update pointer position for auto-scroll
        lastPointerXRef.current = e.clientX;
        startAutoScroll();
        throttledResizeUpdate();
    };

    const handleResizeEnd = (e: React.PointerEvent) => {
        setResizingItem(null);
        stopAutoScroll();
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
        
        // Update pointer position for auto-scroll
        lastPointerXRef.current = e.clientX;
        
        const deltaX = Math.abs(e.clientX - textDragStartPos.x);
        const deltaY = Math.abs(e.clientY - textDragStartPos.y);
        const DRAG_THRESHOLD = 5; // pixels
        
        // Only start dragging if user has moved enough
        if (!draggingTextItem && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
            const layer = textElementsRef.current.find(l => l.id === textDragStartPos.layerId);
            if (layer) {
                setDraggingTextItem({ id: layer.id, startPosition: layer.positionStart });
                startAutoScroll();
            }
        }
        
        if (draggingTextItem) {
            mouseXTextDragRef.current = e.clientX;
            throttledTextDragUpdate();
        }
    };

    const handleTextDragEnd = (e: React.PointerEvent) => {
        setDraggingTextItem(null);
        setTextDragStartPos(null);
        stopAutoScroll();
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    // Audio drag handlers
    const handleAudioDragStart = (e: React.PointerEvent, clip: MediaFile) => {
        e.preventDefault();
        e.stopPropagation();
        setAudioDragStartPos({ x: e.clientX, y: e.clientY, clipId: clip.id });
        startXRef.current = e.clientX;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const mouseXAudioDragRef = useRef<number>(0);
    const throttledAudioDragUpdate = useMemo(() =>
        throttle(() => {
            const currentDraggingItem = draggingAudioItemRef.current;
            if (!currentDraggingItem) return;
            
            const currentFiles = mediaFilesRef.current;
            const clip = currentFiles.find(c => c.id === currentDraggingItem.id);
            if (!clip) return;

            const deltaX = mouseXAudioDragRef.current - startXRef.current;
            const deltaSeconds = deltaX / timelineZoom;
            const newPositionStart = Math.max(0, currentDraggingItem.startPosition + deltaSeconds);
            const duration = clip.positionEnd - clip.positionStart;
            const newPositionEnd = newPositionStart + duration;

            // Snap to frame boundaries and nearby clip edges (including video ends)
            const allMediaFiles = currentFiles.filter(m => m.type === 'video' || m.type === 'audio');
            const snappedStart = snapTime(newPositionStart, clip, allMediaFiles, true);
            const snappedEnd = snappedStart + duration;

            dispatch(setMediaFiles(currentFiles.map(m => 
                m.id === currentDraggingItem.id 
                    ? { ...m, positionStart: snappedStart, positionEnd: snappedEnd }
                    : m
            )));
        }, 50), [dispatch, timelineZoom, snapTime]);

    const handleAudioDragMove = (e: React.PointerEvent) => {
        if (!audioDragStartPos) return;
        e.stopPropagation();
        
        // Update pointer position for auto-scroll
        lastPointerXRef.current = e.clientX;
        
        const deltaX = Math.abs(e.clientX - audioDragStartPos.x);
        const deltaY = Math.abs(e.clientY - audioDragStartPos.y);
        const DRAG_THRESHOLD = 5; // pixels
        
        // Only start dragging if user has moved enough
        if (!draggingAudioItem && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
            const clip = mediaFilesRef.current.find(c => c.id === audioDragStartPos.clipId);
            if (clip) {
                setDraggingAudioItem({ id: clip.id, startPosition: clip.positionStart });
                startAutoScroll();
            }
        }
        
        if (draggingAudioItem) {
            mouseXAudioDragRef.current = e.clientX;
            throttledAudioDragUpdate();
        }
    };

    const handleAudioDragEnd = (e: React.PointerEvent) => {
        setDraggingAudioItem(null);
        setAudioDragStartPos(null);
        stopAutoScroll();
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    // Video drag handlers (pointer-based for mobile support)
    const handleVideoDragStart = (e: React.PointerEvent, clip: MediaFile) => {
        e.preventDefault();
        e.stopPropagation();
        setVideoDragStartPos({ x: e.clientX, y: e.clientY, clipId: clip.id });
        startXRef.current = e.clientX;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    const mouseXVideoDragRef = useRef<number>(0);
    const throttledVideoDragUpdate = useMemo(() =>
        throttle(() => {
            const currentDraggingItem = draggingVideoItemRef.current;
            if (!currentDraggingItem) return;
            
            const currentFiles = mediaFilesRef.current;
            const clip = currentFiles.find(c => c.id === currentDraggingItem.id);
            if (!clip) return;

            const deltaX = mouseXVideoDragRef.current - startXRef.current;
            const deltaSeconds = deltaX / timelineZoom;
            const newPositionStart = Math.max(0, currentDraggingItem.startPosition + deltaSeconds);
            const clipDuration = clip.positionEnd - clip.positionStart;

            // Get all video clips sorted by position
            const videoClips = currentFiles
                .filter(c => c.type === 'video')
                .sort((a, b) => a.positionStart - b.positionStart);
            
            const currentIndex = videoClips.findIndex(c => c.id === clip.id);
            if (currentIndex === -1) return;

            // Find the target position based on where the clip is being dragged
            let targetIndex = 0;
            for (let i = 0; i < videoClips.length; i++) {
                if (videoClips[i].id === clip.id) continue;
                const midPoint = videoClips[i].positionStart + (videoClips[i].positionEnd - videoClips[i].positionStart) / 2;
                if (newPositionStart > midPoint) {
                    targetIndex = i + 1;
                }
            }
            
            // Adjust target index if we're moving after the current position
            if (targetIndex > currentIndex) {
                targetIndex--;
            }

            // Only reorder if the target position is different
            if (targetIndex !== currentIndex) {
                const reorderedClips = [...videoClips];
                const [movedClip] = reorderedClips.splice(currentIndex, 1);
                reorderedClips.splice(targetIndex, 0, movedClip);

                // Recalculate positions to be sequential (track magnet effect)
                let currentPosition = 0;
                const updatedClips = reorderedClips.map((c) => {
                    const duration = c.positionEnd - c.positionStart;
                    const updatedClip = {
                        ...c,
                        positionStart: currentPosition,
                        positionEnd: currentPosition + duration,
                    };
                    currentPosition += duration;
                    return updatedClip;
                });

                // Update all media files, preserving non-video items
                const updatedMediaFiles = currentFiles.map((file) => {
                    if (file.type === 'video') {
                        const updatedClip = updatedClips.find(c => c.id === file.id);
                        return updatedClip || file;
                    }
                    return file;
                });

                dispatch(setMediaFiles(updatedMediaFiles));
                
                // Update the start position reference for the next drag update
                const newClip = updatedClips.find(c => c.id === clip.id);
                if (newClip) {
                    startXRef.current = mouseXVideoDragRef.current;
                    setDraggingVideoItem({ id: clip.id, startPosition: newClip.positionStart });
                }
            }
        }, 100), [dispatch, timelineZoom]);

    const handleVideoDragMove = (e: React.PointerEvent) => {
        if (!videoDragStartPos) return;
        e.stopPropagation();
        
        // Update pointer position for auto-scroll
        lastPointerXRef.current = e.clientX;
        
        const deltaX = Math.abs(e.clientX - videoDragStartPos.x);
        const deltaY = Math.abs(e.clientY - videoDragStartPos.y);
        const DRAG_THRESHOLD = 5; // pixels
        
        // Only start dragging if user has moved enough
        if (!draggingVideoItem && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
            const clip = mediaFilesRef.current.find(c => c.id === videoDragStartPos.clipId);
            if (clip) {
                setDraggingVideoItem({ id: clip.id, startPosition: clip.positionStart });
                startAutoScroll();
            }
        }
        
        if (draggingVideoItem) {
            mouseXVideoDragRef.current = e.clientX;
            throttledVideoDragUpdate();
        }
    };

    const handleVideoDragEnd = (e: React.PointerEvent) => {
        setDraggingVideoItem(null);
        setVideoDragStartPos(null);
        stopAutoScroll();
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    // Mobile: Track if we're currently scrolling (to prevent scroll/time update loops)
    const [isMobileScrolling, setIsMobileScrolling] = useState(false);
    const [mobileContainerWidth, setMobileContainerWidth] = useState(300);
    const mobileScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgrammaticScrollRef = useRef<number>(0);
    
    // Mobile: Update container width on resize
    useEffect(() => {
        if (!isMobile || !timelineRef.current) return;
        
        const updateWidth = () => {
            if (timelineRef.current) {
                setMobileContainerWidth(timelineRef.current.clientWidth);
            }
        };
        
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, [isMobile]);
    
    // Mobile: Sync scroll position with currentTime (playhead stays centered)
    useEffect(() => {
        if (!isMobile || !timelineRef.current || isMobileScrolling) return;
        
        const container = timelineRef.current;
        const centerOffset = mobileContainerWidth / 2;
        
        // Calculate scroll position to center the current time
        // The content starts at centerPadding, so currentTime position in scroll terms is:
        // centerPadding + (currentTime * timelineZoom) - centerOffset
        // Which simplifies to: currentTime * timelineZoom (since centerPadding = centerOffset)
        const targetScrollLeft = currentTime * timelineZoom;
        const maxScroll = container.scrollWidth - container.clientWidth;
        const clampedScroll = Math.max(0, Math.min(maxScroll, targetScrollLeft));
        
        // Only scroll if the difference is significant (avoid micro-adjustments)
        if (Math.abs(container.scrollLeft - clampedScroll) > 2) {
            lastProgrammaticScrollRef.current = Date.now();
            container.scrollLeft = clampedScroll;
        }
    }, [isMobile, currentTime, timelineZoom, isMobileScrolling, mobileContainerWidth]);
    
    // Mobile: Handle scroll to update currentTime
    const handleMobileScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (!isMobile || !timelineRef.current) return;
        
        // Ignore programmatic scrolls
        if (Date.now() - lastProgrammaticScrollRef.current < 50) return;
        
        setIsMobileScrolling(true);
        
        const container = timelineRef.current;
        
        // Calculate time at center of viewport
        // scrollLeft directly corresponds to time * timelineZoom due to our padding setup
        const scrollLeft = container.scrollLeft;
        const timeAtCenter = scrollLeft / timelineZoom;
        const clampedTime = Math.max(0, Math.min(duration, timeAtCenter));
        
        dispatch(setCurrentTime(clampedTime));
        dispatch(setIsPlaying(false));
        
        // Clear existing timeout
        if (mobileScrollTimeoutRef.current) {
            clearTimeout(mobileScrollTimeoutRef.current);
        }
        
        // Reset scrolling state after scroll ends
        mobileScrollTimeoutRef.current = setTimeout(() => {
            setIsMobileScrolling(false);
        }, 150);
    }, [isMobile, timelineZoom, duration, dispatch]);
    
    // Cleanup mobile scroll timeout
    useEffect(() => {
        return () => {
            if (mobileScrollTimeoutRef.current) {
                clearTimeout(mobileScrollTimeoutRef.current);
            }
        };
    }, []);

    // Mobile compact layout with centered playhead (CapCut style)
    if (isMobile) {
        // Calculate padding needed to allow scrolling to start/end
        const centerPadding = mobileContainerWidth / 2;
        const totalTimelineWidth = duration * timelineZoom;
        // Total scrollable width: padding + content + padding
        const totalContentWidth = totalTimelineWidth + (centerPadding * 2);
        
        // Check if we can split the current element
        const canSplitMobile = (() => {
            if (!activeElement) return false;
            if (activeElement === 'media') {
                const element = mediaFiles[activeElementIndex];
                if (element) {
                    return currentTime > element.positionStart && currentTime < element.positionEnd;
                }
            } else if (activeElement === 'text') {
                const element = textElements[activeElementIndex];
                if (element) {
                    return currentTime > element.positionStart && currentTime < element.positionEnd;
                }
            }
            return false;
        })();
        
        return (
            <div className="w-full bg-slate-900 flex flex-col shrink-0 z-30 relative" style={{ height: '145px' }}>
                {/* Mobile Toolbar - Time display and action buttons */}
                <div className="h-[30px] bg-slate-800/80 border-b border-slate-700/50 flex items-center justify-between px-3 shrink-0">
                    {/* Time Display */}
                    <div className="flex items-center gap-1.5 text-slate-300">
                        <Clock className="w-3 h-3 text-pink-400" />
                        <span className="text-[11px] font-mono font-medium text-pink-300">{currentTime.toFixed(1)}s</span>
                        <span className="text-slate-500 text-[10px]">/</span>
                        <span className="text-[11px] font-mono text-slate-400">{duration.toFixed(1)}s</span>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {activeElement && (
                            <>
                                <button
                                    onClick={handleSplit}
                                    disabled={!canSplitMobile}
                                    className="p-1.5 text-blue-400 hover:text-blue-300 active:bg-blue-500/30 rounded-md transition-colors border border-blue-500/30 disabled:opacity-30 disabled:border-slate-600 disabled:text-slate-500"
                                    title="Split"
                                >
                                    <Scissors className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete()}
                                    className="p-1.5 text-red-400 hover:text-red-300 active:bg-red-500/30 rounded-md transition-colors border border-red-500/30"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Fixed Center Playhead - Always in the middle */}
                <div 
                    className="absolute top-[30px] bottom-0 w-0.5 bg-pink-500 z-50 pointer-events-none"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                >
                </div>
                
                {/* Mobile Tracks Container - Horizontal scroll with thumbnails */}
                <div 
                    className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative select-none touch-pan-x scrollbar-hide" 
                    ref={timelineRef}
                    onScroll={handleMobileScroll}
                    onPointerMove={(e) => {
                        // Only handle drag operations on mobile, not scrubbing
                        if (resizingItem) {
                            handleResizeMove(e);
                        } else if (textDragStartPos || draggingTextItem) {
                            handleTextDragMove(e);
                        } else if (audioDragStartPos || draggingAudioItem) {
                            handleAudioDragMove(e);
                        } else if (videoDragStartPos || draggingVideoItem) {
                            handleVideoDragMove(e);
                        }
                    }}
                    onPointerUp={(e) => {
                        // Only handle drag end operations on mobile
                        if (resizingItem) {
                            handleResizeEnd(e);
                        } else if (draggingTextItem || textDragStartPos) {
                            handleTextDragEnd(e);
                        } else if (draggingAudioItem || audioDragStartPos) {
                            handleAudioDragEnd(e);
                        } else if (draggingVideoItem || videoDragStartPos) {
                            handleVideoDragEnd(e);
                        }
                    }}
                    onPointerLeave={(e) => {
                        // Only handle drag end operations on mobile
                        if (resizingItem) {
                            handleResizeEnd(e);
                        } else if (draggingTextItem || textDragStartPos) {
                            handleTextDragEnd(e);
                        } else if (draggingAudioItem || audioDragStartPos) {
                            handleAudioDragEnd(e);
                        } else if (draggingVideoItem || videoDragStartPos) {
                            handleVideoDragEnd(e);
                        }
                    }}
                >
                    <div 
                        className="relative z-10 flex flex-col gap-1 py-1.5"
                        style={{ 
                            width: `${totalContentWidth}px`,
                            paddingLeft: `${centerPadding}px`,
                            paddingRight: `${centerPadding}px`,
                        }}
                    >
                        {/* Video Track - Compact thumbnails */}
                        <div className="flex items-center h-14 gap-0.5 relative" onClick={(e) => e.stopPropagation()}>
                            {mediaFiles.filter((clip) => clip.type === 'video').length === 0 && (
                                <div className="text-slate-500 text-[10px] ml-2 flex items-center gap-1 border border-dashed border-slate-700 rounded-lg px-3 py-1.5">
                                    Tap Tools to add clips
                                </div>
                            )}
                            {mediaFiles
                                .filter((clip) => clip.type === 'video')
                                .sort((a, b) => a.positionStart - b.positionStart)
                                .map((clip) => {
                                    const clipDuration = clip.positionEnd - clip.positionStart;
                                    const clipWidth = clipDuration * timelineZoom;
                                    const isDraggingVideo = draggingVideoItem?.id === clip.id;
                                    return (
                                        <div
                                            key={clip.id}
                                            className={`timeline-clip group relative h-14 bg-slate-800 rounded-lg border overflow-hidden select-none touch-none
                                                ${isDraggingVideo ? 'opacity-70 ring-2 ring-purple-400 z-30' : ''}
                                                ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-2 border-purple-400 z-20 shadow-lg shadow-purple-500/20' : 'border-slate-600'}
                                            `}
                                            style={{ 
                                                width: `${Math.max(clipWidth, 40)}px`,
                                                left: `${clip.positionStart * timelineZoom}px`,
                                                position: 'absolute',
                                            }}
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                if ((e.target as HTMLElement).closest('.resize-handle')) return;
                                                const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                                dispatch(setActiveElement('media'));
                                                dispatch(setActiveElementIndex(allMediaIndex));
                                                handleVideoDragStart(e, clip);
                                            }}
                                        >
                                            {clip.src && (
                                                <video 
                                                    src={clip.src}
                                                    className="absolute inset-0 w-full h-full object-cover opacity-70 pointer-events-none"
                                                    muted
                                                    onLoadedMetadata={(e) => { e.currentTarget.currentTime = 1; }}
                                                />
                                            )}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
                                                <span className="text-[8px] text-white truncate block font-medium">{clip.fileName}</span>
                                            </div>
                                            {/* Resize Handle */}
                                            <div 
                                                className="resize-handle absolute right-0 top-0 bottom-0 w-4 cursor-col-resize bg-purple-500/0 active:bg-purple-500/50 touch-none"
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    handleResizeStart(e, clip.id, 'clip', clipWidth);
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                        </div>

                        {/* Audio Track - Compact */}
                        {mediaFiles.filter((clip) => clip.type === 'audio').length > 0 && (
                            <div className="flex items-center h-5 gap-0.5 relative" onClick={(e) => e.stopPropagation()}>
                                {mediaFiles
                                    .filter((clip) => clip.type === 'audio')
                                    .map((clip) => {
                                        const audioDuration = clip.positionEnd - clip.positionStart;
                                        const audioWidth = audioDuration * timelineZoom;
                                        return (
                                            <div 
                                                key={clip.id}
                                                className={`timeline-clip relative h-5 bg-blue-900/40 rounded border overflow-hidden touch-none
                                                    ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-purple-400' : 'border-blue-500/30'}
                                                `}
                                                style={{ 
                                                    width: `${audioWidth}px`, 
                                                    left: `${clip.positionStart * timelineZoom}px`, 
                                                    position: 'absolute',
                                                }}
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                                    dispatch(setActiveElement('media'));
                                                    dispatch(setActiveElementIndex(allMediaIndex));
                                                    handleAudioDragStart(e, clip);
                                                }}
                                            >
                                                <div className="flex items-center h-full px-1">
                                                    <Music className="w-2.5 h-2.5 text-blue-400 mr-0.5 shrink-0" />
                                                    <span className="text-[8px] text-blue-200 truncate">{clip.fileName}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}

                        {/* Text Track - Compact */}
                        {textElements.length > 0 && (
                            <div className="flex items-center h-4 gap-0.5 relative" onClick={(e) => e.stopPropagation()}>
                                {textElements.map((layer) => {
                                    const textDuration = layer.positionEnd - layer.positionStart;
                                    const textWidth = textDuration * timelineZoom;
                                    return (
                                        <div
                                            key={layer.id}
                                            className={`timeline-clip absolute h-4 rounded border flex items-center px-1 touch-none
                                                ${activeElement === 'text' && textElements[activeElementIndex]?.id === layer.id ? 'bg-purple-600 border-purple-400' : 'bg-purple-900/40 border-purple-500/30'}
                                            `}
                                            style={{
                                                left: `${layer.positionStart * timelineZoom}px`,
                                                width: `${Math.max(textWidth, 24)}px`,
                                            }}
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                const layerIndex = textElements.findIndex(t => t.id === layer.id);
                                                dispatch(setActiveElement('text'));
                                                dispatch(setActiveElementIndex(layerIndex));
                                                handleTextDragStart(e, layer);
                                            }}
                                        >
                                            <Type className="w-2 h-2 text-purple-300 mr-0.5 shrink-0" />
                                            <span className="text-[7px] text-purple-100 truncate">{layer.text || 'T'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <GlobalKeyHandlerProps handleDuplicate={handleDuplicate} handleSplit={handleSplit} handleDelete={handleDelete} />
            </div>
        );
    }

    // Desktop layout
    return (
        <div className="w-full h-full min-h-[200px] max-h-[300px] bg-[#0f172a] border-t border-slate-800 flex flex-col shrink-0 z-30">
            {/* Timeline Header */}
            <div className="h-10 bg-[#1e293b] border-b border-slate-800 flex items-center justify-between px-4 shrink-0 gap-2">
                <div className="flex items-center gap-2 text-slate-400">
                    <Film className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Timeline</span>
                </div>
                <div className="flex items-center gap-4">
                    {/* Time Display */}
                    <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900/50 px-3 py-1 rounded-md">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs font-mono text-blue-400">{currentTime.toFixed(1)}s / {duration.toFixed(1)}s</span>
                    </div>
                    
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
                </div>
            </div>

            {/* Tracks Container */}
            <div 
                className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative p-2 lg:p-4 select-none cursor-crosshair touch-pan-x" 
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
                                            className={`absolute h-8 rounded-md border flex items-center px-2 cursor-move select-none overflow-hidden group transition-all duration-200 touch-none
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
                                            {/* Resize Handle (Text) - wider for touch */}
                                            <div 
                                                className="resize-handle absolute right-0 top-0 bottom-0 w-6 cursor-col-resize hover:bg-purple-400/50 active:bg-purple-400/70 transition-colors z-20 touch-none flex items-center justify-center"
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    handleResizeStart(e, layer.id, 'text', textWidth);
                                                }}
                                            >
                                                <div className="w-0.5 h-4 bg-purple-400/50 rounded-full"></div>
                                            </div>
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
                            .map((clip) => {
                                const clipDuration = clip.positionEnd - clip.positionStart;
                                const clipWidth = clipDuration * timelineZoom;
                                const isDraggingVideo = draggingVideoItem?.id === clip.id;
                                return (
                                    <div
                                        key={clip.id}
                                        className={`group relative h-24 bg-slate-800 rounded-md border overflow-hidden select-none transition-transform active:cursor-grabbing cursor-grab touch-none
                                            ${isDraggingVideo ? 'opacity-70 scale-[0.98] ring-2 ring-blue-400 z-30' : 'opacity-100'}
                                            ${resizingItem?.id === clip.id ? 'ring-2 ring-blue-500 z-20 border-blue-500' : ''}
                                            ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-2 border-white z-20 shadow-lg shadow-white/20' : 'border border-slate-600 hover:border-slate-400'}
                                        `}
                                        style={{ 
                                            width: `${clipWidth}px`,
                                            left: `${clip.positionStart * timelineZoom}px`,
                                            position: 'absolute',
                                            zIndex: isDraggingVideo ? 30 : (activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 20 : 10),
                                            transition: (resizingItem?.id === clip.id || isDraggingVideo) ? 'none' : 'width 0.1s ease-out, left 0.1s ease-out, transform 0.2s'
                                        }}
                                        onPointerDown={(e) => {
                                            e.stopPropagation();
                                            // Don't start drag if clicking on resize handle or delete button
                                            if ((e.target as HTMLElement).closest('.resize-handle') || 
                                                (e.target as HTMLElement).closest('button')) {
                                                return;
                                            }
                                            
                                            // Select the video element
                                            const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                            dispatch(setActiveElement('media'));
                                            dispatch(setActiveElementIndex(allMediaIndex));
                                            
                                            handleVideoDragStart(e, clip);
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
                                        {/* Resize Handle - wider for touch */}
                                        <div 
                                            className="resize-handle absolute right-0 top-0 bottom-0 w-6 cursor-col-resize bg-blue-500/0 hover:bg-blue-500/50 active:bg-blue-500/70 group-hover:bg-blue-500/30 transition-colors flex items-center justify-center z-20 touch-none"
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
                                            className={`group relative h-8 bg-blue-900/30 rounded-md border overflow-hidden select-none transition-transform cursor-move touch-none
                                                ${resizingItem?.id === clip.id ? 'ring-2 ring-blue-500 z-20 border-blue-500' : ''}
                                                ${draggingAudioItem?.id === clip.id ? 'ring-2 ring-blue-400 opacity-90 z-30 border-blue-400' : ''}
                                                ${activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 'border-2 border-white z-20 shadow-lg shadow-white/20' : 'border border-blue-500/30 hover:border-blue-400'}
                                            `}
                                            style={{ 
                                                width: `${audioWidth}px`, 
                                                left: `${clip.positionStart * timelineZoom}px`, 
                                                position: 'absolute',
                                                zIndex: draggingAudioItem?.id === clip.id ? 30 : (activeElement === 'media' && mediaFiles[activeElementIndex]?.id === clip.id ? 20 : 10),
                                                transition: (resizingItem?.id === clip.id || draggingAudioItem?.id === clip.id) ? 'none' : 'width 0.1s ease-out, left 0.1s ease-out'
                                            }}
                                            title={clip.fileName}
                                            onPointerDown={(e) => {
                                                e.stopPropagation();
                                                // Don't start drag if clicking on resize handle or delete button
                                                if ((e.target as HTMLElement).closest('.resize-handle') || 
                                                    (e.target as HTMLElement).closest('button')) {
                                                    return;
                                                }
                                                
                                                // Select the audio element
                                                const allMediaIndex = mediaFiles.findIndex(m => m.id === clip.id);
                                                dispatch(setActiveElement('media'));
                                                dispatch(setActiveElementIndex(allMediaIndex));
                                                
                                                handleAudioDragStart(e, clip);
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
                                            {/* Resize Handle - wider for touch */}
                                            <div 
                                                className="resize-handle absolute right-0 top-0 bottom-0 w-6 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-400/70 transition-colors z-20 touch-none flex items-center justify-center"
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    handleResizeStart(e, clip.id, 'clip', audioWidth);
                                                }}
                                            >
                                                <div className="w-0.5 h-4 bg-blue-400/50 rounded-full"></div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Playhead - uses transform for smoother animation during playback */}
                <div 
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                    style={{ 
                        transform: `translateX(${currentTime * timelineZoom + 16}px)`,
                        willChange: isPlaying ? 'transform' : 'auto',
                        left: 0,
                    }}
                >
                    <div className="absolute -top-0 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45 transform rounded-sm shadow-sm"></div>
                </div>
            </div>
            <GlobalKeyHandlerProps handleDuplicate={handleDuplicate} handleSplit={handleSplit} handleDelete={handleDelete} />
        </div>
    );
};

export default memo(Timeline)
