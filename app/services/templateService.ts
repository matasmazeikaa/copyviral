'use client';

import { 
    Template, 
    TemplateData, 
    TemplateSlot, 
    TemplateTextElement,
    TemplateImage,
    ProjectState,
    MediaFile,
    TextElement 
} from '../types';

/**
 * Service for managing templates via API routes
 * Uses unified templates table with type='community' or type='personal'
 * 
 * Community templates: public read, admin-only write (via service role key)
 * Personal templates: user-authenticated CRUD
 */

// ============================================
// Community Templates (via API)
// ============================================

/**
 * List all active community templates
 */
export async function listCommunityTemplates(
    category?: string,
    limit?: number,
    offset?: number
): Promise<Template[]> {
    try {
        const params = new URLSearchParams();
        if (category && category !== 'all') params.set('category', category);
        if (limit) params.set('limit', limit.toString());
        if (offset) params.set('offset', offset.toString());
        
        const response = await fetch(`/api/templates/community?${params.toString()}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch community templates');
        }
        
        const data = await response.json();
        return data.templates || [];
    } catch (error) {
        console.error('Error fetching community templates:', error);
        return [];
    }
}

/**
 * Get a single community template by ID
 */
export async function getCommunityTemplate(
    templateId: string
): Promise<Template | null> {
    try {
        const response = await fetch(`/api/templates/community/${templateId}`);
        
        if (!response.ok) {
            if (response.status === 404) return null;
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch community template');
        }
        
        const data = await response.json();
        return data.template;
    } catch (error) {
        console.error('Error fetching community template:', error);
        return null;
    }
}

// ============================================
// User Templates (Personal) via API
// ============================================

/**
 * List all personal templates for the current user
 */
export async function listUserTemplates(
    limit?: number,
    offset?: number
): Promise<Template[]> {
    try {
        const params = new URLSearchParams();
        if (limit) params.set('limit', limit.toString());
        if (offset) params.set('offset', offset.toString());
        
        const response = await fetch(`/api/templates/personal?${params.toString()}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch user templates');
        }
        
        const data = await response.json();
        return data.templates || [];
    } catch (error) {
        console.error('Error fetching user templates:', error);
        return [];
    }
}

/**
 * Get a single user template by ID
 */
export async function getUserTemplate(
    templateId: string
): Promise<Template | null> {
    try {
        const response = await fetch(`/api/templates/personal/${templateId}`);
        
        if (!response.ok) {
            if (response.status === 404) return null;
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch user template');
        }
        
        const data = await response.json();
        return data.template;
    } catch (error) {
        console.error('Error fetching user template:', error);
        return null;
    }
}

/**
 * Save a new user template or update existing
 */
export async function saveUserTemplate(
    template: {
        id?: string;
        name: string;
        thumbnailUrl?: string | null;
        templateData: TemplateData;
    }
): Promise<string | null> {
    try {
        const isUpdate = !!template.id;
        
        const response = await fetch('/api/templates/personal', {
            method: isUpdate ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: template.id,
                name: template.name,
                thumbnailUrl: template.thumbnailUrl,
                templateData: template.templateData,
            }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save user template');
        }
        
        const data = await response.json();
        return data.template?.id || null;
    } catch (error) {
        console.error('Error saving user template:', error);
        return null;
    }
}

/**
 * Delete a user template
 */
