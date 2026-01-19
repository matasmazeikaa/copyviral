import { storeProject, useAppDispatch, useAppSelector } from "@/app/store";
import { SequenceItem } from "./sequence-item";
import { MediaFile, TextElement } from "@/app/types";
import { useCurrentFrame, useVideoConfig } from 'remotion';
import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { setCurrentTime, setMediaFiles } from "@/app/store/slices/projectSlice";

const fps = 30;

const Composition = () => {
    const projectState = useAppSelector((state) => state.projectState);
    const { mediaFiles, textElements, isPlaying } = projectState;
    const frame = useCurrentFrame();
    const dispatch = useAppDispatch();

    const THRESHOLD = 0.1; // Minimum change to trigger dispatch (in seconds)
    const previousTime = useRef(0); // Store previous time to track changes

    useEffect(() => {
        const currentTimeInSeconds = frame / fps;
        const timeDiff = Math.abs(currentTimeInSeconds - previousTime.current);
        
        // Only update Redux when playing and time has changed significantly
        // This prevents infinite loops when the player is paused and seeking
        if (isPlaying && timeDiff > THRESHOLD) {
            previousTime.current = currentTimeInSeconds;
            dispatch(setCurrentTime(currentTimeInSeconds));
        } else if (!isPlaying) {
            // Update previousTime even when not playing to track the current frame
            previousTime.current = currentTimeInSeconds;
        }
    }, [frame, dispatch, isPlaying]);

    console.log(mediaFiles, 'media files')
    return (
        <>
            {mediaFiles
                .map((item: MediaFile) => {
                    if (!item) return null;
                    const trackItem = {
                        ...item,
                    } as MediaFile;
                    return (
                        <React.Fragment key={item.id}>
                            {SequenceItem[trackItem.type](trackItem, {
                                fps
                            })}
                        </React.Fragment>
                    );
                })}
            {textElements
                .slice()
                .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                .map((item: TextElement) => {
                    if (!item) return null;
                    const trackItem = {
                        ...item,
                    } as TextElement;
                    return (
                        <React.Fragment key={item.id}>
                            {SequenceItem["text"](trackItem, {
                                fps
                            })}
                        </React.Fragment>
                    );
                })}
        </>
    );
};

export default Composition;
