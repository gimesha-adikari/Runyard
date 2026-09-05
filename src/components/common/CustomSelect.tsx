import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  secondaryLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface CustomSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  align?: 'left' | 'right';
  size?: 'xs' | 'sm' | 'md';
  title?: string;
}

export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  buttonClassName,
  dropdownClassName,
  align = 'left',
  size = 'xs',
  title,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; flip: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    flip: false,
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Position calculation with edge detection
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(options.length * 30 + 10, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    let left = align === 'right' ? rect.right : rect.left;
    const width = Math.max(rect.width, 140);
    if (typeof window !== 'undefined') {
      const maxLeft = window.innerWidth - width - 8;
      left = Math.max(8, Math.min(left, maxLeft));
    }

    setCoords({
      top: flip ? rect.top - 4 : rect.bottom + 4,
      left,
      width,
      flip,
    });
  }, [align, options.length]);

  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      const initialIdx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(initialIdx >= 0 ? initialIdx : 0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const optionEl = dropdownRef.current.children[highlightedIndex] as HTMLElement | undefined;
      optionEl?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
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
          while (next < options.length && options[next]?.disabled) next++;
          return next < options.length ? next : prev;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && options[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex];
          if (opt && !opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      }
      case 'Escape':
      case 'Tab': {
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      }
    }
  };

  // Click outside and resize listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleWindowResize = () => {
      setIsOpen(false);
    };

    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
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

  // Size styling maps
  const sizeClasses = {
    xs: 'h-6 px-2 text-[11px]',
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3 text-xs',
  };

  return (
    <div className={cn('relative inline-block font-sans', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        title={title || selectedOption?.label || placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center justify-between gap-1.5 bg-[#111114] hover:bg-[#18181f] text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded-[3px] btn-tactile transition-colors duration-fast font-medium focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/50 disabled:opacity-50 disabled:pointer-events-none select-none',
          sizeClasses[size],
          isOpen && 'border-zinc-600 bg-[#18181f]',
          buttonClassName
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedOption?.icon}
          <span className="truncate">
            {selectedOption
              ? typeof selectedOption.label === 'string'
                ? selectedOption.label
                : String(selectedOption.label)
              : placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-zinc-500 shrink-0 transition-transform duration-fast ease-standard',
            isOpen && 'rotate-180 text-zinc-300'
          )}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            data-custom-select-dropdown="true"
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: coords.flip ? undefined : `${coords.top}px`,
              bottom: coords.flip ? `${window.innerHeight - coords.top}px` : undefined,
              left: align === 'right' ? undefined : `${coords.left}px`,
              right: align === 'right' ? `${window.innerWidth - coords.left}px` : undefined,
              minWidth: `${coords.width}px`,
              zIndex: 9999,
            }}
            className={cn(
              'max-h-60 overflow-y-auto bg-[#111114] border border-zinc-700/80 rounded-[4px] shadow-2xl p-1 text-xs text-zinc-300 focus:outline-none select-none menu-entrance font-sans',
              dropdownClassName
            )}
          >
            {options.length === 0 ? (
              <div className="px-2.5 py-1.5 text-zinc-500 italic text-[11px]">No options</div>
            ) : (
              options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={String(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                    onMouseEnter={() => {
                      if (!opt.disabled) setHighlightedIndex(idx);
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1 rounded-[2px] cursor-pointer transition-colors duration-fast text-[11px]',
                      opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                      isSelected ? 'text-emerald-400 font-medium' : 'text-zinc-300',
                      isHighlighted ? 'bg-[#1c1c24] text-zinc-100' : 'hover:bg-[#16161c]'
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {opt.icon}
                      <span className="truncate">
                        {typeof opt.label === 'string' ? opt.label : String(opt.label)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.secondaryLabel && (
                        <span className="text-[10px] font-mono text-zinc-500">{opt.secondaryLabel}</span>
                      )}
                      {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
