import { Middleware } from '@reduxjs/toolkit';
import { saveProjectToSupabase } from '../../services/projectService';

// Debounce helper to prevent too many saves
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 1000; // Save 1 second after last action

// Track if we're currently saving to prevent duplicate saves
let isSaving = false;

/**
 * Redux middleware that automatically saves project state to Supabase
 * after every action that modifies the project state.
 * 
 * This runs asynchronously and doesn't block the UI.
 */
export const supabaseSyncMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState();

  // Only save if we have a current project
  const currentProjectId = state.projects.currentProjectId;
  const projectState = state.projectState;

  // Check if this action might have modified the project state
  // We'll save for any action except internal sync actions
  if (
    currentProjectId &&
    projectState.id === currentProjectId &&
    action.type !== 'projectState/rehydrate' && // Don't save on rehydration
    action.type !== 'projects/rehydrateProjects' && // Don't save on projects rehydration
    typeof window !== 'undefined' // Only run in browser
  ) {
    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set up debounced save
    saveTimeout = setTimeout(async () => {
      // Get user ID from Supabase client
      try {
        const { createClient } = await import('../../utils/supabase/client');
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError) {
          console.warn('User not authenticated, skipping Supabase save:', userError);
          return;
        }

        if (user && !isSaving) {
          isSaving = true;
          
          // Save to Supabase asynchronously (don't await to avoid blocking)
          saveProjectToSupabase(projectState, user.id)
            .then(() => {
              // Optionally log success in development
              if (process.env.NODE_ENV === 'development') {
                console.log('Project auto-saved to Supabase');
              }
            })
            .catch((error) => {
              console.error('Failed to auto-save project to Supabase:', error);
            })
            .finally(() => {
              isSaving = false;
            });
        }
      } catch (error) {
        console.error('Error in supabase sync middleware:', error);
        isSaving = false;
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return result;
};

