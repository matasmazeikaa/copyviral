import { useEffect, useState } from 'react';
import { FFmpeg } from "@ffmpeg/ffmpeg";

type Props = {
    ffmpeg: FFmpeg;
};

export default function FfmpegProgressBar({ ffmpeg }: Props) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const handleProgress = ({ progress }: { progress: number }) => {
            const clampedProgress = Math.max(0, Math.min(progress, 1));
            setProgress(clampedProgress);
        };

        ffmpeg.on('progress', handleProgress);

        return () => {
            ffmpeg.off('progress', handleProgress);
        };
    }, [ffmpeg]);

    const percentage = (progress * 100).toFixed(1);

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Progress</span>
                <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{percentage}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 transition-all duration-300 ease-out shadow-lg shadow-purple-500/30 animate-gradient-x"
                    style={{ 
                        width: `${percentage}%`,
                        backgroundSize: '200% 100%',
                    }}
                />
            </div>
        </div>
    );
}
