import { ExportConfig } from "@/app/types";

// Function to get FFmpeg parameters based on settings
export const extractConfigs = (config: ExportConfig) => {
    // Resolution settings (portrait/vertical format for social media)
    let scale = "";
    let width = 1080;
    let height = 1920;
    switch (config.resolution) {
        case "480p":
            width = 480;
            height = 854;
            scale = `scale=${width}:${height}`;
            break;
        case "720p":
            width = 720;
            height = 1280;
            scale = `scale=${width}:${height}`;
            break;
        case "1080p":
            width = 1080;
            height = 1920;
            scale = `scale=${width}:${height}`;
            break;
        case "2K":
            width = 1440;
            height = 2560;
            scale = `scale=${width}:${height}`;
            break;
        case "4K":
            width = 2160;
            height = 3840;
            scale = `scale=${width}:${height}`;
            break;
        default:
            width = 1080;
            height = 1920;
            scale = `scale=${width}:${height}`;
    }

    // Quality settings
    let crf;
    let videoBitrate;
    let audioBitrate;
    switch (config.quality) {
        case "low":
            crf = 28;
            videoBitrate = "2M";
            audioBitrate = "128k";
            break;
        case "medium":
            crf = 23;
            videoBitrate = "4M";
            audioBitrate = "192k";
            break;
        case "high":
            crf = 18;
            videoBitrate = "8M";
            audioBitrate = "256k";
            break;
        case "ultra":
            crf = 14;
            videoBitrate = "16M";
            audioBitrate = "320k";
            break;
        default:
            crf = 23;
            videoBitrate = "4M";
            audioBitrate = "192k";
    }

    // Encoding speed
    let preset;
    switch (config.speed) {
        case "fastest":
            preset = "ultrafast";
            break;
        case "fast":
            preset = "veryfast";
            break;
        case "balanced":
            preset = "medium";
            break;
        case "slow":
            preset = "slow";
            break;
        case "slowest":
            preset = "veryslow";
            break;
        default:
            preset = "medium";
    }

    return {
        scale,
        width,
        height,
        crf,
        preset,
        videoBitrate,
        audioBitrate
    };
};