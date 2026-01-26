"use client";

import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import Moveable, { OnDrag, OnResize } from "react-moveable";
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMediaFiles, setTextElements, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { MediaFile, TextElement } from "@/app/types";
import { throttle } from "lodash";

interface CanvasOverlayProps {
    playerWidth: number;
    playerHeight: number;
    canvasWidth?: number;
    canvasHeight?: number;
}

// Type for draggable elements
type ElementType = 'media' | 'text';

interface DraggableElement {
    id: string;
    elementType: ElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    isVisible: boolean;
    originalIndex: number;
}

export default function CanvasOverlay({
    playerWidth,
    playerHeight,
    canvasWidth = 1080,
    canvasHeight = 1920,
}: CanvasOverlayProps) {
    const dispatch = useAppDispatch();
    const { mediaFiles, textElements, currentTime, activeElement, activeElementIndex } = useAppSelector(
        (state) => state.projectState
    );

    const [targetElement, setTargetElement] = useState<HTMLDivElement | null>(null);
    const moveableRef = useRef<Moveable>(null);

    // Calculate scale factor between canvas and player
    const scaleFactor = useMemo(() => playerWidth / canvasWidth, [playerWidth, canvasWidth]);

    // Store mediaFiles and textElements in refs for throttled updates
    const mediaFilesRef = useRef(mediaFiles);
    const textElementsRef = useRef(textElements);

    useEffect(() => {
        mediaFilesRef.current = mediaFiles;
    }, [mediaFiles]);

    useEffect(() => {
        textElementsRef.current = textElements;
    }, [textElements]);

    // Get all draggable elements (images visible at current time)
    const draggableElements = useMemo((): DraggableElement[] => {
        const elements: DraggableElement[] = [];

        // Add images from mediaFiles
        mediaFiles.forEach((media, index) => {
            if (media.type === 'image' && !media.isPlaceholder) {
                const isVisible = currentTime >= media.positionStart && currentTime < media.positionEnd;
                elements.push({
                    id: media.id,
                    elementType: 'media',
                    x: media.x || 0,
                    y: media.y || 0,
                    width: media.width || canvasWidth,
                    height: media.height || canvasHeight,
                    isVisible,
                    originalIndex: index,
                });
            }
        });

        // In the future, add text elements here
        // textElements.forEach((text, index) => { ... });

        return elements;
    }, [mediaFiles, textElements, currentTime, canvasWidth, canvasHeight]);

    // Get the currently selected element
    const selectedElement = useMemo(() => {
        if (activeElement === 'media' && activeElementIndex >= 0 && activeElementIndex < mediaFiles.length) {
            const media = mediaFiles[activeElementIndex];
            if (media.type === 'image' && !media.isPlaceholder) {
                const isVisible = currentTime >= media.positionStart && currentTime < media.positionEnd;
                if (isVisible) {
                    return {
                        id: media.id,
                        elementType: 'media' as ElementType,
                        x: media.x || 0,
                        y: media.y || 0,
                        width: media.width || canvasWidth,
                        height: media.height || canvasHeight,
                        originalIndex: activeElementIndex,
                    };
                }
            }
        }
        // Future: handle text elements
        return null;
    }, [activeElement, activeElementIndex, mediaFiles, currentTime, canvasWidth, canvasHeight]);

    // Update Moveable rect when selection changes
    useEffect(() => {
        if (moveableRef.current) {
            moveableRef.current.updateRect();
        }
    }, [selectedElement, playerWidth, playerHeight, targetElement]);

    // Throttled update functions to prevent too many Redux updates
    const updateMediaPosition = useMemo(
        () =>
            throttle((id: string, x: number, y: number) => {
                const currentFiles = mediaFilesRef.current;
                dispatch(
                    setMediaFiles(
                        currentFiles.map((m) =>
                            m.id === id ? { ...m, x, y } : m
                        )
                    )
                );
            }, 50),
        [dispatch]
    );

    const updateMediaSize = useMemo(
        () =>
            throttle((id: string, x: number, y: number, width: number, height: number) => {
                const currentFiles = mediaFilesRef.current;
                dispatch(
                    setMediaFiles(
                        currentFiles.map((m) =>
                            m.id === id
                                ? {
                                      ...m,
                                      x,
                                      y,
                                      width,
                                      height,
                                      crop: { x: 0, y: 0, width, height },
                                  }
                                : m
                        )
                    )
                );
            }, 50),
        [dispatch]
    );

    // Handle drag events
    const handleDrag = useCallback(
        ({ target, left, top }: OnDrag) => {
            if (!selectedElement) return;

            // Convert screen position to canvas coordinates
            const canvasX = left / scaleFactor;
            const canvasY = top / scaleFactor;

            // Update visual position immediately
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;

            // Update Redux (throttled)
            if (selectedElement.elementType === 'media') {
                updateMediaPosition(selectedElement.id, canvasX, canvasY);
            }
            // Future: handle text elements
        },
        [selectedElement, scaleFactor, updateMediaPosition]
    );

    // Handle resize events
    const handleResize = useCallback(
        ({ target, width, height, drag }: OnResize) => {
            if (!selectedElement) return;

            // Convert screen dimensions to canvas coordinates
            const canvasW = width / scaleFactor;
            const canvasH = height / scaleFactor;
            const canvasX = drag.left / scaleFactor;
            const canvasY = drag.top / scaleFactor;

            // Update visual size immediately
            target.style.width = `${width}px`;
            target.style.height = `${height}px`;
            target.style.left = `${drag.left}px`;
            target.style.top = `${drag.top}px`;

            // Update Redux (throttled)
            if (selectedElement.elementType === 'media') {
                updateMediaSize(selectedElement.id, canvasX, canvasY, canvasW, canvasH);
            }
            // Future: handle text elements
        },
        [selectedElement, scaleFactor, updateMediaSize]
    );

    // Handle click on overlay to select element
    const handleOverlayClick = useCallback(
        (element: DraggableElement) => {
            if (element.elementType === 'media') {
                dispatch(setActiveElement('media'));
                dispatch(setActiveElementIndex(element.originalIndex));
            }
            // Future: handle text elements
        },
        [dispatch]
    );

    // Don't render if no selected element or player size is 0
    if (!selectedElement || playerWidth === 0 || playerHeight === 0) {
        // Still render clickable overlays for unselected elements
        return (
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 10 }}
            >
                {draggableElements
                    .filter((el) => el.isVisible)
                    .map((element) => (
                        <div
                            key={element.id}
                            className="absolute pointer-events-auto cursor-pointer hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2"
                            style={{
                                left: element.x * scaleFactor,
                                top: element.y * scaleFactor,
                                width: element.width * scaleFactor,
                                height: element.height * scaleFactor,
                            }}
                            onClick={() => handleOverlayClick(element)}
                        />
                    ))}
            </div>
        );
    }

    // Calculate screen position for the selected element
    const screenX = selectedElement.x * scaleFactor;
    const screenY = selectedElement.y * scaleFactor;
    const screenWidth = selectedElement.width * scaleFactor;
    const screenHeight = selectedElement.height * scaleFactor;

    return (
        <div
            className="absolute inset-0"
            style={{ zIndex: 50, pointerEvents: 'none' }}
        >
            {/* Clickable overlays for unselected elements */}
            {draggableElements
                .filter((el) => el.isVisible && el.id !== selectedElement.id)
                .map((element) => (
                    <div
                        key={element.id}
                        className="absolute cursor-pointer hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2"
                        style={{
                            left: element.x * scaleFactor,
                            top: element.y * scaleFactor,
                            width: element.width * scaleFactor,
                            height: element.height * scaleFactor,
                            pointerEvents: 'auto',
                        }}
                        onClick={() => handleOverlayClick(element)}
                    />
                ))}

            {/* Selected element with Moveable */}
            <div
                ref={(el) => setTargetElement(el)}
                className="absolute"
                style={{
                    left: screenX,
                    top: screenY,
                    width: screenWidth,
                    height: screenHeight,
                    outline: "2px solid #3b82f6",
                    outlineOffset: "2px",
                    cursor: "move",
                    pointerEvents: 'auto',
                }}
            />

            {targetElement && (
                <Moveable
                    ref={moveableRef}
                    target={targetElement}
                    container={null}
                    draggable={true}
                    resizable={true}
                    keepRatio={true}
                    throttleDrag={0}
                    throttleResize={0}
                    renderDirections={["nw", "ne", "sw", "se"]}
                    onDrag={handleDrag}
                    onResize={handleResize}
                    origin={false}
                    edge={false}
                    padding={{ left: 0, top: 0, right: 0, bottom: 0 }}
                    className="moveable-control-box"
                />
            )}
        </div>
    );
}
