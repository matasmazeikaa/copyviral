export type MediaType = 'video' | 'audio' | 'image' | 'unknown';

export interface UploadedFile {
    id: string;
    file: File;
    type?: MediaType;
    src?: string;
}

export interface MediaFile {
    id: string;
    fileName: string;
    fileId: string;
    type: MediaType;
    startTime: number;  // within the source video
    src?: string;
    endTime: number;
    positionStart: number;  // position in the final video
    positionEnd: number;
    includeInMerge: boolean;
    playbackSpeed: number;
    volume: number;
    zIndex: number;

    // Optional visual settings
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;

    // Effects
    crop?: { x: number; y: number; width: number; height: number };

    // Aspect ratio and zoom
    aspectRatioFit?: 'original' | '1:1' | 'cover' | '16:9';
    zoom?: number; // Zoom level (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
    originalWidth?: number; // Original video width
    originalHeight?: number; // Original video height

    // Placeholder support
    isPlaceholder?: boolean;
    placeholderType?: MediaType; // Type of media expected for this placeholder

    // Supabase storage reference (for fallback when IndexedDB is cleared)
    supabaseFileId?: string; // The file ID in Supabase storage (format: {fileId}.{ext})
    supabaseFolder?: string | null; // Folder path in Supabase storage
    
    // Upload status
    status?: 'uploading' | 'ready' | 'error';
}

export interface TextElement {
    id: string;
    text: string;                     // The actual text content
    includeInMerge?: boolean;

    // Timing
    positionStart: number;           // When text appears in final video
    positionEnd: number;             // When text disappears

    // Position & Size (canvas-based)
    x: number;
    y: number;
    width?: number;
    height?: number;

    // Styling
    font?: string;                   // Font family (e.g., 'Arial', 'Roboto')
    fontSize?: number;               // Font size in pixels
    color?: string;                  // Text color (hex or rgba)
    backgroundColor?: string;       // Background behind text
    align?: 'left' | 'center' | 'right'; // Horizontal alignment
    zIndex?: number;                 // Layering

    // Effects
    opacity?: number;                // Transparency (0 to 1)
    rotation?: number;               // Rotation in degrees
    fadeInDuration?: number;        // Seconds to fade in
    fadeOutDuration?: number;       // Seconds to fade out
    animation?: 'slide-in' | 'zoom' | 'bounce' | 'none'; // Optional animation

    // Runtime only (not persisted)
    visible?: boolean;              // Internal flag for rendering logic
}


export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'mov';

// For compatibility with geminiService
export interface AppSettings {
  videoMode: 'cover' | 'fit' | 'square';
  videoScale: number;
}

// Partial TextLayer type for video analysis (maps to TextElement)
export interface TextLayer {
  content: string;
  start: number;
  duration: number;
  verticalPos: number;
  fontSize: number;
}

export interface ExportConfig {
    resolution: string;
    quality: string;
    speed: string;
    fps: number; // TODO: add this as an option
    format: ExportFormat; // TODO: add this as an option
    includeSubtitles: boolean; // TODO: add this as an option
}

export type ActiveElement = 'media' | 'text' | 'export' | 'AI';


export interface ProjectState {
    id: string;
    mediaFiles: MediaFile[];
    textElements: TextElement[];
    filesID?: string[],
    currentTime: number;
    isPlaying: boolean;
    isMuted: boolean;
    duration: number;
    zoomLevel: number;
    timelineZoom: number;
    enableMarkerTracking: boolean;
    projectName: string;
    createdAt: string;
    lastModified: string;
    activeSection: ActiveElement;
    activeElement: ActiveElement | null;
    activeElementIndex: number;

    resolution: { width: number; height: number };
    fps: number;
    aspectRatio: string;
    history: ProjectState[]; // stack for undo
    future: ProjectState[]; // stack for redo
    exportSettings: ExportConfig;
}

export interface AudioTrack {
    name: string;
    // Add other audio track properties as needed
}

