import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient, createAdminClient } from "@/app/utils/supabase/server";

// Storage constants
const STORAGE_BUCKET = 'media-library';

const apiKey = process.env.GEMINI_API_KEY;

const VIDEO_ANALYSIS_PROMPT = `Act as a **Frame-Perfect Video Telemetry Engine**. Your objective is to convert visual video data into precise, machine-readable JSON.

**CRITICAL PROCESSING RULES:**
1. **Step-by-Step Analysis:** Before generating JSON, internally scan the video timeline to map visual anchors.
2. **Zero-Guessing Policy:** If a text overlay is blurry, mark it as "[UNCLEAR]". Do not invent text.
3. **NO AUDIO TRANSCRIPTION:** Do NOT transcribe spoken words/audio. Only detect text VISUALLY RENDERED on screen as graphics. If no on-screen text exists, text_layers must be empty [].
4. **Coordinate Space:** Use a standard **1080x1920 (9:16)** grid.
   - X: 0 (Left) -> 1080 (Right)
   - Y: 0 (Top) -> 1920 (Bottom)
4. **Consistency Check:** The sum of all shot durations MUST match the total video length exactly.

---------------------------------------------------------
TASK 1 — SHOT SEGMENTATION (Scene Detection)
---------------------------------------------------------
Analyze the video to identify every distinct "Shot."
- A **"Shot"** is defined as a continuous sequence from a single camera angle/source.
- **CUT LOGIC:**
   - Detect **Hard Cuts** (instant change).
   - Ignore **Motion** (Pans, Tilts, Zooms do NOT count as cuts).

*Required Output Data per Shot:*
- index: Sequential ID (1, 2, 3...).
- start: Timestamp (seconds, 2 decimals).
- end: Timestamp (seconds, 2 decimals).
- duration: Exact difference (end - start).
- type: "static" (camera is still) or "dynamic" (camera moves).

---------------------------------------------------------
TASK 2 — VIEWPORT & LAYOUT BOUNDING BOXES
---------------------------------------------------------
For the *majority* of the video, determine the "Active Video Area" (excluding black bars/blur backgrounds).

- **Mode Logic:**
   - fill: Content touches all 4 edges (Standard 9:16).
   - fit: Content touches left/right edges, but has black bars top/bottom (16:9 or 4:3 content).
   - floating: Content does not touch edges (e.g., Picture-in-Picture).

- **Active Region:**
   - Estimate the [x, y, width, height] of the actual video content in pixels (relative to the 1080x1920 canvas).

---------------------------------------------------------
TASK 3 — VISIBLE TEXT OVERLAY EXTRACTION (OCR Only)
---------------------------------------------------------
Extract ONLY text that is **visually rendered as graphics/overlays** on the video frames.

**CRITICAL: DO NOT transcribe audio/speech. DO NOT include spoken words. ONLY detect text that you can SEE rendered on screen as visual graphics.**

If no visible text overlays exist in the video, return an empty text_layers array: []

- **What to detect:** Text graphics, titles, captions burned into the video, watermarks, labels, on-screen text
- **What to IGNORE:** Spoken audio, narration, dialogue - these are NOT text layers
- **Transcription:** Case-sensitive, punctuation-perfect for visible text only.
- **Type Classification:**
   - caption: Subtitle text visually burned into video frames (not auto-generated from audio).
   - label: UI elements, names, or context tags rendered on screen.
   - title: Large distinct headers/titles visible on screen.
- **Geometry:**
   - bbox: [x, y, width, height] in pixels (approximate based on 1080x1920 grid).
   - color: Dominant text color (e.g., "white", "yellow").
   - position: "top", "middle", or "bottom" (based on Y-axis).

Return ONLY the JSON object with meta, shots, layout, and text_layers fields.`;

// Response schema for video analysis (matching geminiService.ts)
const videoAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    meta: {
      type: Type.OBJECT,
      properties: {
        total_duration: { type: Type.NUMBER },
        fps_basis: { type: Type.NUMBER },
      },
    },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.NUMBER },
          start: { type: Type.NUMBER },
          end: { type: Type.NUMBER },
          duration: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["static", "dynamic"] },
        },
      },
    },
    layout: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ["fill", "fit", "floating"] },
        active_region: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
          },
        },
      },
    },
    text_layers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          start: { type: Type.NUMBER },
          end: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["caption", "label", "title"] },
          position: { type: Type.STRING, enum: ["top", "middle", "bottom"] },
          bbox: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
          },
          color: { type: Type.STRING },
        },
      },
    },
  },
};

