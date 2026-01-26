"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Loader2, CheckCircle, Image as ImageIcon, Film, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

interface ReportIssueModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ReportIssueModal({ isOpen, onClose }: ReportIssueModalProps) {
    const [mounted, setMounted] = useState(false);
    const [description, setDescription] = useState("");
    const [attachment, setAttachment] = useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setDescription("");
            setAttachment(null);
            setAttachmentPreview(null);
        }
    }, [isOpen]);

    // Clean up preview URL when component unmounts or attachment changes
    useEffect(() => {
        return () => {
            if (attachmentPreview) {
                URL.revokeObjectURL(attachmentPreview);
            }
        };
    }, [attachmentPreview]);

    const handleFileSelect = (file: File) => {
        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            toast.error("Invalid file type. Allowed: JPG, PNG, GIF, WebP, MP4, WebM, MOV");
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error("File exceeds maximum size of 50MB");
            return;
        }

        // Clean up previous preview
        if (attachmentPreview) {
            URL.revokeObjectURL(attachmentPreview);
        }

        setAttachment(file);
        setAttachmentPreview(URL.createObjectURL(file));
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const removeAttachment = () => {
        if (attachmentPreview) {
            URL.revokeObjectURL(attachmentPreview);
        }
        setAttachment(null);
        setAttachmentPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error("Please describe your issue");
            return;
        }

        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append("description", description.trim());
            formData.append("pageUrl", window.location.href);
            if (attachment) {
                formData.append("attachment", attachment);
            }

            const response = await fetch("/api/issues/report", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to submit report");
            }

            toast.success("Thank you for your feedback!");
            onClose();
        } catch (error: any) {
            console.error("Error submitting issue report:", error);
            toast.error(error.message || "Failed to submit report. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isImage = attachment && ALLOWED_IMAGE_TYPES.includes(attachment.type);
    const isVideo = attachment && ALLOWED_VIDEO_TYPES.includes(attachment.type);
    const charactersRemaining = MAX_DESCRIPTION_LENGTH - description.length;
    const isOverLimit = charactersRemaining < 0;

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
                    <h2 className="text-lg font-semibold text-white">Report an Issue</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
                        disabled={isSubmitting}
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Describe the issue
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What went wrong? How can we reproduce the issue?"
                            className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            disabled={isSubmitting}
                        />
                        <div className={`text-right text-sm mt-1 ${isOverLimit ? 'text-red-400' : 'text-zinc-500'}`}>
                            {description.length}/{MAX_DESCRIPTION_LENGTH}
                        </div>
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Attachment (optional)
                        </label>
                        
                        {!attachment ? (
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className={`
                                    border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
                                    ${isDragging 
                                        ? 'border-blue-500 bg-blue-500/10' 
                                        : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                                    }
                                `}
                            >
                                <Upload className="w-8 h-8 mx-auto mb-2 text-zinc-500" />
                                <p className="text-sm text-zinc-400">
                                    Drag & drop an image or video, or click to browse
                                </p>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Max 50MB - JPG, PNG, GIF, WebP, MP4, WebM, MOV
                                </p>
                            </div>
                        ) : (
                            <div className="relative border border-zinc-700 rounded-lg overflow-hidden bg-zinc-800">
                                {/* Preview */}
                                <div className="aspect-video flex items-center justify-center bg-black/50">
                                    {isImage && attachmentPreview && (
                                        <img 
                                            src={attachmentPreview} 
                                            alt="Preview" 
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    )}
                                    {isVideo && attachmentPreview && (
                                        <video 
                                            src={attachmentPreview}
                                            className="max-h-full max-w-full object-contain"
                                            controls
                                        />
                                    )}
                                </div>
                                
                                {/* File info bar */}
                                <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/80">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {isImage ? (
                                            <ImageIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                        ) : (
                                            <Film className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                        )}
                                        <span className="text-sm text-zinc-300 truncate">
                                            {attachment.name}
                                        </span>
                                        <span className="text-xs text-zinc-500 flex-shrink-0">
                                            ({(attachment.size / (1024 * 1024)).toFixed(1)} MB)
                                        </span>
                                    </div>
                                    <button
                                        onClick={removeAttachment}
                                        className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors flex-shrink-0"
                                        disabled={isSubmitting}
                                    >
                                        <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-400" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ALLOWED_TYPES.join(',')}
                            onChange={handleFileInputChange}
                            className="hidden"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !description.trim() || isOverLimit}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                Submit Report
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
