"use client";

import { useEffect, useRef, useState } from "react";

interface WaveformProps {
    src: string;
    width: number;
    height: number;
    color?: string;
    volume?: number; // Volume 0-100, where 50 = 0dB
}

// Convert volume (0-100) to visual scale multiplier
// 50 = 0dB = 1.0x (normal), -60dB = 0.0x (silent), +12dB = 1.5x (louder visualization)
// For visualization, we use a more visual-friendly scale
function volumeToVisualScale(volume: number): number {
    if (volume <= 0) return 0.05; // Almost invisible at -60dB
    if (volume >= 100) return 1.5; // 50% larger at +12dB
    
    // Convert to dB first
    let db: number;
    if (volume <= 50) {
        db = (volume / 50) * 60 - 60; // 0-50 -> -60 to 0
    } else {
        db = ((volume - 50) / 50) * 12; // 50-100 -> 0 to +12
    }
    
    // For visualization, use a more visual-friendly mapping
    // -60dB to 0dB: map to 0.05 to 1.0 (visual scale)
    // 0dB to +12dB: map to 1.0 to 1.5 (visual scale)
    if (db <= 0) {
        // -60dB to 0dB: linear mapping from 0.05 to 1.0
        return 0.05 + ((db + 60) / 60) * 0.95;
    } else {
        // 0dB to +12dB: linear mapping from 1.0 to 1.5
        return 1.0 + (db / 12) * 0.5;
    }
}

export default function Waveform({ src, width, height, color = "#60a5fa", volume = 50 }: WaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [waveformData, setWaveformData] = useState<number[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!src || width <= 0 || height <= 0) {
            // Generate placeholder if no valid dimensions
            const numBars = Math.max(20, Math.floor(width / 2));
            const placeholderBars = Array.from({ length: numBars }, () => 
                Math.random() * 0.5 + 0.3
            );
            setWaveformData(placeholderBars);
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        const generateWaveform = async () => {
            try {
                setIsLoading(true);
                setHasError(false);
                
                // Create audio context
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;

                // Fetch audio data
                const response = await fetch(src);
                if (!response.ok) throw new Error('Failed to fetch audio');
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                if (cancelled) return;

                // Extract audio data (use first channel)
                const channelData = audioBuffer.getChannelData(0);
                if (channelData.length === 0) throw new Error('No audio data');

                // Calculate number of bars based on width (one bar per ~2 pixels)
                const numBars = Math.max(20, Math.floor(width / 2));
                const samplesPerBar = Math.floor(channelData.length / numBars);

                // Generate waveform data
                const bars: number[] = [];
                for (let i = 0; i < numBars; i++) {
                    const start = i * samplesPerBar;
                    const end = Math.min(start + samplesPerBar, channelData.length);
                    let sum = 0;
                    let max = 0;
                    let count = 0;

                    for (let j = start; j < end; j++) {
                        const abs = Math.abs(channelData[j]);
                        sum += abs * abs; // For RMS
                        max = Math.max(max, abs);
                        count++;
                    }

                    // Use RMS (root mean square) for better visualization
                    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
                    bars.push(Math.max(rms, max * 0.3)); // Mix RMS and peak
                }

                if (!cancelled) {
                    setWaveformData(bars);
                    setIsLoading(false);
                }
            } catch (error) {
                console.warn("Failed to generate waveform:", error);
                if (!cancelled) {
                    setHasError(true);
                    // Always show a placeholder waveform on error
                    const numBars = Math.max(20, Math.floor(width / 2));
                    const placeholderBars = Array.from({ length: numBars }, () => 
                        Math.random() * 0.5 + 0.3 // More visible placeholder
                    );
                    setWaveformData(placeholderBars);
                    setIsLoading(false);
                }
            }
        };

        generateWaveform();

        return () => {
            cancelled = true;
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, [src, width, height]);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (waveformData.length === 0) {
            // Draw a simple test waveform pattern if no data (so we can see it's rendering)
            const numBars = Math.max(20, Math.floor(width / 2));
            const barWidth = Math.max(1, width / numBars);
            const centerY = height / 2;
            
            for (let i = 0; i < numBars; i++) {
                // Create a visible test pattern
                const barHeight = (Math.sin(i * 0.3) * 0.5 + 0.5) * height * 0.7;
                const x = i * (width / numBars);
                const topY = centerY - barHeight / 2;
                
                ctx.fillStyle = color;
                ctx.fillRect(x, topY, Math.max(1, barWidth - 0.5), barHeight);
            }
            return;
        }

        // Draw waveform bars (CapCut style - centered vertical bars)
        const barWidth = Math.max(1, width / waveformData.length);
        const maxAmplitude = Math.max(...waveformData, 0.001); // Avoid division by zero
        const centerY = height / 2;
        
        // Calculate volume visual scale multiplier
        const visualScale = volumeToVisualScale(volume);

        waveformData.forEach((amplitude, index) => {
            // Calculate bar height (centered around middle)
            const normalizedAmplitude = amplitude / maxAmplitude;
            // Apply volume visual scale to the amplitude
            const scaledAmplitude = normalizedAmplitude * visualScale;
            // Clamp to 0-1 range
            const clampedAmplitude = Math.min(1.0, scaledAmplitude);
            
            const barHeight = Math.max(0.5, clampedAmplitude * height * 0.85); // Use 85% of height, min 0.5px
            const x = index * (width / waveformData.length);
            const halfHeight = barHeight / 2;
            
            // Draw bar from center, extending up and down (CapCut style)
            const topY = centerY - halfHeight;

            // Use solid color for better visibility (like CapCut)
            // Make color slightly transparent if volume is very low
            let fillColor = color;
            if (volume < 10) {
                // Convert hex to rgba for transparency
                if (color.startsWith('#')) {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    fillColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
                } else {
                    fillColor = color.replace(')', ', 0.3)').replace('rgb', 'rgba');
                }
            }
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, topY, Math.max(1, barWidth - 0.5), barHeight);
            
            // Add orange highlight on top for peaks (like CapCut's orange markers)
            // Adjust threshold based on volume - louder volumes show more orange
            const peakThreshold = volume > 50 ? 0.5 : 0.6;
            if (clampedAmplitude > peakThreshold && volume > 5) {
                ctx.fillStyle = "#ff6b35"; // Orange for peaks
                ctx.fillRect(x, topY, Math.max(1, barWidth - 0.5), Math.min(3, barHeight * 0.15));
            }
        });
    }, [waveformData, width, height, color, volume]);

    // Always render canvas, even if loading or no data
    return (
        <div 
            className="w-full h-full relative" 
            style={{ 
                minHeight: `${height}px`,
                width: '100%',
                height: '100%'
            }}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-10">
                    <div className="w-full h-1 bg-slate-600/50 rounded animate-pulse" />
                </div>
            )}
            <canvas
                ref={canvasRef}
                className="w-full h-full block"
                style={{ 
                    imageRendering: "auto",
                    display: "block",
                    width: '100%',
                    height: '100%',
                    minWidth: "100px",
                    minHeight: `${height}px`,
                    backgroundColor: 'transparent'
                }}
            />
        </div>
    );
}

