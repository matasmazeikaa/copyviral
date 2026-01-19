import { MediaType } from "../types";
export const categorizeFile = (mimeType: string): MediaType => {

    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    return 'unknown';
};

export const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Volume conversion utilities
// Internal volume: 0-100 (where 50 = 0dB)
// dB range: -60dB to +12dB

/**
 * Convert internal volume (0-100) to dB (-60 to +12)
 * 50 = 0dB (unity gain)
 */
export function volumeToDB(volume: number): number {
    if (volume <= 0) return -60;
    if (volume >= 100) return 12;
    
    if (volume <= 50) {
        return (volume / 50) * 60 - 60; // 0-50 -> -60 to 0
    } else {
        return ((volume - 50) / 50) * 12; // 50-100 -> 0 to +12
    }
}

/**
 * Convert dB (-60 to +12) to internal volume (0-100)
 */
export function dbToVolume(db: number): number {
    if (db <= -60) return 0;
    if (db >= 12) return 100;
    
    if (db <= 0) {
        return ((db + 60) / 60) * 50; // -60 to 0 -> 0 to 50
    } else {
        return 50 + (db / 12) * 50; // 0 to +12 -> 50 to 100
    }
}

/**
 * Convert internal volume (0-100) to linear amplitude for audio playback
 * Uses proper dB to linear conversion: linear = 10^(dB/20)
 * - volume 0 (= -60dB) → ~0.001 (nearly silent)
 * - volume 50 (= 0dB) → 1.0 (unity gain)
 * - volume 100 (= +12dB) → ~3.98 (loud)
 */
export function volumeToLinear(volume: number): number {
    if (volume === undefined || volume === null) return 1; // Default to unity gain
    
    const db = volumeToDB(volume);
    // Convert dB to linear: 10^(dB/20)
    return Math.pow(10, db / 20);
}