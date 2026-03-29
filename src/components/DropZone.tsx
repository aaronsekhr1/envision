'use client';

import { useState, useRef } from 'react';
import { isImage, isHeic } from '@/lib/image-utils';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  previews?: { src: string; isHeic?: boolean }[];
}

export function DropZone({ onFiles, accept = 'image/*,.heic,.heif', multiple = true, label, previews }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files).filter(isImage);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(isImage);
    if (files.length) onFiles(multiple ? files : [files[0]]);
    e.target.value = '';
  }

  return (
    <div>
      <div
        className="rounded-xl text-center cursor-pointer transition-all text-sm"
        style={{
          border: `1.5px dashed ${over ? '#999' : 'var(--border-hover)'}`,
          background: over ? 'var(--bg-card)' : '#faf9f7',
          padding: '24px 16px',
          color: 'var(--text-muted)',
        }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <strong style={{ color: '#555' }}>Drop {multiple ? 'files' : 'file'} here</strong> or click to browse
        {label && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handlePick}
        className="hidden"
      />
      {previews && previews.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {previews.map((p, i) =>
            p.isHeic ? (
              <div
                key={i}
                className="flex flex-col items-center justify-center rounded-lg text-xs font-bold"
                style={{ width: 56, height: 56, background: '#ede9e4', color: 'var(--text-muted)' }}
              >
                HEIC
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.src}
                alt=""
                className="rounded-lg object-cover"
                style={{ width: 56, height: 56 }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
