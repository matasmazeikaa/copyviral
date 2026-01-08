import { createClient } from '../utils/supabase/client';
import { ProjectState } from '../types';

/**
 * Service for persisting project state to Supabase
 * All operations are async and handle errors gracefully
 */

export interface ProjectRecord {
  id: string;
  userId: string;
  projectName: string;
  createdAt: string;
  lastModified: string;
  projectData?: ProjectState; // Optional since listProjectsFromSupabase doesn't return full data
}

/**
 * Save or update a project in Supabase
 * @param project - The project state to save
 * @param userId - The user ID who owns the project
 * @returns The saved project ID or null if failed
 */
export async function saveProjectToSupabase(
  project: ProjectState,
  userId: string
): Promise<string | null> {
  try {
    const supabase = createClient();
    
    // Prepare project data for storage (exclude history/future as they can be large)
    const { history, future, ...projectData } = project;

    const { data, error } = await supabase
      .from('projects')
      .upsert({
        id: project.id,
        userId: userId,
        projectName: project.projectName || 'Untitled Project',
        createdAt: project.createdAt || new Date().toISOString(),
        lastModified: new Date().toISOString(),
        projectData: projectData,
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving project to Supabase:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('Exception saving project to Supabase:', error);
    return null;
  }
}

/**
 * Load a project from Supabase
 * @param projectId - The project ID to load
 * @param userId - The user ID (for security check)
 * @returns The project state or null if not found
 */
export async function loadProjectFromSupabase(
  projectId: string,
  userId: string
): Promise<ProjectState | null> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('userId', userId)
      .single();

    if (error) {
      console.error('Error loading project from Supabase:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Restore the project state with empty history/future
    const projectState: ProjectState = {
      ...data.projectData,
      history: [],
      future: [],
    };

    return projectState;
  } catch (error) {
    console.error('Exception loading project from Supabase:', error);
    return null;
  }
}

/**
 * List all projects for a user
 * @param userId - The user ID
 * @returns Array of project records
 */
export async function listProjectsFromSupabase(
  userId: string
): Promise<ProjectRecord[]> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('projects')
      .select('id, userId, projectName, createdAt, lastModified')
      .eq('userId', userId)
      .order('lastModified', { ascending: false });

    if (error) {
      console.error('Error listing projects from Supabase:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception listing projects from Supabase:', error);
    return [];
  }
}

/**
 * Delete a project from Supabase
 * @param projectId - The project ID to delete
 * @param userId - The user ID (for security check)
 * @returns true if successful, false otherwise
 */
export async function deleteProjectFromSupabase(
  projectId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('userId', userId);

    if (error) {
      console.error('Error deleting project from Supabase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception deleting project from Supabase:', error);
    return false;
  }
}

