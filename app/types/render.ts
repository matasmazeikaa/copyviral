import { MediaFile, TextElement, ExportConfig } from './index';

export interface RenderJobInput {
    mediaFiles: MediaFile[];
    textElements: TextElement[]; // May be empty array or undefined from JSONB - Lambda handles this
    exportSettings: ExportConfig;
    totalDuration: number;
    resolution: { width: number; height: number };
    fps: number;
    isPremium: boolean;
    projectName?: string;
}

export interface RenderJob {
    id: string;
    userId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    inputData: RenderJobInput;
    downloadUrl?: string;
    fileSizeBytes?: number;
    errorMessage?: string;
    retryCount: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    batchId?: string;
    batchIndex?: number;
}

export interface StartRenderRequest {
    mediaFiles: MediaFile[];
    textElements: TextElement[];
    exportSettings: ExportConfig;
    totalDuration: number;
    resolution: { width: number; height: number };
    fps: number;
    projectName?: string;
    // For batch exports
    batchId?: string;
    batchIndex?: number;
}

export interface StartRenderResponse {
    jobId: string;
    status: 'queued';
}

export interface RenderJobStatusResponse {
    id: string;
    userId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    downloadUrl?: string;
    thumbnailUrl?: string;
    fileSizeBytes?: number;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    batchId?: string;
    batchIndex?: number;
}
