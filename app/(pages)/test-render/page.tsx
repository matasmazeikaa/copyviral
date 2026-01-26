'use client';

import { useState } from 'react';
import { useCloudRender } from '@/app/hooks/useCloudRender';
import { Loader2, Play, CheckCircle, XCircle, Download, RefreshCw } from 'lucide-react';

export default function TestRenderPage() {
    const [testVideoUrl, setTestVideoUrl] = useState('');
    const [includeText, setIncludeText] = useState(false);
    
    const { 
        startRender, 
        jobs, 
        isSubmitting, 
        activeJobs, 
        completedJobs,
        failedJobs,
    } = useCloudRender({
        onComplete: (job) => {
            console.log('Render complete!', job);
        },
        onError: (jobId, error) => {
            console.error('Render failed:', jobId, error);
        },
    });

    const handleTestRender = async () => {
        // Create a simple test render with a placeholder or test video
        const testRequest = {
            mediaFiles: testVideoUrl ? [{
                id: 'test-1',
                fileName: 'test-video.mp4',
                fileId: 'test-1',
                type: 'video' as const,
                startTime: 0,
                endTime: 5,
                positionStart: 0,
                positionEnd: 5,
                includeInMerge: true,
                playbackSpeed: 1,
                volume: 50,
                zIndex: 0,
                x: 0,
                y: 0,
                width: 1080,
                height: 1920,
                src: testVideoUrl,
                aspectRatioFit: 'cover' as const,
            }] : [],
            textElements: includeText ? [{
                id: 'test-text-1',
                text: 'Test Render',
                positionStart: 0,
                positionEnd: 5,
                x: 540,
                y: 960,
                fontSize: 72,
                color: '#FFFFFF',
                font: 'Arial',
                align: 'center' as const,
            }] : [],
            exportSettings: {
                resolution: '1080x1920',
                quality: 'medium',
                speed: 'fast',
                fps: 30,
                format: 'mp4' as const,
                includeSubtitles: false,
            },
            totalDuration: 5,
            resolution: { width: 1080, height: 1920 },
            fps: 30,
            projectName: 'test-render',
        };

        await startRender(testRequest);
    };

    const allJobs = Array.from(jobs.values());

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-2xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold">Lambda Render Test</h1>
                    <p className="text-slate-400 mt-2">
                        Test your AWS Lambda video rendering setup
                    </p>
                </div>

                {/* Test Video URL Input */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Test Configuration</h2>
                    
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">
                            Test Video URL (required for video-only test)
                        </label>
                        <input
                            type="url"
                            value={testVideoUrl}
                            onChange={(e) => setTestVideoUrl(e.target.value)}
                            placeholder="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Use a publicly accessible video URL. Try: https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="includeText"
                            checked={includeText}
                            onChange={(e) => setIncludeText(e.target.checked)}
                            className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-purple-500"
                        />
                        <label htmlFor="includeText" className="text-sm text-slate-300">
                            Include text overlay (requires FFmpeg with drawtext filter)
                        </label>
                    </div>

                    <button
                        onClick={handleTestRender}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Starting Render...
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5" />
                                Start Test Render
                            </>
                        )}
                    </button>
                </div>

                {/* Status Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Render Jobs</h2>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-amber-400">{activeJobs.length} active</span>
                            <span className="text-emerald-400">{completedJobs.length} completed</span>
                            <span className="text-red-400">{failedJobs.length} failed</span>
                        </div>
                    </div>

                    {allJobs.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            No render jobs yet. Click &quot;Start Test Render&quot; to begin.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {allJobs.map((job) => (
                                <div
                                    key={job.id}
                                    className={`p-4 rounded-lg border ${
                                        job.status === 'processing'
                                            ? 'bg-blue-500/10 border-blue-500/30'
                                            : job.status === 'completed'
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : job.status === 'failed'
                                            ? 'bg-red-500/10 border-red-500/30'
                                            : 'bg-amber-500/10 border-amber-500/30'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {job.status === 'queued' && (
                                                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                            )}
                                            {job.status === 'processing' && (
                                                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                            )}
                                            {job.status === 'completed' && (
                                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            )}
                                            {job.status === 'failed' && (
                                                <XCircle className="w-4 h-4 text-red-400" />
                                            )}
                                            <span className="font-mono text-sm text-slate-300">
                                                {job.id.slice(0, 8)}...
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                job.status === 'queued' ? 'bg-amber-500/20 text-amber-300' :
                                                job.status === 'processing' ? 'bg-blue-500/20 text-blue-300' :
                                                job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                                                'bg-red-500/20 text-red-300'
                                            }`}>
                                                {job.status}
                                            </span>
                                        </div>
                                        
                                        {job.status === 'completed' && job.downloadUrl && (
                                            <a
                                                href={job.downloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
                                            >
                                                <Download className="w-4 h-4" />
                                                Download
                                            </a>
                                        )}
                                    </div>

                                    {(job.status === 'queued' || job.status === 'processing') && (
                                        <div className="mt-2">
                                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                                                <span>Progress</span>
                                                <span>{job.progress}%</span>
                                            </div>
                                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${
                                                        job.status === 'queued' 
                                                            ? 'bg-amber-500 animate-pulse' 
                                                            : 'bg-blue-500'
                                                    }`}
                                                    style={{ width: `${job.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {job.status === 'failed' && job.errorMessage && (
                                        <p className="mt-2 text-sm text-red-400">
                                            Error: {job.errorMessage}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Debug Info */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Setup Checklist</h2>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <span className="text-slate-500">□</span>
                            <span>AWS credentials configured in Vercel env vars</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-slate-500">□</span>
                            <span>SQS queue created and URL set in AWS_SQS_QUEUE_URL</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-slate-500">□</span>
                            <span>Lambda function deployed with FFmpeg layer</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-slate-500">□</span>
                            <span>SQS → Lambda event source mapping created</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-slate-500">□</span>
                            <span>Supabase migrations applied (render_jobs table + renders bucket)</span>
                        </li>
                    </ul>
                    
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <p className="text-xs text-slate-500">
                            Check browser console and AWS CloudWatch logs for detailed error information.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