// Helper to find majority vote
const majorityVote = <T>(items: T[]): T => {
  const counts = new Map<string, { count: number; item: T }>();
  for (const item of items) {
    const key = JSON.stringify(item);
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, item });
    }
  }
  let maxCount = 0;
  let winner = items[0];
  Array.from(counts.values()).forEach(({ count, item }) => {
    if (count > maxCount) {
      maxCount = count;
      winner = item;
    }
  });
  return winner;
};

// Helper to average numbers
const average = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

// Merge multiple shot arrays - pick the most common shot count, then average durations
const mergeShots = (allShots: any[][]): any[] => {
  if (allShots.length === 0) return [];

  // Find the most common shot count
  const shotCounts = allShots.map((s) => s.length);
  const targetCount = majorityVote(shotCounts);

  // Filter to analyses with that shot count
  const matchingAnalyses = allShots.filter((s) => s.length === targetCount);

  if (matchingAnalyses.length === 0) {
    // Fallback: use the first non-empty analysis
    return allShots.find((s) => s.length > 0) || [];
  }

  // Average the durations for each shot index
  const mergedShots: any[] = [];
  for (let i = 0; i < targetCount; i++) {
    const shotsAtIndex = matchingAnalyses.map((a) => a[i]).filter(Boolean);
    if (shotsAtIndex.length > 0) {
      mergedShots.push({
        index: i + 1,
        start: average(shotsAtIndex.map((s) => s.start || 0)),
        end: average(shotsAtIndex.map((s) => s.end || 0)),
        duration: average(shotsAtIndex.map((s) => s.duration || 0)),
        type: majorityVote(shotsAtIndex.map((s) => s.type || "static")),
      });
    }
  }

  return mergedShots;
};

// Merge text layers from multiple analyses
const mergeTextLayers = (allLayers: any[][]): any[] => {
  const flatLayers: { layer: any; source: number }[] = [];
  allLayers.forEach((layers, sourceIdx) => {
    layers.forEach((layer) => {
      flatLayers.push({ layer, source: sourceIdx });
    });
  });

  if (flatLayers.length === 0) return [];

  // Group similar text layers
  const groups: { layer: any; source: number }[][] = [];

  for (const item of flatLayers) {
    let foundGroup = false;
    for (const group of groups) {
      const representative = group[0].layer;
      // Check if content matches (case-insensitive, trimmed)
      const contentMatch =
        (item.layer.content || "").toLowerCase().trim() ===
        (representative.content || "").toLowerCase().trim();
      // Check if times overlap (within 0.5s tolerance)
      const timeOverlap =
        Math.abs((item.layer.start || 0) - (representative.start || 0)) < 0.5;

      if (contentMatch && timeOverlap) {
        group.push(item);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      groups.push([item]);
    }
  }

  // For each group, merge into a single layer (require strict consensus: found in 2+ analyses)
  const merged: any[] = [];
  const validAnalysesCount = allLayers.filter((l) => l.length > 0).length;
  
  for (const group of groups) {
    const uniqueSources = new Set(group.map((g) => g.source));
    const content = (group[0].layer.content || "").trim();
    
    // Filter out unclear or empty text
    if (!content || content === "[UNCLEAR]" || content.toLowerCase() === "unclear") {
      continue;
    }
    
    // Require text to be found in at least 2 analyses for consensus (stricter filtering)
    // This helps filter out AI hallucinations that only appear in one analysis
    if (uniqueSources.size < 2 && validAnalysesCount >= 2) {
      continue;
    }
    
    // Average the numeric values
    const starts = group.map((g) => g.layer.start || 0);
    const ends = group.map((g) => g.layer.end || 0);
    const bboxes = group
      .map((g) => g.layer.bbox)
      .filter((b) => Array.isArray(b) && b.length >= 4);

    const mergedLayer: any = {
      content: content,
      start: average(starts),
      end: average(ends),
      type: majorityVote(group.map((g) => g.layer.type || "caption")),
      position: majorityVote(group.map((g) => g.layer.position || "middle")),
    };

    // Average bbox if available
    if (bboxes.length > 0) {
      mergedLayer.bbox = [
        average(bboxes.map((b) => b[0])),
        average(bboxes.map((b) => b[1])),
        average(bboxes.map((b) => b[2])),
        average(bboxes.map((b) => b[3])),
      ];
    }

    merged.push(mergedLayer);
  }

  // Sort by start time
  return merged.sort((a, b) => a.start - b.start);
};

// Single analysis run
const runSingleAnalysis = async (
  ai: GoogleGenAI,
  base64Data: string,
  mimeType: string
): Promise<any> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        { text: VIDEO_ANALYSIS_PROMPT },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: videoAnalysisSchema,
    },
  });

  const jsonText = response.text?.trim() || "{}";
  return JSON.parse(jsonText);
};

