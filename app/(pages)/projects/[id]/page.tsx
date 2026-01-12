"use client";
import { useEffect, useState } from "react";
import { getFile, getFileWithFallback, storeProject, useAppDispatch, useAppSelector } from "../../../store";
import { getProject } from "../../../store";
import { setCurrentProject, updateProject } from "../../../store/slices/projectsSlice";
import { rehydrate, setMediaFiles } from '../../../store/slices/projectSlice';
import { useRouter } from 'next/navigation';
import { Timeline } from "../../../components/editor/timeline/Timline";
import { PreviewPlayer } from "../../../components/editor/player/remotion/Player";
import { MediaFile } from "@/app/types";
import LeftSidebar from "../../../components/editor/LeftSidebar";
import RightSidebar from "../../../components/editor/RightSidebar";
import VideoLoader from "../../../components/editor/VideoLoader";
import Image from "next/image";
import { useAuth } from "../../../contexts/AuthContext";
import { createClient } from "../../../utils/supabase/client";
import { addMediaLoading, updateMediaProgress, completeMediaLoading, errorMediaLoading } from "../../../store/slices/loadingSlice";
import { loadProjectFromSupabase } from "../../../services/projectService";
import UpgradeModal from "../../../components/UpgradeModal";

export default function Project({ params }: { params: { id: string } }) {
    const { id } = params;
    const dispatch = useAppDispatch();
    const projectState = useAppSelector((state) => state.projectState);
    const { currentProjectId } = useAppSelector((state) => state.projects);
    const [isLoading, setIsLoading] = useState(true);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const { currentTime, duration, fps } = useAppSelector((state) => state.projectState);
    const { user, usageInfo } = useAuth();

    const router = useRouter();
    
    // AI credits info
    const creditsUsed = usageInfo?.used || 0;
    const creditsLimit = typeof usageInfo?.limit === 'number' ? usageInfo.limit : 3;
    
    // Calculate frame info for status bar
    const currentFrame = Math.round(currentTime * fps);
    const totalFrames = Math.round(duration * fps);
    const formatTime = (seconds: number) => {
        return `${seconds.toFixed(1)}s`;
    };
    // when page is loaded set the project id if it exists
    useEffect(() => {
        const loadProject = async () => {
            if (id) {
                setIsLoading(true);
                // Try to load from IndexedDB first (faster)
                let project = await getProject(id);
                
                // If not found locally and user is authenticated, try Supabase
                if (!project && user) {
                    project = await loadProjectFromSupabase(id, user.id);
                    // If found in Supabase, also save to IndexedDB for faster future access
                    if (project) {
                        await storeProject(project);
                    }
                }
                
                if (project) {
                    dispatch(setCurrentProject(id));
                    setIsLoading(false);
                } else {
                    router.push('/404');
                }
            }
        };
        loadProject();
    }, [id, dispatch, router, user]);

    // set project state from with the current project id
    useEffect(() => {
        const loadProject = async () => {
            if (currentProjectId) {
                // Try to load from IndexedDB first
                let project = await getProject(currentProjectId);
                
                // If not found locally and user is authenticated, try Supabase
                if (!project && user) {
                    project = await loadProjectFromSupabase(currentProjectId, user.id);
                    // If found in Supabase, also save to IndexedDB for faster future access
                    if (project) {
                        await storeProject(project);
                    }
                }
                
                if (project) {
                    dispatch(rehydrate(project));

                    dispatch(setMediaFiles((await Promise.all(
                        project.mediaFiles.map(async (media: MediaFile) => {
                            try {
                                if (media.isPlaceholder) {
                                    return media;
                                }

                                // Skip placeholders or media without fileId
                                if (!media.fileId || media.fileId.trim() === '') {
                                    return null;
                                }

                                // Use fallback mechanism (IndexedDB -> Supabase) for all media types with supabaseFileId
                                let file: File | null = null;
                                
                                if (media.supabaseFileId && user) {
                                    // Check if file exists in IndexedDB first to determine if we need to show loading
                                    const cachedFile = await getFile(media.fileId);
                                    
                                    if (!cachedFile) {
                                        // File not in cache, will download from Supabase - show loading
                                        dispatch(addMediaLoading({ fileId: media.fileId, fileName: media.fileName, type: media.type }));
                                    }
                                    
                                    // Use fallback for media with Supabase file ID
                                    file = await getFileWithFallback(
                                        media.fileId,
                                        media.supabaseFileId,
                                        media.fileName,
                                        user.id,
                                        !cachedFile ? (progress) => {
                                            dispatch(updateMediaProgress({ fileId: media.fileId, progress }));
                                        } : undefined
                                    );
                                    
                                    if (!cachedFile) {
                                        if (file) {
                                            dispatch(completeMediaLoading({ fileId: media.fileId }));
                                        } else {
                                            dispatch(errorMediaLoading({ fileId: media.fileId, error: 'Failed to download from cloud storage' }));
                                        }
                                    }
                                } else {
                                    // For media without Supabase ID, try regular getFile
                                    file = await getFile(media.fileId);
                                }

                                if (!file && !media.isPlaceholder) {
                                    console.warn(`File not found for media ${media.fileName || media.id}`);
                                    return null;
                                }

                                if (!file) {
                                    return null;
                                }

                                return { ...media, src: URL.createObjectURL(file) };
                            } catch (error) {
                                console.error(`Failed to load file for media ${media.fileName || media.id}:`, error);
                                return null;
                            }
                        })
                    )).filter((media): media is MediaFile => media !== null)));
                }
            }
        };
        loadProject();
    }, [dispatch, currentProjectId, user]);


    // save
    useEffect(() => {
        const saveProject = async () => {
            if (!projectState || projectState.id != currentProjectId) return;
            await storeProject(projectState);
            dispatch(updateProject(projectState));
        };
        saveProject();
    }, [projectState, dispatch, currentProjectId]);


    return (
        <div className="fixed inset-0 overflow-hidden bg-[#0f172a]">
            <div className="flex flex-col select-none bg-[#0f172a] editor-container">
                {/* Video Loading Progress Bar */}
                <VideoLoader />
                
                {/* Loading screen */}
                {isLoading && (
                    <div className="fixed inset-0 flex items-center bg-black bg-opacity-50 justify-center z-50">
                        <div className="bg-black bg-opacity-70 p-6 rounded-lg flex flex-col items-center">
                            <div className="w-16 h-16 border-4 border-t-white border-r-white border-opacity-30 border-t-opacity-100 rounded-full animate-spin"></div>
                            <p className="mt-4 text-white text-lg">Loading project...</p>
                        </div>
                    </div>
                )}
                

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden min-h-0">
                    {/* Left Sidebar */}
                    <LeftSidebar />

                    {/* Center - Video Preview */}
                    <div className="flex items-center justify-center flex-col flex-1 overflow-hidden bg-[#0a0e1a] min-w-0">
                        <PreviewPlayer />
                    </div>

                    {/* Right Sidebar */}
                    <RightSidebar />
                </div>

                {/* Timeline at bottom - ensure it's always visible */}
                <div className="flex flex-row border-t border-slate-800 bg-[#0f172a] z-1 flex-shrink-0 overflow-visible" style={{ zIndex: 1 }}>
                    <div className="flex-1 flex flex-col !z-1 min-w-0 overflow-visible">
                        <Timeline />
                    </div>
                </div>

                {/* Upgrade Modal */}
                <UpgradeModal
                    isOpen={showUpgradeModal}
                    onClose={() => setShowUpgradeModal(false)}
                    usedCount={creditsUsed}
                    limitCount={creditsLimit}
                />
            </div>
        </div>
    );
}
