'use client';

import { useState, useEffect } from 'react';
import { Template } from '@/app/types';
import { listCommunityTemplates } from '@/app/services/templateService';
import { TemplateCard } from './TemplateCard';
import { Loader2, Sparkles, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CommunityTemplatesProps {
    onSelect?: (template: Template) => void;
}

export function CommunityTemplates({ onSelect }: CommunityTemplatesProps) {
    const router = useRouter();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const categories = ['all', 'trending', 'lifestyle', 'business', 'entertainment', 'tutorial'];
    
    useEffect(() => {
        loadTemplates();
    }, [selectedCategory]);
    
    const loadTemplates = async () => {
        setIsLoading(true);
        try {
            const data = await listCommunityTemplates(
                selectedCategory === 'all' ? undefined : selectedCategory
            );
            setTemplates(data);
        } catch (error) {
            console.error('Error loading community templates:', error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleTemplateClick = (template: Template) => {
        if (onSelect) {
            onSelect(template);
        } else {
            router.push(`/templates/${template.id}?type=community`);
        }
    };
    
    const filteredTemplates = templates.filter(template => 
        searchQuery === '' || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full sm:w-64 pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                    />
                </div>
            </div>
            
            {/* Categories */}
            <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                    <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors capitalize ${
                            selectedCategory === category
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                    >
                        {category}
                    </button>
                ))}
            </div>
            
            {/* Templates Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                </div>
            ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-16">
                    <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No community templates available yet</p>
                    <p className="text-sm text-slate-500 mt-1">Check back soon for new templates!</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredTemplates.map(template => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            type="community"
                            onClick={() => handleTemplateClick(template)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
