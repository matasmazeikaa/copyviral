"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { 
    X, 
    AlertTriangle, 
    Video, 
    AudioWaveform,
    Wand2,
    Sparkles,
    Loader2,
    Link,
    Film
} from 'lucide-react';
import { ProjectState } from '@/app/types';

// AI Tool Types
export type AIToolType = 'video-reference' | 'audio-beats';

interface AIToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectTool: (tool: AIToolType, url: string) => void;
    currentProject?: {
        projectName: string;
        mediaFilesCount: number;
        textElementsCount: number;
    } | null;
    isProcessing?: boolean;
}

export function AIToolsModal({ 
    isOpen, 
    onClose, 
    onSelectTool,
    currentProject,
    isProcessing = false
}: AIToolsModalProps) {
    const [selectedTool, setSelectedTool] = useState<AIToolType>('video-reference');
    const [inputUrl, setInputUrl] = useState('');
    const [showOverrideWarning, setShowOverrideWarning] = useState(false);
    const [mounted, setMounted] = useState(false);
    
    // Mount check for portal
    useEffect(() => {
        setMounted(true);
    }, []);
    
    // Check if project has existing data
    const projectHasData = currentProject && (
        (currentProject.mediaFilesCount ?? 0) > 0 || 
        (currentProject.textElementsCount ?? 0) > 0
    );

    const handleSubmit = () => {
        if (selectedTool === 'audio-beats') {
            toast('Audio Beat Sync is coming soon! 🎵', { icon: '🚀' });
            return;
        }

        if (!inputUrl.trim()) {
            toast.error('Please enter a URL');
            return;
        }

        // Validate URL
        const urlPattern = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)/i;
        
        if (!urlPattern.test(inputUrl.trim())) {
            toast.error('Please enter a valid Instagram URL');
            return;
        }

        // Show warning if project has data
        if (projectHasData) {
            setShowOverrideWarning(true);
        } else {
            onSelectTool(selectedTool, inputUrl.trim());
            setInputUrl('');
            onClose();
        }
    };

    const handleConfirmOverride = () => {
        onSelectTool(selectedTool, inputUrl.trim());
        setInputUrl('');
        setShowOverrideWarning(false);
        onClose();
    };

    const handleClose = () => {
        setShowOverrideWarning(false);
        setInputUrl('');
        onClose();
    };

    if (!isOpen || !mounted) return null;

    // Override Warning Modal
    if (showOverrideWarning && currentProject) {
        const warningContent = (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
                <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-md shadow-2xl safe-bottom">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Project Has Existing Data</h3>
                            <p className="text-sm text-slate-400">This action will override your work</p>
                        </div>
                    </div>
                    
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                        <p className="text-sm text-amber-200">
                            <strong>Warning:</strong> The project &quot;{currentProject.projectName}&quot; already contains {currentProject.mediaFilesCount || 0} media files and {currentProject.textElementsCount || 0} text elements. 
                            Using AI analysis will <strong>replace all existing content</strong> with the new generated timeline.
                        </p>
                    </div>
                    
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowOverrideWarning(false)}
                            className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmOverride}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold transition-all"
                        >
                            Override & Continue
                        </button>
                    </div>
                </div>
            </div>
        );
        return createPortal(warningContent, document.body);
    }

    const modalContent = (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
            <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-none overflow-y-auto safe-bottom">
                {/* Header */}
                <div className="relative p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-800">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-cyan-500/10" />
                    <button
                        onClick={handleClose}
                        className="absolute top-3 sm:top-4 right-3 sm:right-4 p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                    <div className="relative flex items-center gap-3">
                        <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
                            <Wand2 className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-white">AI Tools</h2>
                            <p className="text-xs sm:text-sm text-slate-400">Choose how AI should help you create</p>
                        </div>
                    </div>
                </div>

                {/* Tool Selection */}
                <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {/* Video Reference Tool */}
                        <button
                            onClick={() => setSelectedTool('video-reference')}
                            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                selectedTool === 'video-reference'
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            }`}
                        >
                            {selectedTool === 'video-reference' && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            )}
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-3">
                                <Video className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-white mb-1">Video Reference</h3>
                            <p className="text-xs text-slate-400">Copy cuts, timing & text from viral videos</p>
                        </button>

                        {/* Audio Beats Tool - Coming Soon */}
                        <button
                            onClick={() => setSelectedTool('audio-beats')}
                            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                selectedTool === 'audio-beats'
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            }`}
                        >
                            {/* Coming Soon Badge */}
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-[9px] font-bold text-white uppercase tracking-wide">
                                Coming Soon
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-3 opacity-70">
                                <AudioWaveform className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-white mb-1 opacity-80">Audio Beats</h3>
                            <p className="text-xs text-slate-400 opacity-70">Create cuts synced to music beats</p>
                        </button>
                    </div>

                    {/* Tool Description */}
                    <div className={`p-4 rounded-xl border ${
                        selectedTool === 'video-reference' 
                            ? 'bg-purple-500/5 border-purple-500/20' 
                            : 'bg-cyan-500/5 border-cyan-500/20'
                    }`}>
                        {selectedTool === 'video-reference' ? (
                            <div className="space-y-2">
                                <h4 className="font-semibold text-purple-300 text-sm">How it works:</h4>
                                <ul className="text-xs text-slate-400 space-y-1">
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        AI analyzes the video to detect all scene cuts
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Extracts text overlays with timing & positions
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Creates placeholders for you to fill with your content
                                    </li>
                                </ul>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <h4 className="font-semibold text-cyan-300 text-sm flex items-center gap-2">
                                    Coming Soon
                                    <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 rounded-full text-cyan-300">In Development</span>
                                </h4>
                                <ul className="text-xs text-slate-400 space-y-1 opacity-70">
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                        AI will analyze audio to detect beat patterns
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                        Creates cut points synced to the music&apos;s rhythm
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                        Perfect for montages and music-driven edits
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* URL Input - only show for video-reference */}
                    {selectedTool === 'video-reference' && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Video URL</label>
                            <div className="relative">
                                <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={inputUrl}
                                    onChange={(e) => setInputUrl(e.target.value)}
                                    placeholder="Paste Instagram URL..."
                                    disabled={isProcessing}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !isProcessing && inputUrl.trim()) {
                                            handleSubmit();
                                        }
                                    }}
                                    className="w-full pl-11 pr-4 py-3.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all disabled:opacity-50"
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                Supports: Instagram Reels
                            </p>
                        </div>
                    )}

                    {/* Coming soon message for audio-beats */}
                    {selectedTool === 'audio-beats' && (
                        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
                            <p className="text-sm text-slate-400">
                                🎵 Audio Beat Sync is currently in development. Stay tuned for updates!
                            </p>
                        </div>
                    )}

                    {/* Project target info - only show for video-reference with current project */}
                    {currentProject && selectedTool === 'video-reference' && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                            <Film className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-300">
                                Target: <strong>{currentProject.projectName}</strong>
                            </span>
                            {projectHasData && (
                                <span className="ml-auto text-xs text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Has existing data
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-6 pt-0 flex gap-3">
                    <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing || (selectedTool === 'video-reference' && !inputUrl.trim())}
                        className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                            selectedTool === 'video-reference'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 shadow-purple-500/25'
                                : 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-cyan-500/25 opacity-80'
                        }`}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                            </>
                        ) : selectedTool === 'audio-beats' ? (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Coming Soon
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Analyze Video
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
    
    return createPortal(modalContent, document.body);
}

export default AIToolsModal;
