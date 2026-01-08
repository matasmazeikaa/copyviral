import React, { useRef, useCallback, useMemo } from "react";
import Moveable, { OnScale, OnDrag, OnResize, OnRotate } from "react-moveable";
import { useAppSelector } from "@/app/store";
import { setActiveElement, setActiveElementIndex, setMediaFiles } from "@/app/store/slices/projectSlice";
import { memo, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import Image from "next/image";
import Header from "../Header";
import { MediaFile } from "@/app/types";
import { debounce, throttle } from "lodash";

export default function AudioTimeline() {
    const targetRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const { mediaFiles, textElements, activeElement, activeElementIndex, timelineZoom, fps } = useAppSelector((state) => state.projectState);
    const dispatch = useDispatch();
    const moveableRef = useRef<Record<string, Moveable | null>>({});


    // this affect the performance cause of too much re-renders

    // const onUpdateMedia = (id: string, updates: Partial<MediaFile>) => {
    //     dispatch(setMediaFiles(mediaFiles.map(media =>
    //         media.id === id ? { ...media, ...updates } : media
    //     )));
    // };

    // TODO: this is a hack to prevent the mediaFiles from being updated too often while dragging or resizing
    const mediaFilesRef = useRef(mediaFiles);
    useEffect(() => {
        mediaFilesRef.current = mediaFiles;
    }, [mediaFiles]);

    // Helper function to get maximum video duration (end of last video clip)
    const getMaxVideoDuration = useCallback((): number => {
        const videoClips = mediaFiles.filter(clip => clip.type === 'video');
        if (videoClips.length === 0) return 0;
        return Math.max(...videoClips.map(clip => clip.positionEnd));
    }, [mediaFiles]);

    // Snap function to snap to frame boundaries and nearby clip edges
    const snapTime = useCallback((time: number, element: MediaFile, allElements: MediaFile[]): number => {
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
        const videoClips = mediaFiles.filter(clip => clip.type === 'video');
        videoClips.forEach(videoClip => {
            snapPoints.push(videoClip.positionEnd);
        });
        
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

    const onUpdateMedia = useMemo(() =>
        throttle((id: string, updates: Partial<MediaFile>) => {
            const currentFiles = mediaFilesRef.current;
            const updated = currentFiles.map(media =>
                media.id === id ? { ...media, ...updates } : media
            );
            dispatch(setMediaFiles(updated));
        }, 100), [dispatch]
    );

    const handleClick = (element: string, index: number | string) => {
        if (element === 'media') {
            dispatch(setActiveElement('media') as any);
            // TODO: cause we pass id when media to find the right index i will change this later (this happens cause each timeline pass its index not index from mediaFiles array)
            const actualIndex = mediaFiles.findIndex(clip => clip.id === index as unknown as string);
            dispatch(setActiveElementIndex(actualIndex));
        }
    };

    const handleDrag = (clip: MediaFile, target: HTMLElement, left: number) => {
        // no negative left
        const constrainedLeft = Math.max(left, 0);
        const newPositionStart = constrainedLeft / timelineZoom;
        onUpdateMedia(clip.id, {
            positionStart: newPositionStart,
            positionEnd: (newPositionStart - clip.positionStart) + clip.positionEnd,
            endTime: Math.max((newPositionStart - clip.positionStart) + clip.endTime, clip.endTime)
        })

        target.style.left = `${constrainedLeft}px`;
    };

    const handleRightResize = (clip: MediaFile, target: HTMLElement, width: number) => {
        let newPositionEnd = clip.positionStart + (width / timelineZoom);
        
        // Apply snapping to video clip ends (but don't cap to video duration - audio can be longer)
        const allMediaFiles = mediaFilesRef.current.filter(m => m.type === 'video' || m.type === 'audio');
        newPositionEnd = snapTime(newPositionEnd, clip, allMediaFiles);
        
        // Ensure minimum duration (at least 0.1 seconds)
        const minDuration = 0.1;
        const constrainedPositionEnd = Math.max(newPositionEnd, clip.positionStart + minDuration);

        // Calculate the ratio of how much the clip was extended/shrunk
        const originalPositionDuration = clip.positionEnd - clip.positionStart;
        const originalSourceDuration = clip.endTime - clip.startTime;
        const newPositionDuration = constrainedPositionEnd - clip.positionStart;
        
        // Update endTime proportionally to match the new timeline duration
        const durationRatio = originalPositionDuration > 0 
            ? newPositionDuration / originalPositionDuration 
            : 1;
        const newEndTime = clip.startTime + (originalSourceDuration * durationRatio);

        onUpdateMedia(clip.id, {
            positionEnd: constrainedPositionEnd,
            endTime: Math.max(clip.startTime, newEndTime)
        });
    };

    const handleLeftResize = (clip: MediaFile, target: HTMLElement, width: number) => {
        const newWidth = width / timelineZoom;
        
        // Calculate new positionStart based on the new width
        const newPositionStart = Math.max(0, clip.positionEnd - newWidth);
        
        // Ensure minimum duration (at least 0.1 seconds)
        const minDuration = 0.1;
        const constrainedPositionStart = Math.min(newPositionStart, clip.positionEnd - minDuration);

        // Calculate the ratio of how much the clip was extended/shrunk
        const originalPositionDuration = clip.positionEnd - clip.positionStart;
        const originalSourceDuration = clip.endTime - clip.startTime;
        const newPositionDuration = clip.positionEnd - constrainedPositionStart;
        
        // Update startTime proportionally to match the new timeline duration
        const durationRatio = originalPositionDuration > 0 
            ? newPositionDuration / originalPositionDuration 
            : 1;
        const newStartTime = clip.endTime - (originalSourceDuration * durationRatio);

        // Update the visual position of the target
        target.style.left = `${constrainedPositionStart * timelineZoom}px`;

        onUpdateMedia(clip.id, {
            positionStart: constrainedPositionStart,
            startTime: Math.min(clip.endTime, newStartTime),
        });
    };

    useEffect(() => {
        for (const clip of mediaFiles) {
            moveableRef.current[clip.id]?.updateRect();
        }
    }, [timelineZoom]);

    return (
        <div >
            {mediaFiles
                .filter(clip => clip.type === 'audio')
                .map((clip) => (
                    <div key={clip.id} className="bg-green-500">
                        <div
                            key={clip.id}
                            ref={(el: HTMLDivElement | null) => {
                                if (el) {
                                    targetRefs.current[clip.id] = el;
                                }
                            }}
                            onClick={() => handleClick('media', clip.id)}
                            className={`absolute border border-gray-500 border-opacity-50 rounded-md top-2 h-12 text-white text-sm flex items-center justify-center cursor-pointer ${
                                clip.isPlaceholder 
                                    ? 'bg-[#3A2A1F] border-orange-500 border-dashed border-2' 
                                    : 'bg-[#27272A]'
                            } ${activeElement === 'media' && mediaFiles[activeElementIndex].id === clip.id ? 'bg-[#3F3F46] border-blue-500' : ''}`}
                            style={{
                                left: `${clip.positionStart * timelineZoom}px`,
                                width: `${(clip.positionEnd / clip.playbackSpeed - clip.positionStart / clip.playbackSpeed) * timelineZoom}px`,
                                zIndex: clip.zIndex,
                            }}
                        >
                            {/* <MoveableTimeline /> */}
                            <Image
                                alt="Audio"
                                className="h-7 w-7 min-w-6 mr-2 flex-shrink-0"
                                height={30}
                                width={30}
                                src={clip.isPlaceholder 
                                    ? "https://www.svgrepo.com/show/509075/cut.svg" 
                                    : "https://www.svgrepo.com/show/532708/music.svg"
                                }
                            />
                            <span className="truncate text-x">{clip.fileName}</span>
                            {clip.isPlaceholder && (
                                <span className="ml-2 text-xs text-orange-400">(Placeholder)</span>
                            )}
                        </div>
                        <Moveable
                            ref={(el: Moveable | null) => {
                                if (el) {
                                    moveableRef.current[clip.id] = el;
                                }
                            }}
                            target={targetRefs.current[clip.id] || null}
                            container={null}
                            renderDirections={activeElement === 'media' && mediaFiles[activeElementIndex].id === clip.id ? ['w', 'e'] : []}
                            draggable={true}
                            throttleDrag={0}
                            rotatable={false}
                            onDragStart={({ target, clientX, clientY }) => {
                            }}
                            onDrag={({
                                target,
                                beforeDelta, beforeDist,
                                left,
                                right,
                                delta, dist,
                                transform,
                            }: OnDrag) => {
                                handleClick('media', clip.id)
                                handleDrag(clip, target as HTMLElement, left);
                            }}
                            onDragEnd={({ target, isDrag, clientX, clientY }) => {
                            }}

                            /* resizable*/
                            resizable={true}
                            throttleResize={0}
                            onResizeStart={({ target, clientX, clientY }) => {
                            }}
                            onResize={({
                                target, width,
                                delta, direction,
                            }: OnResize) => {
                                if (direction[0] === 1) {
                                    handleClick('media', clip.id)
                                    delta[0] && (target!.style.width = `${width}px`);
                                    handleRightResize(clip, target as HTMLElement, width);
                                }
                                else if (direction[0] === -1) {
                                    handleClick('media', clip.id)
                                    delta[0] && (target!.style.width = `${width}px`);
                                    handleLeftResize(clip, target as HTMLElement, width);
                                }
                            }}
                            onResizeEnd={({ target, isDrag, clientX, clientY }) => {
                            }}
                        />
                    </div>

                ))}
        </div>
    );
}
