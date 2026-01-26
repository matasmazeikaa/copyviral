'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { StartRenderRequest, RenderJobStatusResponse } from '@/app/types/render';
import { toast } from 'react-hot-toast';

interface RenderJobState {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    downloadUrl?: string;
    thumbnailUrl?: string;
    errorMessage?: string;
    batchIndex?: number;
}

interface UseCloudRenderOptions {
    onComplete?: (job: RenderJobState) => void;
    onError?: (jobId: string, error: string) => void;
    onAllComplete?: (jobs: RenderJobState[]) => void;
    pollInterval?: number;
    autoDownload?: boolean;
}

interface UseCloudRenderReturn {
    startRender: (request: StartRenderRequest) => Promise<string | null>;
    startBatchRender: (requests: StartRenderRequest[]) => Promise<string[]>;
    jobs: Map<string, RenderJobState>;
    isSubmitting: boolean;
    activeJobs: RenderJobState[];
    completedJobs: RenderJobState[];
    failedJobs: RenderJobState[];
    overallProgress: number;
    cancelPolling: () => void;
}

/**
 * Hook for managing cloud-based video rendering via AWS Lambda
 */
export function useCloudRender(options: UseCloudRenderOptions = {}): UseCloudRenderReturn {
    const { 
        onComplete, 
        onError, 
        onAllComplete,
        pollInterval = 2000,
        autoDownload = false,
    } = options;
    
    const [jobs, setJobs] = useState<Map<string, RenderJobState>>(new Map());
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Refs to avoid dependency issues in callbacks
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const downloadedJobsRef = useRef<Set<string>>(new Set());
    const batchJobIdsRef = useRef<Set<string>>(new Set());
    const activeJobIdsRef = useRef<Set<string>>(new Set());
    const isPollingRef = useRef(false);
    
    // Store callbacks in refs
    const onCompleteRef = useRef(onComplete);
    const onErrorRef = useRef(onError);
    const onAllCompleteRef = useRef(onAllComplete);
    const autoDownloadRef = useRef(autoDownload);
    const pollIntervalValueRef = useRef(pollInterval);
    
    useEffect(() => {
        onCompleteRef.current = onComplete;
        onErrorRef.current = onError;
        onAllCompleteRef.current = onAllComplete;
        autoDownloadRef.current = autoDownload;
        pollIntervalValueRef.current = pollInterval;
    }, [onComplete, onError, onAllComplete, autoDownload, pollInterval]);
    
    // Stop polling - defined first as it has no deps
    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        isPollingRef.current = false;
    }, []);
    
    // Check if all batch jobs are complete
    const checkBatchCompletion = useCallback(() => {
        setJobs(currentJobs => {
            const batchJobs = Array.from(currentJobs.values()).filter(j => batchJobIdsRef.current.has(j.id));
            if (batchJobs.length === 0) return currentJobs;
            
            const allDone = batchJobs.every(j => j.status === 'completed' || j.status === 'failed');
            if (allDone) {
                const completedBatchJobs = batchJobs.filter(j => j.status === 'completed');
                if (completedBatchJobs.length > 0) {
                    // Use setTimeout to avoid calling during render
                    setTimeout(() => onAllCompleteRef.current?.(completedBatchJobs), 0);
                }
                // Clear batch tracking
                batchJobIdsRef.current.clear();
            }
            return currentJobs;
        });
    }, []);
    
    // Poll a single job - stable function that uses refs
    const pollJobStatus = useCallback(async (jobId: string) => {
        try {
            const response = await fetch(`/api/render/${jobId}`);
            if (!response.ok) return;
            
            const data: RenderJobStatusResponse = await response.json();
            
            setJobs(prev => {
                const next = new Map(prev);
                const existing = prev.get(jobId);
                next.set(jobId, {
                    id: data.id,
                    status: data.status,
                    progress: data.progress,
                    downloadUrl: data.downloadUrl,
                    thumbnailUrl: data.thumbnailUrl,
                    errorMessage: data.errorMessage,
                    batchIndex: existing?.batchIndex ?? data.batchIndex,
                });
                return next;
            });
            
            // Handle completion - remove from active jobs
            if (data.status === 'completed' || data.status === 'failed') {
                activeJobIdsRef.current.delete(jobId);
                
                if (data.status === 'completed') {
                    const jobState: RenderJobState = {
                        id: data.id,
                        status: 'completed',
                        progress: 100,
                        downloadUrl: data.downloadUrl,
                        thumbnailUrl: data.thumbnailUrl,
                        batchIndex: data.batchIndex,
                    };
                    
                    onCompleteRef.current?.(jobState);
                    
                    // Auto-download if enabled
                    if (autoDownloadRef.current && data.downloadUrl && !downloadedJobsRef.current.has(jobId)) {
                        downloadedJobsRef.current.add(jobId);
                        triggerDownload(data.downloadUrl, `render_${(data.batchIndex ?? 0) + 1}.mp4`);
                    }
                } else {
                    onErrorRef.current?.(jobId, data.errorMessage || 'Render failed');
                }
                
                // Check if all jobs are done
                if (activeJobIdsRef.current.size === 0) {
                    stopPolling();
                    checkBatchCompletion();
                }
            }
        } catch (error) {
            console.error('Failed to poll job status:', error);
        }
    }, [stopPolling, checkBatchCompletion]);
    
    // Start polling using the ref for poll function
    const startPolling = useCallback(() => {
        if (isPollingRef.current) return;
        if (activeJobIdsRef.current.size === 0) return;
        
        isPollingRef.current = true;
        
        // Poll immediately
        const jobIds = Array.from(activeJobIdsRef.current);
        jobIds.forEach(jobId => pollJobStatus(jobId));
        
        // Then set up interval
        pollIntervalRef.current = setInterval(() => {
            const currentJobIds = Array.from(activeJobIdsRef.current);
            currentJobIds.forEach(jobId => pollJobStatus(jobId));
        }, pollIntervalValueRef.current);
    }, [pollJobStatus]);
    
    // Start a single render job
    const startRender = useCallback(async (request: StartRenderRequest): Promise<string | null> => {
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/render/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start render');
            }
            
            const { jobId } = await response.json();
            
            // Track as active job
            activeJobIdsRef.current.add(jobId);
            
            // Add to tracking
            setJobs(prev => {
                const next = new Map(prev);
                next.set(jobId, {
                    id: jobId,
                    status: 'queued',
                    progress: 0,
                    batchIndex: request.batchIndex,
                });
                return next;
            });
            
            // Start polling if not already running
            startPolling();
            
            return jobId;
        } catch (error: any) {
            console.error('Failed to start render:', error);
            toast.error(error.message || 'Failed to start render');
            onErrorRef.current?.('', error.message);
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [startPolling]);
    
    // Start multiple render jobs (batch)
    const startBatchRender = useCallback(async (requests: StartRenderRequest[]): Promise<string[]> => {
        setIsSubmitting(true);
        const jobIds: string[] = [];
        const batchId = crypto.randomUUID();
        
        try {
            // Submit all jobs in parallel
            const results = await Promise.allSettled(
                requests.map((request, index) => 
                    fetch('/api/render/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...request,
                            batchId,
                            batchIndex: index,
                        }),
                    }).then(async res => {
                        if (!res.ok) {
                            const errorData = await res.json();
                            throw new Error(errorData.error || 'Failed to start render');
                        }
                        return res.json();
                    })
                )
            );
            
            // Process results
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const { jobId } = result.value;
                    jobIds.push(jobId);
                    batchJobIdsRef.current.add(jobId);
                    activeJobIdsRef.current.add(jobId);
                    
                    setJobs(prev => {
                        const next = new Map(prev);
                        next.set(jobId, {
                            id: jobId,
                            status: 'queued',
                            progress: 0,
                            batchIndex: index,
                        });
                        return next;
                    });
                } else {
                    console.error(`Batch job ${index} failed to start:`, result.reason);
                }
            });
            
            if (jobIds.length === 0) {
                throw new Error('All batch jobs failed to start');
            }
            
            // Start polling if not already running
            startPolling();
            
            toast.success(`Started ${jobIds.length} render jobs`);
            return jobIds;
        } catch (error: any) {
            console.error('Failed to start batch render:', error);
            toast.error(error.message || 'Failed to start batch render');
            return [];
        } finally {
            setIsSubmitting(false);
        }
    }, [startPolling]);
    
    // Cancel polling (useful when unmounting or user cancels)
    const cancelPolling = useCallback(() => {
        stopPolling();
        activeJobIdsRef.current.clear();
    }, [stopPolling]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, [stopPolling]);
    
    // Compute derived state - memoized to prevent infinite re-renders
    const activeJobs = useMemo(
        () => Array.from(jobs.values()).filter(j => j.status === 'queued' || j.status === 'processing'),
        [jobs]
    );
    const completedJobs = useMemo(
        () => Array.from(jobs.values()).filter(j => j.status === 'completed'),
        [jobs]
    );
    const failedJobs = useMemo(
        () => Array.from(jobs.values()).filter(j => j.status === 'failed'),
        [jobs]
    );
    
    const overallProgress = useMemo(
        () => jobs.size > 0
            ? Math.round(Array.from(jobs.values()).reduce((sum, j) => sum + j.progress, 0) / jobs.size)
            : 0,
        [jobs]
    );
    
    return {
        startRender,
        startBatchRender,
        jobs,
        isSubmitting,
        activeJobs,
        completedJobs,
        failedJobs,
        overallProgress,
        cancelPolling,
    };
}

// Helper to trigger file download
function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
