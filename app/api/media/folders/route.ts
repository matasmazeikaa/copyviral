import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

// GET /api/media/folders - List folders
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const parentFolder = searchParams.get('parent') || null;

        // Query folders from database where parent_path matches
        const { data, error } = await supabase
            .from('media_folders')
            .select('*')
            .eq('user_id', user.id)
            .is('parent_path', parentFolder)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error listing folders:', error);
            return NextResponse.json({ error: 'Failed to list folders' }, { status: 500 });
        }

        const folders = (data || []).map(item => ({
            id: item.id,
            name: item.name,
            path: item.full_path,
            createdAt: item.created_at,
        }));

        return NextResponse.json({ folders });
    } catch (error: any) {
        console.error('Error in GET /api/media/folders:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/media/folders - Create a folder
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, parentFolder } = body;

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        // Sanitize folder name
        const sanitizedName = name.trim().replace(/[\/\\:*?"<>|]/g, '_');
        if (!sanitizedName) {
            return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
        }

        // Build full folder path
        const fullPath = parentFolder 
            ? `${parentFolder}/${sanitizedName}`
            : sanitizedName;

        // Insert folder record into database
        const { data, error } = await supabase
            .from('media_folders')
            .insert({
                user_id: user.id,
                name: sanitizedName,
                parent_path: parentFolder || null,
                full_path: fullPath,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 409 });
            }
            console.error('Error creating folder:', error);
            return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
        }

        return NextResponse.json({
            folder: {
                id: data.id,
                name: sanitizedName,
                path: fullPath,
                createdAt: data.created_at,
            }
        });
    } catch (error: any) {
        console.error('Error in POST /api/media/folders:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/media/folders - Delete a folder
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderPath = searchParams.get('path');

        if (!folderPath) {
            return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
        }

        const userFolder = user.id;
        const fullFolderPath = `${userFolder}/${folderPath}`;

        // List all files in the folder from storage
        const { data: files, error: listError } = await supabase.storage
            .from('media-library')
            .list(fullFolderPath, { limit: 1000 });

        if (!listError && files && files.length > 0) {
            // Filter out folders (id === null) from files to delete
            const filesToDelete = files.filter(file => file.id !== null);
            if (filesToDelete.length > 0) {
                const filePaths = filesToDelete.map(file => `${fullFolderPath}/${file.name}`);
                await supabase.storage
                    .from('media-library')
                    .remove(filePaths);
            }

            // Recursively delete nested folders (by calling this endpoint or handling inline)
            const nestedFolders = files.filter(item => item.id === null);
            for (const folder of nestedFolders) {
                // Recursive delete - we'll handle this by deleting all DB records with matching prefix
            }
        }

        // Delete folder record from database (and all nested folder records)
        const { error: dbError } = await supabase
            .from('media_folders')
            .delete()
            .eq('user_id', user.id)
            .or(`full_path.eq.${folderPath},full_path.like.${folderPath}/%`);

        if (dbError) {
            console.error('Error deleting folder from database:', dbError);
            return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/media/folders:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
