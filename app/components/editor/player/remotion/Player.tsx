import { Player, PlayerRef } from "@remotion/player";
import Composition from "./sequence/composition";
import { useAppSelector } from "@/app/store";
import { useRef, useEffect } from "react";
import { setIsPlaying } from "@/app/store/slices/projectSlice";
import { useDispatch } from "react-redux";

const fps = 30;

export const PreviewPlayer = () => {
    const projectState = useAppSelector((state) => state.projectState);
    const { duration, currentTime, isPlaying, isMuted } = projectState;
    const playerRef = useRef<PlayerRef>(null);
    const dispatch = useDispatch();

    // update frame when current time with marker
    const previousSeekTime = useRef<number>(currentTime);
    const isSeekingRef = useRef<boolean>(false);
    
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
        <div className="flex items-center justify-center w-full h-full p-4 max-w-[350px]">
            <div className="w-full max-w-md" style={{ aspectRatio: '9/16' }}>
                <Player
                    ref={playerRef}
                    component={Composition}
                    inputProps={{}}
                    durationInFrames={Math.floor(duration * fps) + 1}
                    compositionWidth={1080}
                    compositionHeight={1920}
                    fps={fps}
                    style={{ width: "100%", height: "100%" }}
                    controls
                    clickToPlay={false}
                />
            </div>
        </div>
    )
};