export interface UserStats {
    isPremium: boolean;
    creditsUsed: number;
    creditsLimit: number;
}

export interface LibraryItem {
    id: string;
    name: string;
    url: string;
    type?: MediaType;
    size?: number;
    createdAt?: string;
    status?: 'uploading' | 'completed' | 'error';
    folder?: string | null; // Folder path (null or empty string = root)
    thumbnailUrl?: string | null; // URL to thumbnail image for video files
}

export interface MediaFolder {
    id: string;
    name: string;
    path: string; // Full path relative to user folder
    createdAt?: string;
    itemCount?: number;
}

export const mimeToExt = {
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/webm': 'webm',
    // TODO: Add more as needed
};

// ============================================
// Template Types
// ============================================

/**
 * A slot in a template representing a placeholder for video content
 * Similar to MediaFile but specifically for template structure
 */
export interface TemplateSlot {
    id: string;
    index: number;                    // Order in the template (1, 2, 3...)
    duration: number;                 // Duration in seconds
    positionStart: number;            // Start position in timeline
    positionEnd: number;              // End position in timeline
    
    // Visual positioning (optional, for preview)
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    
    // Media type expected
    mediaType: MediaType;
    
    // Supabase storage reference (for persistent image/video files)
    supabaseFileId?: string;          // The file ID in Supabase storage (format: {fileId}.{ext})
    supabaseFolder?: string | null;   // Folder path in Supabase storage
    fileName?: string;                // Original filename for restoration
}

/**
 * Text element in a template - editable by users
 */
export interface TemplateTextElement {
    id: string;
    text: string;                     // Default/example text
    positionStart: number;
    positionEnd: number;
    x: number;
    y: number;
    fontSize?: number;
    color?: string;
    font?: string;
    align?: 'left' | 'center' | 'right';
    
    // Template-specific
    isEditable: boolean;              // Can user edit this text?
    placeholder?: string;             // Hint for the user
}

/**
 * Static image in a template - not changeable by users
 * Images are saved with the template and displayed as-is
 */
export interface TemplateImage {
    id: string;
    positionStart: number;
    positionEnd: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
    
    // Supabase storage reference (required for images)
    supabaseFileId: string;
    supabaseFolder?: string | null;
    fileName: string;
}

/**
 * Template data structure stored in JSONB
 */
export interface TemplateData {
    slots: TemplateSlot[];            // Video placeholders (user fills these)
    textElements: TemplateTextElement[];
    images?: TemplateImage[];         // Static images (saved with template, not changeable)
    
    // Video settings
    resolution: { width: number; height: number };
    fps: number;
    aspectRatio: string;
    
    // Audio (optional reference audio from original)
    audioFileUrl?: string;           // Deprecated: blob URL (not persistent)
    audioDuration?: number;
    audioSupabaseFileId?: string;    // Supabase storage file ID for persistent audio
    audioFileName?: string;          // Original filename for the audio
    audioFolder?: string | null;     // Folder path in Supabase storage for audio
}

/**
 * Template type identifier
 */
export type TemplateType = 'community' | 'personal';

/**
 * Unified Template interface - stored in single table with type discriminator
 * 
 * - Community templates: type='community', userId=null, admin-managed
 * - Personal templates: type='personal', userId=<user-id>, user-managed
 */
export interface Template {
    id: string;
    type: TemplateType;
    userId: string | null;          // null for community, user id for personal
    name: string;
    description?: string | null;    // mainly for community templates
    thumbnailUrl?: string | null;
    viewCount: number;              // mainly for community templates
    sourceUrl?: string | null;      // mainly for community templates
    templateData: TemplateData;
    isActive: boolean;
    category: string;               // mainly for community templates
    createdAt: string;
    updatedAt: string;
}

/**
 * Community template - type alias for clarity
 */
export type CommunityTemplate = Template & { type: 'community'; userId: null };

/**
 * User's personal template - type alias for clarity
 */
export type UserTemplate = Template & { type: 'personal'; userId: string };