import { TextElement } from "@/app/types";
import { useAppDispatch, useAppSelector } from "@/app/store";
import { setTextElements, setActiveElement, setActiveElementIndex } from "@/app/store/slices/projectSlice";
import { Sequence } from "remotion";
import { useRef, useState } from "react";

const REMOTION_SAFE_FRAME = 0;

interface SequenceItemOptions {
    handleTextChange?: (id: string, text: string) => void;
    fps: number;
    editableTextId?: string | null;
    currentTime?: number;
}

const calculateFrames = (
    display: { from: number; to: number },
    fps: number
) => {
    const from = display.from * fps;
    const to = display.to * fps;
    const durationInFrames = Math.max(1, to - from);
    return { from, durationInFrames };
};

export const TextSequenceItem: React.FC<{ item: TextElement; options: SequenceItemOptions }> = ({ item, options }) => {
    const { handleTextChange, fps, editableTextId } = options;
    const dispatch = useAppDispatch();
    const { textElements, resolution } = useAppSelector((state) => state.projectState);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef(false);

    const { from, durationInFrames } = calculateFrames(
        {
            from: item.positionStart,
            to: item.positionEnd
        },
        fps
    );

    const onUpdateText = (id: string, updates: Partial<TextElement>) => {
        dispatch(setTextElements(textElements.map(text =>
            text.id === id ? { ...text, ...updates } : text
        )));
    };

    // Handle mouse down - start tracking for drag
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only handle left mouse button
        e.stopPropagation();
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        hasMoved.current = false;
        setIsDragging(false);
    };

    // Handle mouse move - check if dragging
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragStartPos.current) return;
        
        const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
        const deltaY = Math.abs(e.clientY - dragStartPos.current.y);
        const DRAG_THRESHOLD = 5; // pixels
        
        if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
            hasMoved.current = true;
            setIsDragging(true);
        }
    };

    // Handle mouse up - select if click, do nothing if drag
    const handleMouseUp = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only handle left mouse button
        e.stopPropagation();
        
        // Only select if it was a click (no movement)
        if (!hasMoved.current && dragStartPos.current) {
            const index = textElements.findIndex(t => t.id === item.id);
            if (index !== -1) {
                dispatch(setActiveElement('text'));
                dispatch(setActiveElementIndex(index));
            }
        }
        
        // Reset drag state
        dragStartPos.current = null;
        hasMoved.current = false;
        setIsDragging(false);
    };

    // TODO: add more options for text
    const align = item.align || 'center';
    // Calculate transform based on alignment
    // For 'center': shift left by 50% of width to center the text at x position
    // For 'left': no transform (left edge at x position)
    // For 'right': shift left by 100% of width (right edge at x position)
    const transformX = align === 'center' 
        ? 'translateX(-50%)' 
        : align === 'right' 
        ? 'translateX(-100%)' 
        : 'none';

    // Escape HTML to prevent XSS
    const escapeHtml = (text: string) => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // Split text by newlines and render each line separately to prevent wrapping
    const textLines = item.text.split('\n');

    return (
        <Sequence
            className={`designcombo-scene-item id-${item.id} designcombo-scene-item-type-text `}
            key={item.id}
            from={from}
            durationInFrames={durationInFrames + REMOTION_SAFE_FRAME}
            data-track-item="transition-element"
            style={{
                position: "absolute",
                width: 'max-content',
                height: 'fit-content',
                fontSize: item.fontSize || "16px",
                top: item.y,
                left: item.x,
                textAlign: align,
                color: item.color || "#000000",
                zIndex: item.zIndex ?? 0,
                opacity: item.opacity! / 100,
                fontFamily: item.font || "Arial",
                transform: transformX,
            }}
        >
            <div
                data-text-id={item.id}
                style={{
                    height: "100%",
                    boxShadow: "none",
                    outline: "none",
                    backgroundColor: item.backgroundColor || "transparent",
                    position: "relative",
                    width: "max-content",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                    cursor: isDragging ? "grabbing" : "grab",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    // Reset if mouse leaves while dragging
                    dragStartPos.current = null;
                    hasMoved.current = false;
                    setIsDragging(false);
                }}
                onDragStart={(e) => e.preventDefault()}
                draggable={false}
                className="designcombo_textLayer"
            >
                {textLines.map((line, index) => (
                    <div
                        key={index}
                        style={{
                            whiteSpace: "nowrap",
                            width: "max-content",
                        }}
                        dangerouslySetInnerHTML={{ __html: escapeHtml(line) }}
                    />
                ))}
            </div>
        </Sequence>
    );
};