'use client';

import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, Img, Audio, useVideoConfig } from 'remotion';
import { TemplateSlot, TemplateTextElement, TemplateImage } from '@/app/types';

interface SelectedVideoData {
    id: string;
    src: string;
    type: 'video' | 'image' | 'audio' | 'unknown';
}

// Static image data with loaded src
interface LoadedTemplateImage extends TemplateImage {
    src: string;
}

export interface TemplatePreviewCompositionProps {
    slots?: TemplateSlot[];
    slotAssignments?: Record<string, SelectedVideoData>;
    textElements?: TemplateTextElement[];
    editedTexts?: Record<string, string>;
    images?: LoadedTemplateImage[];  // Static images saved with template
    audioSrc?: string;
    resolution?: { width: number; height: number };
}

export const TemplatePreviewComposition: React.FC<TemplatePreviewCompositionProps> = ({
    slots = [],
    slotAssignments = {},
    textElements = [],
    editedTexts = {},
    images = [],
    audioSrc,
}) => {
    const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {/* Render slots with assigned videos - using slot positioning from template */}
            {slots.map((slot) => {
                const assigned = slotAssignments[slot.id];
                if (!assigned) return null;

                const startFrame = Math.floor(slot.positionStart * fps);
                const durationFrames = Math.max(1, Math.floor((slot.positionEnd - slot.positionStart) * fps));

                // Use slot positioning if available, otherwise fill canvas
                const videoX = slot.x ?? 0;
                const videoY = slot.y ?? 0;
                const videoWidth = slot.width ?? canvasWidth;
                const videoHeight = slot.height ?? canvasHeight;

                return (
                    <Sequence
                        key={slot.id}
                        from={startFrame}
                        durationInFrames={durationFrames}
                        style={{ pointerEvents: 'none' }}
                    >
                        <AbsoluteFill
                            style={{
                                top: videoY,
                                left: videoX,
                                width: videoWidth,
                                height: videoHeight,
                                overflow: 'hidden',
                                borderRadius: 10,
                            }}
                        >
                            <OffthreadVideo
                                src={assigned.src}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                                muted
                            />
                        </AbsoluteFill>
                    </Sequence>
                );
            })}
            
            {/* Render static images saved with template (not changeable) */}
            {images.map((image) => {
                const startFrame = Math.floor(image.positionStart * fps);
                const durationFrames = Math.max(1, Math.floor((image.positionEnd - image.positionStart) * fps));

                const imgX = image.x ?? 0;
                const imgY = image.y ?? 0;
                const imgWidth = image.width ?? canvasWidth;
                const imgHeight = image.height ?? canvasHeight;

                return (
                    <Sequence
                        key={image.id}
                        from={startFrame}
                        durationInFrames={durationFrames}
                        style={{ pointerEvents: 'none', zIndex: image.zIndex ?? 0 }}
                    >
                        <AbsoluteFill
                            style={{
                                top: imgY,
                                left: imgX,
                                width: imgWidth,
                                height: imgHeight,
                                overflow: 'hidden',
                            }}
                        >
                            <Img
                                src={image.src}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                            />
                        </AbsoluteFill>
                    </Sequence>
                );
            })}

            {/* Render text elements - matching the original text-sequence-item.tsx */}
            {textElements.map((textEl) => {
                const startFrame = Math.floor(textEl.positionStart * fps);
                const durationFrames = Math.max(1, Math.floor((textEl.positionEnd - textEl.positionStart) * fps));
                const text = editedTexts[textEl.id] || textEl.text;
                const align = textEl.align || 'center';
                
                // Calculate transform based on alignment (matching text-sequence-item.tsx)
                const transformX = align === 'center' 
                    ? 'translateX(-50%)' 
                    : align === 'right' 
                    ? 'translateX(-100%)' 
                    : 'none';

                // Split text by newlines
                const textLines = text.split('\n');

                return (
                    <Sequence
                        key={textEl.id}
                        from={startFrame}
                        durationInFrames={durationFrames}
                        style={{
                            position: 'absolute',
                            width: 'max-content',
                            height: 'fit-content',
                            fontSize: textEl.fontSize || 48,
                            top: textEl.y,
                            left: textEl.x,
                            textAlign: align,
                            color: textEl.color || '#ffffff',
                            fontFamily: textEl.font || 'Arial',
                            transform: transformX,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                            }}
                        >
                            {textLines.map((line, index) => (
                                <div
                                    key={index}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        width: 'max-content',
                                    }}
                                >
                                    {line}
                                </div>
                            ))}
                        </div>
                    </Sequence>
                );
            })}

            {/* Audio track */}
            {audioSrc && (
                <Audio src={audioSrc} volume={1} />
            )}
        </AbsoluteFill>
    );
};
