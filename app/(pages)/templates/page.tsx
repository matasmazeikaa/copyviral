'use client';

import { useState } from 'react';
import { CommunityTemplates, PersonalTemplates } from '../../components/templates';
import { 
    LayoutTemplate,
    Users,
    User
} from 'lucide-react';

type TemplateTab = 'community' | 'personal';

export default function TemplatesPage() {
    const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTab>('community');

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] lg:w-[800px] h-[200px] sm:h-[250px] lg:h-[300px] bg-cyan-600/5 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 lg:py-12">
                {/* Header */}
                <div className="text-center mb-6 sm:mb-8 lg:mb-10">
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4 sm:mb-6">
                        <LayoutTemplate className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-cyan-400" />
                        <span className="text-xs sm:text-sm font-medium text-cyan-300">Templates</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
                        Video <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Templates</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto px-2">
                        Use pre-made templates to create videos faster
                    </p>
                </div>

                {/* Template Sub-tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTemplateTab('personal')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTemplateTab === 'personal'
                                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                        }`}
                    >
                        <User className="w-4 h-4" />
                        <span>My Templates</span>
                    </button>
                </div>


                <PersonalTemplates />
            </div>
        </div>
    );
}
