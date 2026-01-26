'use client';

import { useState, useEffect } from 'react';
import { Template } from '@/app/types';
import { listUserTemplates, deleteUserTemplate } from '@/app/services/templateService';
import { TemplateCard } from './TemplateCard';
import { Loader2, User, FolderPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface PersonalTemplatesProps {
    onSelect?: (template: Template) => void;
}

export function PersonalTemplates({ onSelect }: PersonalTemplatesProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        if (user) {
            loadTemplates();
        } else {
            setIsLoading(false);
        }
    }, [user]);
    
    const loadTemplates = async () => {
        if (!user) return;
        
        setIsLoading(true);
        try {
            const data = await listUserTemplates();
            setTemplates(data);
        } catch (error) {
            console.error('Error loading personal templates:', error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleTemplateClick = (template: Template) => {
        if (onSelect) {
            onSelect(template);
        } else {
            router.push(`/templates/${template.id}?type=personal`);
        }
    };
    
    const handleDelete = async (templateId: string) => {
        if (!user) return;
        
        const success = await deleteUserTemplate(templateId);
        if (success) {
            setTemplates(prev => prev.filter(t => t.id !== templateId));
            toast.success('Template deleted');
        } else {
            toast.error('Failed to delete template');
        }
    };
    
    if (!user) {
        return (
            <div className="text-center py-16">
                <User className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Sign in to view your templates</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">My Templates</h2>
            </div>
            
            {/* Templates Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <div className="text-center py-16">
                    <FolderPlus className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No personal templates yet</p>
                    <p className="text-sm text-slate-500 mt-1">
                        Create a project and save it as a template to get started
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {templates.map(template => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            type="personal"
                            onClick={() => handleTemplateClick(template)}
                            onDelete={() => handleDelete(template.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
