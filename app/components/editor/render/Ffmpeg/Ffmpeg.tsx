'use client'

import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import FfmpegRender from "./FfmpegRender";
import RenderOptions from "./RenderOptions";
export default function Ffmpeg() {
    const [loadFfmpeg, setLoadedFfmpeg] = useState(false);
    const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
    const [logMessages, setLogMessages] = useState<string>("");
    const logBufferRef = useRef<string[]>([]);

    const loadFFmpegFunction = async () => {
        setLoadedFfmpeg(false);
        logBufferRef.current = []; // Reset logs on reload
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on("log", ({ message }) => {
            // Keep last 50 log messages for error debugging
            logBufferRef.current = [...logBufferRef.current.slice(-49), message];
            setLogMessages(logBufferRef.current.join('\n'));
        });

        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            // TODO: For Multi Threading as mentioned in the ffmpeg docs but it is not fetched for some reason
            // workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });

        setLoadedFfmpeg(true);
    };

    useEffect(() => {
        loadFFmpegFunction();
    }, []);

    return (
        <div className="flex flex-col justify-center items-center py-2 w-full gap-4">
            <RenderOptions />
            <FfmpegRender loadFunction={loadFFmpegFunction} loadFfmpeg={loadFfmpeg} logMessages={logMessages} ffmpeg={ffmpegRef.current} />
        </div>
    );
}