export async function deleteUserTemplate(
    templateId: string
): Promise<boolean> {
    try {
        const response = await fetch(`/api/templates/personal?id=${templateId}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete user template');
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting user template:', error);
        return false;
    }
}

// ============================================
// Template Utilities (Client-side only)
// ============================================

/**
 * Convert a project to template data
 * Extracts slots from video files, static images, and text elements
 * - Videos become slots (user fills these with their own videos)
 * - Images become static content (saved with template, not changeable)
 */
export function projectToTemplateData(project: ProjectState): TemplateData {
    // Convert VIDEO files to template slots (these are EMPTY placeholders - users fill with their own videos)
    // NOTE: We do NOT save video file references here - slots are meant to be filled by users
    const videoFiles = project.mediaFiles.filter(media => media.type === 'video');
    const slots: TemplateSlot[] = videoFiles.map((media, index) => ({
        id: crypto.randomUUID(),
        index: index + 1,
        duration: media.positionEnd - media.positionStart,
        positionStart: media.positionStart,
        positionEnd: media.positionEnd,
        x: media.x,
        y: media.y,
        width: media.width,
        height: media.height,
        mediaType: media.type,
        // NOT saving supabaseFileId, supabaseFolder, fileName - slots should be empty
    }));
    
    // Convert IMAGE files to static template images (not changeable)
    // Only save images that have Supabase file references
    const allImageFiles = project.mediaFiles.filter(media => media.type === 'image');
    const imageFiles = allImageFiles.filter(
        media => media.supabaseFileId && media.fileName
    );
    
    // Log for debugging
    console.log('[Template Save] Total images in project:', allImageFiles.length);
    console.log('[Template Save] Images with Supabase references:', imageFiles.length);
    if (allImageFiles.length > imageFiles.length) {
        console.warn('[Template Save] Some images are missing Supabase references and will NOT be saved:',
            allImageFiles.filter(m => !m.supabaseFileId || !m.fileName).map(m => ({
                fileName: m.fileName,
                supabaseFileId: m.supabaseFileId,
            }))
        );
    }
    
    const images = imageFiles.map(media => ({
        id: crypto.randomUUID(),
        positionStart: media.positionStart,
        positionEnd: media.positionEnd,
        x: media.x,
        y: media.y,
        width: media.width,
        height: media.height,
        zIndex: media.zIndex,
        supabaseFileId: media.supabaseFileId!,
        supabaseFolder: media.supabaseFolder,
        fileName: media.fileName!,
    }));
    
    // Convert text elements to template text elements
    const textElements: TemplateTextElement[] = project.textElements.map(text => ({
        id: crypto.randomUUID(),
        text: text.text,
        positionStart: text.positionStart,
        positionEnd: text.positionEnd,
        x: text.x,
        y: text.y,
        fontSize: text.fontSize,
        color: text.color,
        font: text.font,
        align: text.align,
        isEditable: true,
        placeholder: `Enter ${text.text.length > 20 ? 'text' : text.text}...`,
    }));
    
    // Find audio file if any
    const audioFile = project.mediaFiles.find(media => media.type === 'audio');
    
    return {
        slots,
        textElements,
        images: images.length > 0 ? images : undefined,
        resolution: project.resolution,
        fps: project.fps,
        aspectRatio: project.aspectRatio,
        audioFileUrl: audioFile?.src,
        audioDuration: audioFile ? (audioFile.positionEnd - audioFile.positionStart) : undefined,
        audioSupabaseFileId: audioFile?.supabaseFileId,
        audioFileName: audioFile?.fileName,
        audioFolder: audioFile?.supabaseFolder,
    };
}

/**
 * Convert template data to project-like structure for editing/preview
 * @param audioFile - Optional audio file that was loaded from Supabase storage
 */
export function templateToProjectData(
    template: Template,
    selectedVideos: Map<string, { file: File; src: string }>,
    editedTexts: Map<string, string>,
    audioFile?: { file: File; src: string } | null
): Partial<ProjectState> {
    const templateData = template.templateData;
    
    // Convert slots to media files with selected videos
    const mediaFiles: MediaFile[] = templateData.slots.map(slot => {
        const selectedVideo = selectedVideos.get(slot.id);
        // Check if this slot has a saved file reference (for images/videos saved with template)
        const hasSavedFile = slot.supabaseFileId && slot.fileName;
        
        return {
            id: slot.id,
            fileName: selectedVideo ? 'Selected Video' : (slot.fileName || `Slot ${slot.index}`),
            fileId: selectedVideo ? crypto.randomUUID() : (slot.supabaseFileId || ''),
            type: slot.mediaType,
            startTime: 0,
            endTime: slot.duration,
            positionStart: slot.positionStart,
            positionEnd: slot.positionEnd,
            includeInMerge: true,
            playbackSpeed: 1,
            volume: 50,
            zIndex: 0,
            x: slot.x,
            y: slot.y,
            width: slot.width,
            height: slot.height,
            isPlaceholder: !selectedVideo && !hasSavedFile,
            placeholderType: slot.mediaType,
            src: selectedVideo?.src,
            // Include Supabase storage references for restoration
            supabaseFileId: slot.supabaseFileId,
            supabaseFolder: slot.supabaseFolder,
        };
    });
    
    // Add audio MediaFile if template has audio and we have the audio file loaded
    if (audioFile && templateData.audioSupabaseFileId && templateData.audioDuration) {
        const audioMediaFile: MediaFile = {
            id: crypto.randomUUID(),
            fileName: templateData.audioFileName || 'Template Audio',
            fileId: crypto.randomUUID(),
            type: 'audio',
            startTime: 0,
            endTime: templateData.audioDuration,
            positionStart: 0,
            positionEnd: templateData.audioDuration,
            includeInMerge: true,
            playbackSpeed: 1,
            volume: 50,
            zIndex: 0,
            src: audioFile.src,
            supabaseFileId: templateData.audioSupabaseFileId,
            supabaseFolder: templateData.audioFolder,
        };
        mediaFiles.push(audioMediaFile);
    }
    
    // Convert template text elements to project text elements
    const textElements: TextElement[] = templateData.textElements.map(templateText => ({
        id: templateText.id,
        text: editedTexts.get(templateText.id) || templateText.text,
        positionStart: templateText.positionStart,
        positionEnd: templateText.positionEnd,
        x: templateText.x,
        y: templateText.y,
        fontSize: templateText.fontSize,
        color: templateText.color,
        font: templateText.font,
        align: templateText.align,
    }));
    
    return {
        mediaFiles,
        textElements,
        resolution: templateData.resolution,
        fps: templateData.fps,
        aspectRatio: templateData.aspectRatio,
        duration: Math.max(...templateData.slots.map(s => s.positionEnd), 0),
    };
}

/**
 * Generate random slot assignments for video variations
 */
export function generateRandomAssignments(
    slots: TemplateSlot[],
    videos: { id: string; file: File; src: string }[],
    count: number
): Map<string, { file: File; src: string }>[] {
    const variations: Map<string, { file: File; src: string }>[] = [];
    
    for (let i = 0; i < count; i++) {
        const assignment = new Map<string, { file: File; src: string }>();
        
        // Shuffle videos for this variation
        const shuffledVideos = [...videos].sort(() => Math.random() - 0.5);
        
        // Assign videos to slots (cycle if fewer videos than slots)
        slots.forEach((slot, index) => {
            const videoIndex = index % shuffledVideos.length;
            assignment.set(slot.id, shuffledVideos[videoIndex]);
        });
        
        variations.push(assignment);
    }
    
    return variations;
}

/**
 * Get template by ID and type
 */
export async function getTemplate(
    templateId: string,
    type: 'community' | 'personal'
): Promise<Template | null> {
    if (type === 'community') {
        return getCommunityTemplate(templateId);
    } else {
        return getUserTemplate(templateId);
    }
}
