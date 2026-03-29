'use client';

import { useEffect, useCallback, useState } from 'react';

interface LightboxItem {
  src: string;
  label?: string;
}

interface LightboxProps {
  items: LightboxItem[];
  startIndex: number;
  onClose: () => void;
}

export function Lightbox({ items, startIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIndex);

  const nav = useCallback(
    (dir: number) => {
      setIdx((i) => {
        const next = i + dir;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
    },
    [items.length]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') nav(-1);
      if (e.key === 'ArrowRight') nav(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, nav]);

  if (!items.length) return null;
  const item = items[idx];

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-5 flex items-center justify-center rounded-full text-white text-2xl font-light transition-all"
        style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', opacity: 0.7 }}
      >
        ×
      </button>

      {items.length > 1 && (
        <>
          <button
            onClick={() => nav(-1)}
            className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-white text-xl transition-all"
            style={{
              width: 50, height: 50, background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ‹
          </button>
          <button
            onClick={() => nav(1)}
            className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-white text-xl transition-all"
            style={{
              width: 50, height: 50, background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ›
          </button>
          <span
            className="absolute top-5 left-1/2 -translate-x-1/2 text-xs"
            style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}
          >
            {idx + 1} / {items.length}
          </span>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt=""
        className="rounded-lg"
        style={{
          maxWidth: '88vw', maxHeight: '88vh', objectFit: 'contain',
          boxShadow: '0 8px 64px rgba(0,0,0,0.6)', cursor: 'default',
        }}
      />

      {item.label && (
        <span
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-sm whitespace-nowrap"
          style={{ color: 'rgba(255,255,255,0.65)', letterSpacing: '-0.01em' }}
        >
          {item.label}
        </span>
      )}
    </div>
  );
}
