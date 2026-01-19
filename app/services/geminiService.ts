import { GoogleGenAI, Type } from "@google/genai";
import { TextLayer, AppSettings } from "../types";
import { DEFAULT_TEXT_STYLE } from "../constants";

// CAUTION: In a real production app, you should NEVER expose API keys in the frontend code.
// This should be proxied through a backend.
// For this demo, we assume process.env.API_KEY is available.

const apiKey = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey });

// Helper to convert File to Base64 string (without header)
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:video/mp4;base64,")
      const data = base64String.split(",")[1];
      resolve(data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generateViralTitle = async (context: string): Promise<string> => {
  try {
    if (!apiKey) {
      console.warn("Gemini API Key is missing. Using fallback.");
      return "Viral Edit 🔥";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a single, short, viral, catchy Instagram caption (max 4 words) based on this context: "${context}". Do not use quotes. Include one emoji.`,
    });

    return response.text?.trim() || "Viral Edit 🔥";
  } catch (error) {
    console.error("Error generating title:", error);
    return "My Epic Edit";
  }
};

// Response schema for video analysis
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

const VIDEO_ANALYSIS_PROMPT = `Act as a **Frame-Perfect Video Telemetry Engine**. Your objective is to convert visual video data into precise, machine-readable JSON.

**CRITICAL PROCESSING RULES:**
1. **Step-by-Step Analysis:** Before generating JSON, internally scan the video timeline to map visual anchors.
2. **Zero-Guessing Policy:** If a text overlay is blurry, mark it as "[UNCLEAR]". Do not invent text.
3. **Coordinate Space:** Use a standard **1080x1920 (9:16)** grid.
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
   - Detect **Transitions** (Dissolves/Fades) -> Mark the cut at the 50% opacity point.
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
TASK 3 — TEXT & OCR EXTRACTION
---------------------------------------------------------
Extract every distinct text layer. Handle "Pop-in" captions as separate events.

- **Transcription:** Case-sensitive, punctuation-perfect.
- **Type Classification:**
   - caption: Spoken words/subtitles (usually bottom center).
   - label: UI elements, names, or context tags.
   - title: Large distinct headers.
- **Geometry:**
   - bbox: [x, y, width, height] in pixels (approximate based on 1080x1920 grid).
   - color: Dominant text color (e.g., "white", "yellow").
   - position: "top", "middle", or "bottom" (based on Y-axis).

Return ONLY the JSON object with meta, shots, layout, and text_layers fields.`;

// Single analysis run
const runSingleAnalysis = async (
  base64Data: string,
  mimeType: string
): Promise<any> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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

// Helper to find similar text layers and merge them
const mergeTextLayers = (allLayers: any[][]): any[] => {
  // Flatten all layers with their source index
  const flatLayers: { layer: any; source: number }[] = [];
  allLayers.forEach((layers, sourceIdx) => {
    layers.forEach((layer) => {
      flatLayers.push({ layer, source: sourceIdx });
    });
  });

  if (flatLayers.length === 0) return [];

  // Group similar text layers (same content appearing in multiple analyses)
  const groups: { layer: any; source: number }[][] = [];

  for (const item of flatLayers) {
    // Find existing group with similar content and overlapping time
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

  // For each group, merge into a single layer (prefer layers found in 2+ analyses)
  const merged: any[] = [];
  for (const group of groups) {
    // Only include if found in at least 2 analyses (consensus) or if only 1 analysis worked
    const uniqueSources = new Set(group.map((g) => g.source));
    if (uniqueSources.size >= 2 || allLayers.filter((l) => l.length > 0).length < 2) {
      // Average the numeric values
      const starts = group.map((g) => g.layer.start || 0);
      const ends = group.map((g) => g.layer.end || 0);
      const bboxes = group
        .map((g) => g.layer.bbox)
        .filter((b) => Array.isArray(b) && b.length >= 4);

      const mergedLayer: any = {
        content: group[0].layer.content,
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
  }

  // Sort by start time
  return merged.sort((a, b) => a.start - b.start);
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

export const analyzeReferenceVideo = async (
  file: File
): Promise<{
  durations: number[];
  textLayers: Partial<TextLayer>[];
  settings: Partial<AppSettings>;
}> => {
  try {
    if (!apiKey) {
      // Fallback mock data if no key
      return {
        durations: [1.5, 0.5, 0.5, 1.0, 2.0, 0.5],
        textLayers: [
          {
            content: "Wait for it... 😲",
            start: 0,
            duration: 2,
            verticalPos: 50,
            fontSize: 60,
          },
        ],
        settings: {
          videoMode: "cover",
          videoScale: 1.0,
        },
      };
    }

    const base64Data = await fileToGenerativePart(file);
    const mimeType = file.type || "video/mp4";

    // Run 3 analyses in parallel for consensus
    console.log("Running 3 parallel video analyses for consensus...");
    const analysisPromises = [
      runSingleAnalysis(base64Data, mimeType).catch((e) => {
        console.warn("Analysis 1 failed:", e);
        return null;
      }),
      runSingleAnalysis(base64Data, mimeType).catch((e) => {
        console.warn("Analysis 2 failed:", e);
        return null;
      }),
      runSingleAnalysis(base64Data, mimeType).catch((e) => {
        console.warn("Analysis 3 failed:", e);
        return null;
      }),
    ];

    const results = await Promise.all(analysisPromises);
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
    const modeMapping: Record<string, AppSettings["videoMode"]> = {
      fill: "cover",
      fit: "fit",
      floating: "square",
    };
    const finalMode: AppSettings["videoMode"] = modeMapping[consensusMode] || "cover";

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
    const mappedLayers: Partial<TextLayer>[] = mergedTextLayers.map((l: any) => {
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
      } as Partial<TextLayer>;
    });

    console.log("Consensus result:", {
      durations,
      textLayers: mappedLayers,
      settings: { videoMode: finalMode, videoScale },
    });

    return {
      durations: durations.length > 0 ? durations : [2, 2, 2],
      textLayers: mappedLayers,
      settings: {
        videoMode: finalMode,
        videoScale,
      },
    };
  } catch (error) {
    console.error("Error analyzing video:", error);
    return {
      durations: [2.0, 1.0, 1.0, 0.5, 0.5, 2.0],
      textLayers: [],
      settings: { videoMode: "cover", videoScale: 1.0 },
    };
  }
};
