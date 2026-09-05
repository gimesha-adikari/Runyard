import { useState, useEffect, useCallback, useRef } from 'react';

interface UseResizeOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction: 'horizontal' | 'vertical';
  reverse?: boolean;
  onSizeChange?: (size: number) => void;
}

export function useResize({
  initialSize,
  minSize,
  maxSize,
  direction,
  reverse = false,
  onSizeChange,
}: UseResizeOptions) {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const currentSizeRef = useRef(size);
  currentSizeRef.current = size;

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const resetToDefault = useCallback(() => {
    setSize(initialSize);
    if (onSizeChange) onSizeChange(initialSize);
  }, [initialSize, onSizeChange]);

  useEffect(() => {
    if (!isDragging) return;

    // Set cursor on body during dragging to avoid cursor flicker over iframes/inputs
    const originalCursor = document.body.style.cursor;
    const originalSelect = document.body.style.userSelect;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      let newSize: number;
      if (direction === 'horizontal') {
        if (reverse) {
          newSize = window.innerWidth - e.clientX;
        } else {
          newSize = e.clientX;
        }
      } else {
        if (reverse) {
          // Subtract titlebar (34px) and status bar (24px)
          newSize = window.innerHeight - e.clientY - 24;
        } else {
          newSize = e.clientY - 34;
        }
      }

      const clamped = Math.min(Math.max(newSize, minSize), maxSize);
      setSize(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalSelect;
      if (onSizeChange) {
        onSizeChange(currentSizeRef.current);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalSelect;
    };
  }, [isDragging, direction, reverse, minSize, maxSize, onSizeChange]);

  return { size, setSize, isDragging, startResize, resetToDefault };
}
