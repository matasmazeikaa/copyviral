'use client';
import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { openDB } from 'idb';
import projectStateReducer from './slices/projectSlice';
import projectsReducer from './slices/projectsSlice';
import loadingReducer from './slices/loadingSlice';
import { supabaseSyncMiddleware } from './middleware/supabaseSyncMiddleware';
import toast from 'react-hot-toast';

// Create IndexedDB database for files and projects
const setupDB = async () => {
    if (typeof window === 'undefined') return null;
    const db = await openDB('InstaEdit-files', 1, {
        upgrade(db) {
            db.createObjectStore('files', { keyPath: 'id' });
            db.createObjectStore('projects', { keyPath: 'id' });
        },
    });
    return db;
};

// Load state from localStorage
export const loadState = () => {
    if (typeof window === 'undefined') return undefined;
    try {
        const serializedState = localStorage.getItem('InstaEdit-state');
        if (serializedState === null) return undefined;
        return JSON.parse(serializedState);
    } catch (error) {
        toast.error('Error loading state from localStorage');
        console.error('Error loading state from localStorage:', error);
        return undefined;
    }
};

// Save state to localStorage
const saveState = (state: any) => {
    if (typeof window === 'undefined') return;
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem('InstaEdit-state', serializedState);
    } catch (error) {
        console.error('Error saving state to localStorage:', error);
    }
};

// File storage functions
export const storeFile = async (
    file: File, 
    fileId: string, 
    onProgress?: (progress: number) => void
) => {
    if (typeof window === 'undefined') return null;
    try {
        const db = await setupDB();
        if (!db) return null;

        // Simulate progress for large files (IndexedDB doesn't provide native progress)
        // For small files, this will be very fast
        const fileSize = file.size;
        const chunkSize = Math.max(1024 * 1024, fileSize / 100); // 1MB chunks or divide into 100 parts
        
        if (onProgress && fileSize > 1024 * 1024) { // Only show progress for files > 1MB
            // For large files, we'll simulate progress since IndexedDB doesn't provide it
            // We'll update progress in chunks
            const totalChunks = Math.ceil(fileSize / chunkSize);
            for (let i = 0; i <= totalChunks; i++) {
                const progress = Math.min(100, (i / totalChunks) * 100);
                onProgress(progress);
                // Small delay to allow UI updates
                if (i < totalChunks) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        } else if (onProgress) {
            // For small files, just report completion
            onProgress(100);
        }

        const fileData = {
            id: fileId,
            file: file,
        };

        await db.put('files', fileData);
        return fileId;
    } catch (error) {
        toast.error('Error storing file');
        console.error('Error storing file:', error);
        return null;
    }
};

export const getFile = async (fileId: string) => {
    if (typeof window === 'undefined') return null;
    try {
        const db = await setupDB();
        if (!db) return null;

        const fileData = await db.get('files', fileId);
        if (!fileData) return null;

        return fileData.file;
    } catch (error) {
        toast.error('Error retrieving file');
        console.error('Error retrieving file:', error);
        return null;
    }
};

/**
 * Get file from IndexedDB, with fallback to Supabase if not found
 * @param fileId - The local file ID used in IndexedDB
 * @param supabaseFileId - The file ID in Supabase storage (format: {fileId}.{ext})
 * @param originalFileName - The original filename
 * @param userId - The user ID for Supabase access
 * @param onProgress - Optional progress callback for media downloads
 */
export const getFileWithFallback = async (
    fileId: string,
    supabaseFileId: string | undefined,
    originalFileName: string,
    userId: string | null,
    onProgress?: (progress: number) => void
): Promise<File | null> => {
    if (typeof window === 'undefined') return null;
    
    // First, try to get from IndexedDB
    const cachedFile = await getFile(fileId);
    if (cachedFile) {
        return cachedFile;
    }

    // If not found in IndexedDB and we have a Supabase file ID, download from Supabase
    if (supabaseFileId && userId) {
        try {
            const { downloadMediaFileById } = await import('../services/mediaLibraryService');
            const file = await downloadMediaFileById(supabaseFileId, originalFileName, userId);
            
            // Store the downloaded file in IndexedDB for future use
            if (onProgress) {
                await storeFile(file, fileId, onProgress);
            } else {
                await storeFile(file, fileId);
            }
            
            return file;
        } catch (error) {
            console.error('Error downloading file from Supabase fallback:', error);
            toast.error('Failed to load file from cloud storage');
            return null;
        }
    }

    // No fallback available
    return null;
};

export const deleteFile = async (fileId: string) => {
    if (typeof window === 'undefined') return;
    try {
        const db = await setupDB();
        if (!db) return;
        await db.delete('files', fileId);
    } catch (error) {
        toast.error('Error deleting file');
        console.error('Error deleting file:', error);
    }
};

export const listFiles = async () => {
    if (typeof window === 'undefined') return [];
    try {
        const db = await setupDB();
        if (!db) return [];
        return await db.getAll('files');
    } catch (error) {
        toast.error('Error listing files');
        console.error('Error listing files:', error);
        return [];
    }
};

// Project storage functions
export const storeProject = async (project: any) => {
    if (typeof window === 'undefined') return null;
    try {
        const db = await setupDB();

        if (!db) return null;
        if (!project.id || !project.projectName) {
            return null;
        }

        await db.put('projects', project);

        return project.id;
    } catch (error) {
        toast.error('Error storing project');
        console.error('Error storing project:', error);
        return null;
    }
};

export const getProject = async (projectId: string) => {
    if (typeof window === 'undefined') return null;
    try {
        const db = await setupDB();
        if (!db) return null;
        return await db.get('projects', projectId);
    } catch (error) {
        toast.error('Error retrieving project');
        console.error('Error retrieving project:', error);
        return null;
    }
};

export const deleteProject = async (projectId: string) => {
    if (typeof window === 'undefined') return;
    try {
        const db = await setupDB();
        if (!db) return;
        await db.delete('projects', projectId);
    } catch (error) {
        toast.error('Error deleting project');
        console.error('Error deleting project:', error);
    }
};

export const listProjects = async () => {
    if (typeof window === 'undefined') return [];
    try {
        const db = await setupDB();
        if (!db) return [];
        return await db.getAll('projects');
    } catch (error) {
        console.error('Error listing projects:', error);
        return [];
    }
};

const store = configureStore({
    reducer: {
        projectState: projectStateReducer,
        projects: projectsReducer,
        loading: loadingReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(supabaseSyncMiddleware),
});

export { store };
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// TODO: remove old state (localStorage we use indexedDB now) that is not used anymore 

// Load persisted state from localStorage
// const persistedState = loadState();
// if (persistedState) {
//     store.dispatch({
//         type: 'REPLACE_STATE',
//         payload: persistedState
//     });
// }

// TODO: for some reason state get saved to localStorage twice when its none cause loss of old state i shall find better way to do this later
// Subscribe to store changes to save to localStorage
// if (typeof window !== 'undefined') {
//     let isInitial = 2;
//     store.subscribe(() => {
//         if (isInitial) {
//             isInitial -= 1;
//             return;
//         }

//         const state = store.getState();
//         saveState(state);
//     });
// }

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector; 