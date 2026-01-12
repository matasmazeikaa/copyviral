import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence } from "remotion";
import { MediaFile } from "@/app/types";

const REMOTION_SAFE_FRAME = 0;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

interface SequenceItemOptions {
    handleTextChange?: (id: string, text: string) => void;
    fps: number;
    editableTextId?: string | null;
    currentTime?: number;
}

const calculateFrames = (
    display: { from: number; to: number },
    fps: number
) => {
    const from = display.from * fps;
    const to = display.to * fps;
    const durationInFrames = Math.max(1, to - from);
    return { from, durationInFrames };
};

interface VideoSequenceItemProps {
    item: MediaFile;
    options: SequenceItemOptions;
}

export const VideoSequenceItem: React.FC<VideoSequenceItemProps> = ({ item, options }) => {
    const { fps } = options;

    const playbackRate = item.playbackSpeed || 1;
    const { from, durationInFrames } = calculateFrames(
        {
            from: item.positionStart,
            to: item.positionEnd
        },
        fps
    );

    // TODO: Add crop
    // const crop = item.crop || {
    //     x: 0,
    //     y: 0,
    //     width: item.width,
    //     height: item.height
    // };

    const trim = {
        from: (item.startTime) / playbackRate,
        to: (item.endTime) / playbackRate
    };

    // Render placeholder if this is a placeholder
    if (item.isPlaceholder) {
        return (
            <Sequence
                key={item.id}
                from={from}
                durationInFrames={durationInFrames + REMOTION_SAFE_FRAME}
                style={{ pointerEvents: "none" }}
            >
                <AbsoluteFill
                    data-track-item="transition-element"
                    className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type}`}
                    style={{
                        pointerEvents: "auto",
                        top: item.y,
                        left: item.x,
                        width: item.width || "100%",
                        height: item.height || "auto",
                        transform: "none",
                        zIndex: item.zIndex,
                        opacity: item?.opacity !== undefined ? item.opacity / 100 : 1,
                        borderRadius: `10px`,
                        overflow: "hidden",
                        border: "2px dashed #ff6b35",
                        backgroundColor: "#3A2A1F",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ff6b35",
                        fontSize: "24px",
                        fontWeight: "bold",
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "200px", marginBottom: "10px" }}>📹</div>
                        <div style={{ fontSize: "90px" }} className="font-2xl">Placeholder</div>
                    </div>
                </AbsoluteFill>
            </Sequence>
        );
    }

    // Calculate video dimensions and position
    const videoWidth = item.width || CANVAS_WIDTH;
    const videoHeight = item.height || CANVAS_HEIGHT;
    const videoX = item.x || 0;
    const videoY = item.y || 0;

    return (
        <Sequence
            key={item.id}
            from={from}
            durationInFrames={durationInFrames + REMOTION_SAFE_FRAME}
            style={{ pointerEvents: "none" }}
        >
            {/* Full canvas container with black background for letterboxing/pillarboxing */}
            <AbsoluteFill
                style={{
                    backgroundColor: "#000000", // Black bars
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    pointerEvents: "none",
                }}
            >
                {/* Video container positioned and sized according to fit */}
                <AbsoluteFill
                    data-track-item="transition-element"
                    className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-${item.type}`}
                    style={{
                        pointerEvents: "auto",
                        top: videoY,
                        left: videoX,
                        width: videoWidth,
                        height: videoHeight,
                        transform: "none",
                        zIndex: item.zIndex,
                        opacity:
                            item?.opacity !== undefined
                                ? item.opacity / 100
                                : 1,
                        borderRadius: `10px`,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            position: "relative",
                            overflow: "hidden",
                            pointerEvents: "none",
                        }}
                    >
                        {item.src ? (
                            <OffthreadVideo
                                startFrom={(trim.from) * fps}
                                endAt={(trim.to) * fps + REMOTION_SAFE_FRAME}
                                playbackRate={playbackRate}
                                src={item.src}
                                volume={item.volume / 100 || 100}
                                style={{
                                    pointerEvents: "none",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    // "cover" for fill mode - fills entire container, may crop
                                    // "contain" for fit/16:9/1:1 - shows full video within container
                                    objectFit: item.aspectRatioFit === 'cover' ? "cover" : "contain",
                                    position: "absolute"
                                }}
                                onError={(e) => {
                                    console.warn(`Failed to load video for ${item.fileName || item.id}:`, e);
                                }}
                            />
                        ) : (
                            <div style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#1a1a1a",
                                color: "#666",
                                fontSize: "14px"
                            }}>
                                No video source
                            </div>
                        )}
                    </div>
                </AbsoluteFill>
            </AbsoluteFill>
        </Sequence>
    );
};
