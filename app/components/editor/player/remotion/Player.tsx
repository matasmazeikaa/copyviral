import { Player, PlayerRef } from "@remotion/player";
import Composition from "./sequence/composition";
import { useAppSelector } from "@/app/store";
import { useRef, useEffect, useState } from "react";
import { setIsPlaying } from "@/app/store/slices/projectSlice";
import { useDispatch } from "react-redux";

const fps = 30;

export const PreviewPlayer = () => {
    const projectState = useAppSelector((state) => state.projectState);
    const { duration, currentTime, isPlaying, isMuted } = projectState;
    const playerRef = useRef<PlayerRef>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dispatch = useDispatch();
    const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });

    // update frame when current time with marker
    const previousSeekTime = useRef<number>(currentTime);
    const isSeekingRef = useRef<boolean>(false);
    
    // Calculate player size to fit within container while maintaining 9:16 aspect ratio
    useEffect(() => {
        const calculateSize = () => {
            if (!containerRef.current) return;
            
            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;
            
            const aspectRatio = 9 / 16; // width / height for vertical video
            const maxWidth = 350;
            
            // Calculate width and height that fit within container
            let width = Math.min(maxWidth, containerWidth);
            let height = width / aspectRatio;
            
            // If height exceeds container, scale down based on height
            if (height > containerHeight) {
                height = containerHeight;
                width = height * aspectRatio;
            }
            
            setPlayerSize({ width, height });
        };
        
        calculateSize();
        
        // Recalculate on resize
        const resizeObserver = new ResizeObserver(calculateSize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        
        return () => resizeObserver.disconnect();
    }, []);
    
    useEffect(() => {
        // Only seek if the time changed externally (not from the player itself)
        // and the player is not currently playing
        if (playerRef.current && !isPlaying && previousSeekTime.current !== currentTime && !isSeekingRef.current) {
            const currentFrame = playerRef.current.getCurrentFrame();
            const targetFrame = Math.round(currentTime * fps);
            // Only seek if there's a meaningful difference to avoid unnecessary updates
            if (Math.abs(currentFrame - targetFrame) > 1) {
                isSeekingRef.current = true;
                playerRef.current.pause();
                playerRef.current.seekTo(targetFrame);
                previousSeekTime.current = currentTime;
                // Reset the seeking flag after a short delay
                setTimeout(() => {
                    isSeekingRef.current = false;
                }, 50);
            } else {
                previousSeekTime.current = currentTime;
            }
        }
    }, [currentTime, isPlaying]);

    useEffect(() => {
        playerRef?.current?.addEventListener("play", () => {
            dispatch(setIsPlaying(true));
        });
        playerRef?.current?.addEventListener("pause", () => {
            dispatch(setIsPlaying(false));
        });
        return () => {
            playerRef?.current?.removeEventListener("play", () => {
                dispatch(setIsPlaying(true));
            });
            playerRef?.current?.removeEventListener("pause", () => {
                dispatch(setIsPlaying(false));
            });
        };
    }, [playerRef]);

    // to control with keyboard
    useEffect(() => {
        if (!playerRef.current) return;
        if (isPlaying) {
            playerRef.current.play();
        } else {
            playerRef.current.pause();
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!playerRef.current) return;
        if (isMuted) {
            playerRef.current.mute();
        } else {
            playerRef.current.unmute();
        }
    }, [isMuted]);

    return (
        <div 
            ref={containerRef}
            className="flex items-center justify-center w-full h-full p-2 sm:p-4 overflow-hidden"
        >
            {/* Player sized to fit within container while maintaining 9:16 aspect ratio */}
            {playerSize.width > 0 && playerSize.height > 0 && (
                <div 
                    style={{ 
                        width: playerSize.width,
                        height: playerSize.height
                    }}
                >
                    <Player
                        ref={playerRef}
                        component={Composition}
                        inputProps={{}}
                        durationInFrames={Math.floor(duration * fps) + 1}
                        compositionWidth={1080}
                        compositionHeight={1920}
                        fps={fps}
                        style={{ 
                            width: "100%", 
                            height: "100%"
                        }}
                        controls
                        clickToPlay={false}
                    />
                </div>
            )}
        </div>
    )
};