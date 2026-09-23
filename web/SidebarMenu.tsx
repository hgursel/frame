import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function SidebarMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  useEffect(() => {
    if (!position) return;
    panel.current?.querySelector('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setPosition(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setPosition(undefined);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [position]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="row-menu-trigger"
        aria-label={label}
        aria-expanded={!!position}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition(
            position
              ? undefined
              : {
                  top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 160)),
                  left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
                },
          );
        }}
      >
        ⋯
      </button>
      {position &&
        createPortal(
          <div
            ref={panel}
            className="row-menu-panel"
            role="group"
            aria-label={label}
            style={position}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPosition(undefined);
            }}
            onClick={() => {
              setPosition(undefined);
              trigger.current?.focus();
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