const FREE_TIER_LIMIT = 3;

// Special folder for AI reference videos (hidden from media library)
const AI_REFERENCE_FOLDER = '_ai_ref';

/**
 * Helper to upload file to Supabase storage
 * AI reference videos are stored in a special folder to keep them separate from user's media library
 */
async function uploadToSupabase(
  supabase: any,
  userId: string,
  fileBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<{ supabaseFileId: string; filePath: string; folder: string } | null> {
  try {
    const fileId = crypto.randomUUID();
    const fileExt = fileName.split('.').pop() || 'mp4';
    // Store in special AI reference folder to hide from media library
    const storagePath = `${userId}/${AI_REFERENCE_FOLDER}/${fileId}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    
    if (error) {
      console.error('Failed to upload to Supabase storage:', error);
      return null;
    }
    
    return {
      supabaseFileId: `${fileId}.${fileExt}`,
      filePath: storagePath,
      folder: AI_REFERENCE_FOLDER,
    };
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    return null;
  }
}

/**
 * Helper to download video from URL
 */
async function downloadVideoFromUrl(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string; fileName: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClipJS/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const mimeType = contentType.split(';')[0].trim();
    
    // Extract filename from URL or generate one
    const urlPath = new URL(url).pathname;
    const fileName = urlPath.split('/').pop() || `video_${Date.now()}.mp4`;
    
    return { buffer, mimeType, fileName };
  } catch (error) {
    console.error('Error downloading video from URL:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check AI usage limits before processing
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscriptionStatus, aiGenerationsUsed')
      .eq('id', user.id)
      .single();

    const subscriptionStatus = profile?.subscriptionStatus || 'free';
    const aiGenerationsUsed = profile?.aiGenerationsUsed || 0;
    const isPremium = subscriptionStatus === 'active';

    if (!isPremium && aiGenerationsUsed >= FREE_TIER_LIMIT) {
      return NextResponse.json(
        { error: "AI generation limit reached. Please upgrade to Pro for unlimited generations." },
        { status: 403 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Get the form data - can have either a file or a URL
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const videoUrl = formData.get("url") as string | null;

    let arrayBuffer: ArrayBuffer;
    let mimeType: string;
    let fileName: string;

    if (file) {
      // Direct file upload
      arrayBuffer = await file.arrayBuffer();
      mimeType = file.type || "video/mp4";
      fileName = file.name || `video_${Date.now()}.mp4`;
    } else if (videoUrl) {
      // Download from URL
      const downloaded = await downloadVideoFromUrl(videoUrl);
      if (!downloaded) {
        return NextResponse.json(
          { error: "Failed to download video from URL" },
          { status: 400 }
        );
      }
      arrayBuffer = downloaded.buffer;
      mimeType = downloaded.mimeType;
      fileName = downloaded.fileName;
    } else {
      return NextResponse.json(
        { error: "No file or URL provided" },
        { status: 400 }
      );
    }

    // Upload video to Supabase storage for audio persistence
    const uploadResult = await uploadToSupabase(
      supabase,
      user.id,
      arrayBuffer,
      fileName,
      mimeType
    );

    // Convert to base64 for AI analysis
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // Run 3 analyses in parallel for consensus
    console.log("Running 3 parallel video analyses for consensus...");
    const analysisPromises = [
      runSingleAnalysis(ai, base64Data, mimeType).catch((e) => {
        console.warn("Analysis 1 failed:", e);
        return null;
      }),
      runSingleAnalysis(ai, base64Data, mimeType).catch((e) => {
        console.warn("Analysis 2 failed:", e);
        return null;
      }),
      runSingleAnalysis(ai, base64Data, mimeType).catch((e) => {
        console.warn("Analysis 3 failed:", e);
        return null;
      }),
    ];

    const results = await Promise.all(analysisPromises);


    console.log("Results:", results);
    const validResults = results.filter((r) => r !== null);

    console.log(`${validResults.length}/3 analyses succeeded`);
    validResults.forEach((r, i) => console.log(`Analysis ${i + 1}:`, r));

    if (validResults.length === 0) {
      throw new Error("All analyses failed");
    }

    // Consensus: Layout mode (majority vote)
    const layoutModes = validResults
      .map((r) => r.layout?.mode)
      .filter(Boolean);
    const consensusMode = majorityVote(layoutModes) || "fill";

    // Map layout mode: "fill" -> "cover", "fit" -> "fit", "floating" -> "square"
    const modeMapping: Record<string, string> = {
      fill: "cover",
      fit: "fit",
      floating: "square",
    };
    const finalMode = modeMapping[consensusMode] || "cover";

    // Consensus: Video scale (average of all active regions)
    const activeRegions = validResults
      .map((r) => r.layout?.active_region)
      .filter(Boolean);
    let videoScale = 1.0;
    if (activeRegions.length > 0) {
      const scales = activeRegions.map((region: any) => {
        const widthRatio = (region.width || 1080) / 1080;
        const heightRatio = (region.height || 1920) / 1920;
        return Math.min(widthRatio, heightRatio);
      });
      videoScale = average(scales);
    }

    // Consensus: Shots (merge with majority vote on count, then average)
    const allShots = validResults.map((r) => r.shots || []);
    const mergedShots = mergeShots(allShots);
    const durations: number[] = mergedShots.map((shot: any) =>
      typeof shot.duration === "number" ? Number(shot.duration.toFixed(2)) : 2.0
    );

    // Consensus: Text layers (merge similar texts found across analyses)
    const allTextLayers = validResults.map((r) => r.text_layers || []);
    const mergedTextLayers = mergeTextLayers(allTextLayers);

    // Map merged text_layers to TextLayer format
    const mappedLayers = mergedTextLayers.map((l: any) => {
      const start = typeof l.start === "number" ? l.start : 0;
      const end = typeof l.end === "number" ? l.end : start + 2;
      const duration = end - start;

      // Get vertical position from bbox[1] (y coordinate) or position string
      let verticalPos = 960;
      if (l.bbox && Array.isArray(l.bbox) && l.bbox.length >= 2) {
        verticalPos = l.bbox[1];
      } else if (l.position) {
        const positionMapping: Record<string, number> = {
          top: 320,
          middle: 960,
          bottom: 1600,
        };
        verticalPos = positionMapping[l.position] || 960;
      }

      // Estimate font size from bbox height or use defaults based on type
      let fontSize = 48;
      if (l.bbox && Array.isArray(l.bbox) && l.bbox.length >= 4) {
        fontSize = Math.round((l.bbox[3] || 100) * 0.7);
      } else if (l.type) {
        const fontSizeMapping: Record<string, number> = {
          title: 72,
          caption: 42,
          label: 36,
        };
        fontSize = fontSizeMapping[l.type] || 48;
      }

      return {
        content: l.content || "Text",
        start: Number(start.toFixed(2)),
        duration: Number(duration.toFixed(2)),
        verticalPos: Math.round(verticalPos),
        fontSize,
      };
    });

    console.log("Consensus result:", {
      durations,
      textLayers: mappedLayers,
      settings: { videoMode: finalMode, videoScale },
    });

    // Increment AI generation usage for non-premium users
    // Use admin client to bypass RLS restrictions on aiGenerationsUsed
    if (!isPremium) {
      const adminClient = createAdminClient();
      const { error: updateError } = await adminClient
        .from('user_profiles')
        .update({
          aiGenerationsUsed: aiGenerationsUsed + 1,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('Failed to increment AI usage:', updateError);
      }
    }

    // Calculate total duration for audio
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return NextResponse.json({
      durations: durations.length > 0 ? durations : [2, 2, 2],
      textLayers: mappedLayers,
      settings: {
        videoMode: finalMode,
        videoScale,
      },
      // Audio file info from Supabase upload (for persistence)
      audio: uploadResult ? {
        supabaseFileId: uploadResult.supabaseFileId,
        fileName: fileName,
        duration: totalDuration,
        folder: uploadResult.folder, // Folder path for fetching
      } : null,
    });
  } catch (error: any) {
    console.error("Error analyzing video:", error);

    // Check for 503 overloaded error
    const isOverloaded =
      error?.error?.code === 503 ||
      error?.code === 503 ||
      error?.message?.includes("overloaded") ||
      error?.error?.message?.includes("overloaded");

    if (isOverloaded) {
      return NextResponse.json(
        { error: "The AI model is currently overloaded. Please try again later.", code: 503 },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to analyze video" },
      { status: 500 }
    );
  }
}
