'use client';

import { useEffect, useRef, useState } from 'react';
import Link from "next/link";
import { useAppDispatch, useAppSelector } from './store';
import { addProject, deleteProject, rehydrateProjects, setCurrentProject } from './store/slices/projectsSlice';
import { listProjects, storeProject, deleteProject as deleteProjectFromDB } from './store';
import { listProjectsFromSupabase, loadProjectFromSupabase, deleteProjectFromSupabase, saveProjectToSupabase } from './services/projectService';
import { ProjectState, MediaFile } from './types';
import { toast } from 'react-hot-toast';
import { useAuth } from './contexts/AuthContext';
import { 
    Plus, 
    Trash2, 
    Film, 
    Clock, 
    Calendar,
    Loader2,
    FolderOpen,
    Sparkles,
    Play,
    Image as ImageIcon,
    Music,
    Type
} from 'lucide-react';

// Component to display project thumbnail
function ProjectThumbnail({ project }: { project: ProjectState }) {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        // Find the first video or image in the project's media files
        const firstMedia = project.mediaFiles?.find(
            (m: MediaFile) => m.type === 'video' || m.type === 'image'
        );

        if (firstMedia?.src) {
            if (firstMedia.type === 'image') {
                setThumbnailUrl(firstMedia.src);
                setIsLoading(false);
            } else if (firstMedia.type === 'video') {
                // For videos, create a thumbnail from the first frame
                const video = document.createElement('video');
                video.crossOrigin = 'anonymous';
                video.preload = 'metadata';
                video.src = firstMedia.src;
                
                video.onloadeddata = () => {
                    video.currentTime = 0.1; // Seek to 0.1s for the first frame
                };

                video.onseeked = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth || 320;
                        canvas.height = video.videoHeight || 180;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.8));
                        }
                    } catch (e) {
                        console.error('Error generating thumbnail:', e);
                    }
                    setIsLoading(false);
                };

                video.onerror = () => {
                    setIsLoading(false);
                };
            }
        } else {
            setIsLoading(false);
        }
    }, [project.mediaFiles]);

    // Count assets
    const videoCount = project.mediaFiles?.filter((m: MediaFile) => m.type === 'video').length || 0;
    const imageCount = project.mediaFiles?.filter((m: MediaFile) => m.type === 'image').length || 0;
    const audioCount = project.mediaFiles?.filter((m: MediaFile) => m.type === 'audio').length || 0;
    const textCount = project.textElements?.length || 0;

    return (
        <div className="relative aspect-video w-full bg-slate-800/50 rounded-xl overflow-hidden group">
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                </div>
            ) : thumbnailUrl ? (
                <>
                    <img 
                        src={thumbnailUrl} 
                        alt={project.projectName}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <Film className="w-12 h-12 text-slate-600 mb-2" />
                    <span className="text-sm text-slate-500">No preview</span>
                </div>
            )}
            
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    <Play className="w-6 h-6 text-white ml-1" fill="white" />
                </div>
            </div>

            {/* Asset counts badge */}
            {(videoCount > 0 || imageCount > 0 || audioCount > 0 || textCount > 0) && (
                <div className="absolute bottom-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {videoCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white">
                            <Film className="w-3 h-3" />
                            {videoCount}
                        </div>
                    )}
                    {imageCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white">
                            <ImageIcon className="w-3 h-3" />
                            {imageCount}
                        </div>
                    )}
                    {audioCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white">
                            <Music className="w-3 h-3" />
                            {audioCount}
                        </div>
                    )}
                    {textCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white">
                            <Type className="w-3 h-3" />
                            {textCount}
                        </div>
                    )}
                </div>
            )}

            {/* Duration badge */}
            {project.duration > 0 && (
                <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-white font-medium">
                    {formatDuration(project.duration)}
                </div>
            )}
        </div>
    );
}

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
    const { projects, currentProjectId } = useAppSelector((state) => state.projects);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { user } = useAuth();

    useEffect(() => {
        const loadProjects = async () => {
            setIsLoading(true);
            try {
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

    const sortedProjects = [...projects].sort(
        (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="relative max-w-5xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
                        <FolderOpen className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-300">Your Workspace</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        My <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Projects</span>
                    </h1>
                    <p className="text-lg text-slate-400 max-w-xl mx-auto">
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
                        {/* Create New Project Card */}
                        <button 
                            onClick={() => setIsCreating(true)}
                            className="w-full mb-6 group"
                        >
                            <div className="flex items-center gap-6 p-6 bg-gradient-to-r from-purple-900/20 to-slate-900/50 backdrop-blur border border-purple-500/20 rounded-2xl hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
                                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:scale-105 transition-transform duration-300">
                                    <Plus className="w-8 h-8 text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
                                        Create New Project
                                        <Sparkles className="w-5 h-5 text-purple-400" />
                                    </h3>
                                    <p className="text-slate-400">Start a fresh video editing project</p>
                                </div>
                            </div>
                        </button>

                        {/* Projects List */}
                        {sortedProjects.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-800/50 flex items-center justify-center">
                                    <Film className="w-10 h-10 text-slate-600" />
                                </div>
                                <h3 className="text-xl font-medium text-white mb-2">No projects yet</h3>
                                <p className="text-slate-400 mb-6">Create your first project to get started</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {sortedProjects.map((project) => (
                                    <Link 
                                        key={project.id}
                                        href={`/projects/${project.id}`}
                                        onClick={() => dispatch(setCurrentProject(project.id))}
                                        className="block group"
                                    >
                                        <div className="flex flex-col md:flex-row gap-5 p-5 bg-slate-900/50 backdrop-blur border border-slate-800 rounded-2xl hover:border-slate-700 hover:bg-slate-900/70 transition-all duration-300">
                                            {/* Thumbnail */}
                                            <div className="w-full md:w-72 flex-shrink-0">
                                                <ProjectThumbnail project={project} />
                                            </div>
                                            
                                            {/* Project Info */}
                                            <div className="flex-1 flex flex-col justify-between py-1">
                                                <div>
                                                    <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                                                        {project.projectName}
                                                    </h3>
                                                    <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="w-4 h-4" />
                                                            <span>Created {formatDate(project.createdAt)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="w-4 h-4" />
                                                            <span>Modified {formatDate(project.lastModified)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Project stats */}
                                                <div className="flex items-center justify-between mt-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-medium text-slate-300">
                                                            {project.aspectRatio || '9:16'}
                                                        </span>
                                                        <span className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-medium text-slate-300">
                                                            {project.fps || 30} FPS
                                                        </span>
                                                        {project.duration > 0 && (
                                                            <span className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-medium text-slate-300">
                                                                {formatDuration(project.duration)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Delete button */}
                                                    <button
                                                        onClick={(e) => handleDeleteProject(e, project.id)}
                                                        disabled={deletingId === project.id}
                                                        className="p-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                                        aria-label="Delete project"
                                                    >
                                                        {deletingId === project.id ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Create Project Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div 
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-2xl font-bold text-white mb-2">Create New Project</h3>
                        <p className="text-slate-400 mb-6">Give your project a memorable name</p>
                        
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
                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-slate-500 transition-all"
                        />
                        
                        <div className="flex gap-3 mt-6">
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
        </div>
    );
}
