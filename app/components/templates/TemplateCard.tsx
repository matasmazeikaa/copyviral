'use client';

import { Template } from '@/app/types';
import { Eye, Clock, Layers, Trash2, Loader2, Type } from 'lucide-react';
import { useState } from 'react';

interface TemplateCardProps {
    template: Template;
    type: 'community' | 'personal';
    onClick: () => void;
    onDelete?: () => Promise<void>;
}

export function TemplateCard({ template, type, onClick, onDelete }: TemplateCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    
    const slotCount = template.templateData?.slots?.length || 0;
    const textCount = template.templateData?.textElements?.length || 0;
    const totalDuration = template.templateData?.slots?.reduce(
        (sum, slot) => sum + slot.duration, 0
    ) || 0;
    
    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onDelete) return;
        
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
        }
    };
    
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };
    
    return (
        <div 
            onClick={onClick}
            className="group relative cursor-pointer rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/70 transition-all duration-300 overflow-hidden"
        >
            {/* Thumbnail */}
            <div className="aspect-[9/16] bg-gradient-to-br from-slate-800 to-slate-900 relative overflow-hidden">
                {template.thumbnailUrl ? (
                    <img 
                        src={template.thumbnailUrl} 
                        alt={template.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-slate-600">
                            <Layers className="w-10 h-10" />
                            <span className="text-xs">{slotCount} slots</span>
                        </div>
                    </div>
                )}
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
                
                {/* View count for community templates */}
                {type === 'community' && template.viewCount > 0 && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur rounded-full text-xs text-white">
                        <Eye className="w-3 h-3" />
                        <span>{template.viewCount.toLocaleString()}</span>
                    </div>
                )}
                
                {/* Delete button for personal templates */}
                {type === 'personal' && onDelete && (
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 backdrop-blur hover:bg-red-500/80 text-white transition-all sm:opacity-0 sm:group-hover:opacity-100"
                    >
                        {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                    </button>
                )}
                
                {/* Stats at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="flex items-center gap-3 text-xs text-slate-300">
                        <div className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>{slotCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Type className="w-3 h-3" />
                            <span>{textCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(totalDuration)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Info */}
            <div className="p-3">
                <h3 className="font-medium text-white truncate group-hover:text-purple-300 transition-colors">
                    {template.name}
                </h3>
                {type === 'community' && template.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {template.description}
                    </p>
                )}
                {type === 'community' && template.category && (
                    <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded-full">
                        {template.category}
                    </span>
                )}
            </div>
        </div>
    );
}
