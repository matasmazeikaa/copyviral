'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from "next/link";
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from './store';
import { addProject, deleteProject, rehydrateProjects, setCurrentProject, clearProjects, updateProject } from './store/slices/projectsSlice';
import { listProjects, storeProject, deleteProject as deleteProjectFromDB } from './store';
import { listProjectsFromSupabase, loadProjectFromSupabase, deleteProjectFromSupabase, saveProjectToSupabase } from './services/projectService';
import { ProjectState, MediaFile } from './types';
import { toast } from 'react-hot-toast';
import { useAuth } from './contexts/AuthContext';
import { AIToolsModal, AIToolType } from './components/AIToolsModal';
import { 
    Plus, 
    Trash2, 
    Film, 
    Clock, 
    Loader2,
    FolderOpen,
    Sparkles,
    Wand2,
    ArrowRight,
    Video,
    AudioWaveform,
    Pencil,
    Check,
    X
} from 'lucide-react';

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

export default function Page() {
    const dispatch = useAppDispatch();
    const router = useRouter();
    const { projects, currentProjectId } = useAppSelector((state) => state.projects);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pasteUrl, setPasteUrl] = useState('');
    const [isCreatingFromLink, setIsCreatingFromLink] = useState(false);
    const { user } = useAuth();
    
    // Edit title state
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [editedTitle, setEditedTitle] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    // AI Tools Modal state
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [selectedProjectForAI, setSelectedProjectForAI] = useState<ProjectState | null>(null);

    const previousUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        const loadProjects = async () => {
            setIsLoading(true);
            
            // Clear Redux state immediately to prevent showing old user's projects
            dispatch(clearProjects());
            
            try {
                // Only load projects if user is logged in
                if (!user) {
                    setIsLoading(false);
                    return;
                }
                
                const localProjects = await listProjects();
                let cloudProjects: ProjectState[] = [];
                
                try {
                    const supabaseProjects = await listProjectsFromSupabase(user.id);
                    const loadedProjects = await Promise.all(
                        supabaseProjects.map(async (record) => {
                            const fullProject = await loadProjectFromSupabase(record.id, user.id);
                            return fullProject;
                        })
                    );
                    cloudProjects = loadedProjects.filter((p): p is ProjectState => p !== null);
                } catch (error) {
                    console.error('Error loading projects from Supabase:', error);
                }

                // Merge local and cloud projects, with cloud taking precedence
                const projectMap = new Map<string, ProjectState>();
                localProjects.forEach(project => {
                    projectMap.set(project.id, project);
                });
                cloudProjects.forEach(project => {
                    projectMap.set(project.id, project);
                });

                const mergedProjects = Array.from(projectMap.values());
                dispatch(rehydrateProjects(mergedProjects));
            } catch (error) {
                toast.error('Failed to load projects');
                console.error('Error loading projects:', error);
            } finally {
                setIsLoading(false);
            }
        };
        
        // Track user changes
        const currentUserId = user?.id ?? null;
        previousUserIdRef.current = currentUserId;
        
        loadProjects();
    }, [dispatch, user]);

    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;

        if (!user) {
            toast.error('You must be logged in to create a project');
            return;
        }

        const newProject: ProjectState = {
            id: crypto.randomUUID(),
            projectName: newProjectName,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            mediaFiles: [],
            textElements: [],
            currentTime: 0,
            isPlaying: false,
            isMuted: false,
            duration: 0,
            activeSection: 'media',
            activeElement: 'text',
            activeElementIndex: 0,
            filesID: [],
            zoomLevel: 1,
            timelineZoom: 100,
            enableMarkerTracking: true,
            resolution: { width: 1080, height: 1920 },
            fps: 30,
            aspectRatio: '9:16',
            history: [],
            future: [],
            exportSettings: {
                resolution: '1080p',
                quality: 'high',
                speed: 'fastest',
                fps: 30,
                format: 'mp4',
                includeSubtitles: false,
            },
        };

        try {
            const savedId = await saveProjectToSupabase(newProject, user.id);
            
            if (!savedId) {
                toast.error('Failed to create project in database');
                return;
            }

            await storeProject(newProject);
            dispatch(addProject(newProject));
            setNewProjectName('');
            setIsCreating(false);
            toast.success('Project created successfully');
        } catch (error) {
            console.error('Error creating project:', error);
            toast.error('Failed to create project');
        }
    };

    const handleOpenAIModal = (project?: ProjectState) => {
        setSelectedProjectForAI(project || null);
        setIsAIModalOpen(true);
    };

    const handleAIToolSelect = async (tool: AIToolType, url: string, projectId?: string) => {
        if (!user) {
            toast.error('You must be logged in to use AI tools');
            return;
        }

        // Audio beats is coming soon
        if (tool === 'audio-beats') {
            toast('Audio Beat Sync is coming soon! 🎵', { icon: '🚀' });
            return;
        }

        setIsCreatingFromLink(true);

        // Generate project name from URL
        let projectName = 'AI Video Remix';
        try {
            const parsedUrl = new URL(url.includes('://') ? url : `https://${url}`);
            const hostname = parsedUrl.hostname.replace('www.', '');
            if (hostname.includes('instagram')) {
                projectName = 'Instagram Remix';
            }
        } catch {
            // Keep default name
        }

        try {
            let targetProject: ProjectState;
            
            // Use existing project or create new one
            if (projectId) {
                const existingProject = projects.find(p => p.id === projectId);
                if (!existingProject) {
                    toast.error('Project not found');
                    setIsCreatingFromLink(false);
                    return;
                }
                targetProject = existingProject;
            } else {
                // Create new project
                targetProject = {
                    id: crypto.randomUUID(),
                    projectName,
                    createdAt: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    mediaFiles: [],
                    textElements: [],
                    currentTime: 0,
                    isPlaying: false,
                    isMuted: false,
                    duration: 0,
                    activeSection: 'AI',
                    activeElement: 'AI',
                    activeElementIndex: 0,
                    filesID: [],
                    zoomLevel: 1,
                    timelineZoom: 100,
                    enableMarkerTracking: true,
                    resolution: { width: 1080, height: 1920 },
                    fps: 30,
                    aspectRatio: '9:16',
                    history: [],
                    future: [],
                    exportSettings: {
                        resolution: '1080p',
                        quality: 'high',
                        speed: 'fastest',
                        fps: 30,
                        format: 'mp4',
                        includeSubtitles: false,
                    },
                };

                const savedId = await saveProjectToSupabase(targetProject, user.id);
                
                if (!savedId) {
                    toast.error('Failed to create project in database');
                    setIsCreatingFromLink(false);
                    return;
                }

                await storeProject(targetProject);
                dispatch(addProject(targetProject));
            }
            
            dispatch(setCurrentProject(targetProject.id));
            
            // Navigate to project with auto-analyze URL parameter
            const encodedUrl = encodeURIComponent(url);
            router.push(`/projects/${targetProject.id}?autoAnalyze=${encodedUrl}`);
            
            setPasteUrl('');
        } catch (error) {
            console.error('Error creating project with AI:', error);
            toast.error('Failed to create project');
            setIsCreatingFromLink(false);
        }
    };

    const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        e.preventDefault();
        
        setDeletingId(projectId);
        
        try {
            await deleteProjectFromDB(projectId);
            if (user) {
                await deleteProjectFromSupabase(projectId, user.id);
            }
            dispatch(deleteProject(projectId));
            
            const localProjects = await listProjects();
            let cloudProjects: ProjectState[] = [];
            
            if (user) {
                try {
                    const supabaseProjects = await listProjectsFromSupabase(user.id);
                    const loadedProjects = await Promise.all(
                        supabaseProjects.map(async (record) => {
                            const fullProject = await loadProjectFromSupabase(record.id, user.id);
                            return fullProject;
                        })
                    );
                    cloudProjects = loadedProjects.filter((p): p is ProjectState => p !== null);
                } catch (error) {
                    console.error('Error loading projects from Supabase:', error);
                }
            }

            const projectMap = new Map<string, ProjectState>();
            localProjects.forEach(project => projectMap.set(project.id, project));
            cloudProjects.forEach(project => projectMap.set(project.id, project));
            const mergedProjects = Array.from(projectMap.values());
            
            dispatch(rehydrateProjects(mergedProjects));
            toast.success('Project deleted successfully');
        } catch (error) {
            console.error('Error deleting project:', error);
            toast.error('Failed to delete project');
        } finally {
            setDeletingId(null);
        }
    };

    const handleStartEditTitle = (e: React.MouseEvent, project: ProjectState) => {
        e.stopPropagation();
        e.preventDefault();
        setEditingProjectId(project.id);
        setEditedTitle(project.projectName);
        setTimeout(() => editInputRef.current?.focus(), 0);
    };

    const handleSaveTitle = async (e: React.MouseEvent | React.KeyboardEvent, projectId: string) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (!editedTitle.trim()) {
            setEditingProjectId(null);
            return;
        }

        const project = projects.find(p => p.id === projectId);
        if (!project) {
            setEditingProjectId(null);
            return;
        }

        const updatedProject: ProjectState = {
            ...project,
            projectName: editedTitle.trim(),
            lastModified: new Date().toISOString(),
        };

        try {
            await storeProject(updatedProject);
            if (user) {
                await saveProjectToSupabase(updatedProject, user.id);
            }
            dispatch(updateProject(updatedProject));
            toast.success('Project renamed');
        } catch (error) {
            console.error('Error updating project title:', error);
            toast.error('Failed to rename project');
        }

        setEditingProjectId(null);
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setEditingProjectId(null);
    };

    const sortedProjects = [...projects].sort(
        (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] lg:w-[800px] h-[200px] sm:h-[250px] lg:h-[300px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 lg:py-12">
                {/* Header */}
                <div className="text-center mb-6 sm:mb-8 lg:mb-10">
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4 sm:mb-6">
                        <FolderOpen className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-purple-400" />
                        <span className="text-xs sm:text-sm font-medium text-purple-300">Your Workspace</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
                        My <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Projects</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto px-2">
                        Create, edit and manage your video projects
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-4" />
                        <p className="text-slate-400">Loading your projects...</p>
                    </div>
                ) : (
                    <>
                        {/* AI Quick Start - Opens Modal */}
                        <button 
                            onClick={() => handleOpenAIModal()}
                            className="w-full mb-4 sm:mb-6 group relative text-left"
                            disabled={isCreatingFromLink}
                        >
                            {/* Animated gradient border */}
                            <div className="absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-xl sm:rounded-2xl opacity-70 blur-[2px] group-hover:opacity-100 transition-opacity duration-500" 
                                style={{ 
                                    backgroundSize: '200% 200%',
                                    animation: 'gradient-x 3s ease infinite'
                                }} 
                            />
                            <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/30 backdrop-blur border border-transparent rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden">
                                {/* Background effects */}
                                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                    <div className="absolute top-4 right-8 opacity-30 group-hover:opacity-60 transition-opacity hidden sm:block">
                                        <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                                    </div>
                                    <div className="absolute top-12 right-16 opacity-20 group-hover:opacity-50 transition-opacity hidden sm:block" style={{ animationDelay: '0.5s' }}>
                                        <Sparkles className="w-3 h-3 text-pink-400 animate-pulse" />
                                    </div>
                                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all" />
                                </div>

                                <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                                        <div className="relative">
                                            <div className="w-11 sm:w-14 h-11 sm:h-14 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
                                                <Wand2 className="w-5 sm:w-7 h-5 sm:h-7 text-white" />
                                            </div>
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                                                <span className="text-[8px] font-bold text-yellow-900">AI</span>
                                            </div>
                                        </div>
                                        <div className="text-left flex-1">
                                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                                <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
                                                    Quick Start with AI
                                                </span>
                                            </h3>
                                            <p className="text-xs sm:text-sm text-slate-400">Copy viral videos or create beat-synced edits</p>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-slate-400 sm:hidden group-hover:translate-x-1 transition-transform" />
                                    </div>

                                    <div className="flex-1 hidden sm:flex justify-end">
                                        <div className="flex items-center gap-2 px-3 lg:px-5 py-2 lg:py-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-xl group-hover:border-purple-500/50 transition-all">
                                            <div className="flex items-center gap-1.5 lg:gap-2">
                                                <Video className="w-4 h-4 text-purple-400" />
                                                <span className="text-xs lg:text-sm text-purple-300">Video Reference</span>
                                            </div>
                                            <span className="text-slate-600 mx-1 hidden lg:inline">|</span>
                                            <div className="hidden lg:flex items-center gap-2">
                                                <AudioWaveform className="w-4 h-4 text-cyan-400" />
                                                <span className="text-sm text-cyan-300">Beat Sync</span>
                                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 rounded text-cyan-400 font-medium">Soon</span>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-slate-400 ml-2 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                {/* Platform badges - Hidden on mobile */}
                                <div className="relative hidden sm:flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-800/50">
                                    <span className="text-xs text-slate-500">Works with:</span>
                                    <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-800/50 rounded-md">
                                            Instagram
                                        </span>
                                </div>
                            </div>
                        </button>

                        {/* Create New Project Card */}
                        <button 
                            onClick={() => setIsCreating(true)}
                            className="w-full mb-4 sm:mb-6 group"
                        >
                            <div className="flex items-center gap-4 sm:gap-6 p-4 sm:p-6 bg-gradient-to-r from-slate-900/50 to-slate-900/30 backdrop-blur border border-slate-700/30 rounded-xl sm:rounded-2xl hover:border-slate-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-slate-500/5">
                                <div className="flex-shrink-0 w-12 sm:w-16 h-12 sm:h-16 rounded-xl bg-slate-800 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                                    <Plus className="w-6 sm:w-8 h-6 sm:h-8 text-slate-400" />
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <h3 className="text-lg sm:text-xl font-semibold text-white mb-0.5 sm:mb-1 flex items-center gap-2">
                                        Create Blank Project
                                    </h3>
                                    <p className="text-sm sm:text-base text-slate-400">Start from scratch with a fresh canvas</p>
                                </div>
                            </div>
                        </button>

                        {/* Projects List */}
                        {sortedProjects.length === 0 ? (
                            <div className="text-center py-10 sm:py-16">
                                <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-full bg-slate-800/50 flex items-center justify-center">
                                    <Film className="w-8 sm:w-10 h-8 sm:h-10 text-slate-600" />
                                </div>
                                <h3 className="text-lg sm:text-xl font-medium text-white mb-2">No projects yet</h3>
                                <p className="text-sm sm:text-base text-slate-400 mb-6">Create your first project to get started</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                {sortedProjects.map((project) => (
                                    <div key={project.id} className="group">
                                        <NextLink 
                                            href={`/projects/${project.id}`}
                                            onClick={(e) => {
                                                if (editingProjectId === project.id) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                dispatch(setCurrentProject(project.id));
                                            }}
                                            className="block h-full"
                                        >
                                            <div className="flex flex-col h-full p-3 sm:p-4 bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl sm:rounded-2xl hover:border-slate-700 hover:bg-slate-900/70 transition-all duration-300 active:scale-[0.98]">
                                                {/* Header with icon and actions */}
                                                <div className="flex items-start justify-between mb-2 sm:mb-3">
                                                    <div className="flex-shrink-0 w-10 sm:w-11 h-10 sm:h-11 rounded-xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/20 flex items-center justify-center">
                                                        <Film className="w-4 sm:w-5 h-4 sm:h-5 text-purple-400" />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {project.duration > 0 && (
                                                            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-800 rounded-lg text-[10px] sm:text-xs font-medium text-slate-300">
                                                                {formatDuration(project.duration)}
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={(e) => handleDeleteProject(e, project.id)}
                                                            disabled={deletingId === project.id}
                                                            className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all duration-200 sm:opacity-0 sm:group-hover:opacity-100"
                                                            aria-label="Delete project"
                                                        >
                                                            {deletingId === project.id ? (
                                                                <Loader2 className="w-3.5 sm:w-4 h-3.5 sm:h-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                {/* Project Title */}
                                                <div className="flex-1">
                                                    {editingProjectId === project.id ? (
                                                        <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                                                            <input
                                                                ref={editInputRef}
                                                                type="text"
                                                                value={editedTitle}
                                                                onChange={(e) => setEditedTitle(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        handleSaveTitle(e, project.id);
                                                                    } else if (e.key === 'Escape') {
                                                                        setEditingProjectId(null);
                                                                    }
                                                                }}
                                                                className="flex-1 px-2 py-1 bg-slate-800 border border-purple-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-semibold"
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <button
                                                                onClick={(e) => handleSaveTitle(e, project.id)}
                                                                className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={handleCancelEdit}
                                                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <h3 className="text-sm sm:text-base font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                                                                {project.projectName}
                                                            </h3>
                                                            <button
                                                                onClick={(e) => handleStartEditTitle(e, project)}
                                                                className="p-1 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-purple-400 transition-all sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
                                                                aria-label="Edit project name"
                                                            >
                                                                <Pencil className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Date info */}
                                                <div className="flex items-center gap-3 text-[10px] sm:text-xs text-slate-500 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-800">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{formatDate(project.lastModified)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </NextLink>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Create Project Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                    <div 
                        className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-md shadow-2xl safe-bottom"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Create New Project</h3>
                        <p className="text-sm sm:text-base text-slate-400 mb-4 sm:mb-6">Give your project a memorable name</p>
                        
                        <input
                            type="text"
                            ref={inputRef}
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleCreateProject();
                                } else if (e.key === "Escape") {
                                    setIsCreating(false);
                                }
                            }}
                            placeholder="My Awesome Video"
                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-slate-500 transition-all text-base"
                        />
                        
                        <div className="flex gap-3 mt-5 sm:mt-6">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateProject}
                                disabled={!newProjectName.trim()}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/25 disabled:shadow-none"
                            >
                                Create Project
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Tools Modal */}
            <AIToolsModal
                isOpen={isAIModalOpen}
                onClose={() => {
                    setIsAIModalOpen(false);
                    setSelectedProjectForAI(null);
                }}
                onSelectTool={(tool, url) => handleAIToolSelect(tool, url, selectedProjectForAI?.id)}
                currentProject={selectedProjectForAI ? {
                    projectName: selectedProjectForAI.projectName,
                    mediaFilesCount: selectedProjectForAI.mediaFiles?.length || 0,
                    textElementsCount: selectedProjectForAI.textElements?.length || 0
                } : null}
                isProcessing={isCreatingFromLink}
            />
        </div>
    );
}
