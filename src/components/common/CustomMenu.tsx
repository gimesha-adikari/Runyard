import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MenuItem =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: React.ReactNode;
      secondaryLabel?: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      isSelected?: boolean;
    }
  | {
      type: 'separator';
    }
  | {
      type: 'header';
      label: string;
    };

export interface CustomMenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  className?: string;
  menuClassName?: string;
  minWidth?: number;
}

export const CustomMenu: React.FC<CustomMenuProps> = ({
  trigger,
  items,
  align = 'right',
  className,
  menuClassName,
  minWidth = 160,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; flip: boolean }>({
    top: 0,
    left: 0,
    flip: false,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter only selectable action items for keyboard indexing
  const actionItems = items.filter((item): item is Extract<MenuItem, { onSelect: () => void }> => !item.type || item.type === 'item');

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = Math.min(items.length * 28 + 16, 300);
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < menuHeight && rect.top > menuHeight;

    let left = align === 'right' ? rect.right : rect.left;

    setCoords({
      top: flip ? rect.top - 4 : rect.bottom + 4,
      left,
      flip,
    });
  }, [align, items.length]);

  const toggleOpen = () => {
    if (!isOpen) {
      updatePosition();
      setHighlightedIndex(0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (item: Extract<MenuItem, { onSelect: () => void }>) => {
    if (item.disabled) return;
    item.onSelect();
    setIsOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleOpen();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev + 1;
          while (next < actionItems.length && actionItems[next]?.disabled) next++;
          return next < actionItems.length ? next : prev;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && actionItems[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < actionItems.length) {
          const item = actionItems[highlightedIndex];
          if (item && !item.disabled) handleSelect(item);
        }
        break;
      }
      case 'Escape':
      case 'Tab': {
        setIsOpen(false);
        break;
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleWindowResize = () => {
      setIsOpen(false);
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  let actionCounter = -1;

  return (
    <div className={cn('relative inline-block font-sans', className)} ref={triggerRef}>
      <div onClick={toggleOpen} onKeyDown={handleKeyDown}>
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            data-custom-menu-dropdown="true"
            role="menu"
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: coords.flip ? undefined : `${coords.top}px`,
              bottom: coords.flip ? `${window.innerHeight - coords.top}px` : undefined,
              left: align === 'right' ? undefined : `${coords.left}px`,
              right: align === 'right' ? `${window.innerWidth - coords.left}px` : undefined,
              minWidth: `${minWidth}px`,
              zIndex: 9999,
            }}
            className={cn(
              'max-h-72 overflow-y-auto bg-[#111114] border border-zinc-700/80 rounded-[4px] shadow-2xl p-1 text-xs text-zinc-300 focus:outline-none select-none menu-entrance font-sans',
              menuClassName
            )}
          >
            {items.map((item, idx) => {
              if (item.type === 'separator') {
                return <div key={`sep-${idx}`} className="h-px bg-[#1f1f26] my-1" />;
              }

              if (item.type === 'header') {
                return (
                  <div
                    key={`header-${idx}`}
                    className="px-2 py-1 text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-semibold select-none"
                  >
                    {item.label}
                  </div>
                );
              }

              actionCounter++;
              const currentActionIdx = actionCounter;
              const isHighlighted = currentActionIdx === highlightedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => {
                    if (!item.disabled) setHighlightedIndex(currentActionIdx);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2 py-1 rounded-[2px] text-left transition-colors duration-fast text-[11px] focus:outline-none',
                    item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                    item.danger
                      ? 'text-red-400 hover:bg-red-950/40 hover:text-red-300'
                      : isHighlighted
                      ? 'bg-[#1c1c24] text-zinc-100'
                      : 'hover:bg-[#16161c] text-zinc-300',
                    item.isSelected && 'text-emerald-400 font-medium'
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.secondaryLabel && (
                      <span className="text-[10px] font-mono text-zinc-500">{item.secondaryLabel}</span>
                    )}
                    {item.isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
