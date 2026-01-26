'use client';

import * as tus from 'tus-js-client';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB - required by Supabase
const STORAGE_BUCKET = 'media-library';

export interface ResumableUploadOptions {
    file: File;
    accessToken: string; // User's session access token
    objectPath: string;
    onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
    onError?: (error: Error) => void;
    onSuccess?: () => void;
}

/**
 * Upload a file using TUS resumable upload protocol
 * Uses session access token for authentication (required by Supabase TUS endpoint)
 */
export function uploadWithTus(options: ResumableUploadOptions): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const projectId = supabaseUrl?.match(/https:\/\/([^.]+)/)?.[1];
    
    if (!projectId) {
        return Promise.reject(new Error('Could not determine Supabase project ID'));
    }

    return new Promise((resolve, reject) => {
        const upload = new tus.Upload(options.file, {
            // Use direct storage hostname for better performance with large files
            endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
                // TUS endpoint requires Bearer token authentication
                authorization: `Bearer ${options.accessToken}`,
                'x-upsert': 'false',
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
                bucketName: STORAGE_BUCKET,
                objectName: options.objectPath,
                contentType: options.file.type,
                cacheControl: '3600',
            },
            chunkSize: CHUNK_SIZE,
            onError: (error) => {
                console.error('TUS upload error:', error);
                options.onError?.(error);
                reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                options.onProgress?.(bytesUploaded, bytesTotal);
            },
            onSuccess: () => {
                options.onSuccess?.();
                resolve();
            },
        });

        // Check for previous uploads to resume
        upload.findPreviousUploads().then((previousUploads) => {
            if (previousUploads.length > 0) {
                // Resume from the most recent previous upload
                upload.resumeFromPreviousUpload(previousUploads[0]);
            }
            // Start the upload
            upload.start();
        }).catch((err) => {
            // If finding previous uploads fails, just start fresh
            console.warn('Could not check for previous uploads:', err);
            upload.start();
        });
    });
}

/**
 * Request a signed upload URL from the backend
 */
export async function requestSignedUploadUrl(
    fileName: string,
    fileSize: number,
    mimeType: string,
    folder?: string | null
): Promise<{
    token: string;
    path: string;
    fileId: string;
    signedUrl: string;
}> {
    const response = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName,
            fileSize,
            mimeType,
            folder: folder || undefined,
        }),
    });

    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get upload URL');
    }

    return response.json();
}

/**
 * Process items in batches with a specified batch size
 * Waits for each batch to complete before starting the next
 */
export async function uploadInBatches<T, R>(
    items: T[],
    uploadFn: (item: T) => Promise<R>,
    batchSize: number = 10
): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(uploadFn));
        results.push(...batchResults);
    }
    
    return results;
}
