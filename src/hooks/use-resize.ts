import { useState, useEffect, useCallback } from 'react';

export function useResize(initialSize: number, minSize: number, maxSize: number, direction: 'horizontal' | 'vertical', reverse: boolean = false) {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      let newSize = size;
      if (direction === 'horizontal') {
        if (reverse) {
          newSize = window.innerWidth - e.clientX;
        } else {
          newSize = e.clientX;
        }
      } else {
        if (reverse) {
          newSize = window.innerHeight - e.clientY - 24; // 24 for status bar
        } else {
          newSize = e.clientY;
        }
      }
      
      setSize(Math.min(Math.max(newSize, minSize), maxSize));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, reverse, minSize, maxSize, size]);

  return { size, isDragging, startResize };
}
