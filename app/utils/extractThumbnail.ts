/**
 * Extract a thumbnail from a video file at a specific time
 * @param file - The video file to extract thumbnail from
 * @param fileId - The ID to use for the thumbnail filename
 * @param seekTime - Time in seconds to capture the thumbnail (default: 1s)
 * @returns A File object containing the thumbnail image
 */
export const extractThumbnail = (
    file: File, 
    fileId: string,
    seekTime: number = 1
): Promise<File> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);
        
        let resolved = false;
        
        const cleanup = () => {
            URL.revokeObjectURL(objectUrl);
            video.src = "";
            video.load();
        };

        const handleError = (error: string) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(error);
        };
        
        const captureFrame = () => {
            if (resolved) return;
            
            try {
                const canvas = document.createElement("canvas");
                // Use reasonable thumbnail dimensions (max 480p)
                const maxWidth = 480;
                const maxHeight = 270;
                let width = video.videoWidth;
                let height = video.videoHeight;
                
                // Check if video dimensions are valid
                if (width === 0 || height === 0) {
                    handleError("Video dimensions not available");
                    return;
                }
                
                // Scale down if needed while maintaining aspect ratio
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                canvas.width = Math.floor(width);
                canvas.height = Math.floor(height);

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    handleError("Could not get canvas context");
                    return;
                }

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    
                    if (blob) {
                        const thumbnailFile = new File(
                            [blob],
                            `${fileId}_thumb.jpg`,
                            { type: "image/jpeg" }
                        );
                        resolve(thumbnailFile);
                    } else {
                        reject("Could not create thumbnail blob");
                    }
                }, "image/jpeg", 0.8);
            } catch (error) {
                handleError(`Error creating thumbnail: ${error}`);
            }
        };

        // Set up video element
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto"; // Load full video data for seeking
        
        video.addEventListener("loadeddata", () => {
            // Video has enough data to play - now we can seek
            const targetTime = Math.min(seekTime, Math.max(0, video.duration - 0.1));
            video.currentTime = targetTime;
        });

        video.addEventListener("seeked", () => {
            // Small delay to ensure frame is ready
            setTimeout(captureFrame, 100);
        });

        video.addEventListener("error", () => {
            const errorMessage = video.error?.message || "Error loading video";
            handleError(errorMessage);
        });
        
        // Start loading
        video.src = objectUrl;
        
        // Timeout to prevent hanging
        setTimeout(() => {
            if (!resolved) {
                handleError("Thumbnail extraction timed out");
            }
        }, 30000);
    });
};
