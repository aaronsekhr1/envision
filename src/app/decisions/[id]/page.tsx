'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { DropZone } from '@/components/DropZone';
import { Lightbox } from '@/components/Lightbox';
import { ToastProvider, showToast } from '@/components/Toast';
import {
  loadDecisionState,
  addRoom,
  addOption,
  removeOption,
  removeRoom,
  saveRendering,
  markDecided,
  dbDelete,
  dbUpdate,
} from '@/lib/db';
import { useSettings } from '@/hooks/use-settings';
import { useAuth } from '@/hooks/use-auth';
import { resizeImage, isHeic } from '@/lib/image-utils';
import { callGemini } from '@/lib/gemini';
import type { DecisionState, Rendering, OptionPhoto } from '@/lib/types';

const CONCURRENCY = 2;

export default function DecisionPage() {
  const params = useParams();
  const router = useRouter();
  const decisionId = parseInt(params.id as string);

  const { apiKey, model } = useSettings();
  const { user } = useAuth();

  // State
  const [state, setState] = useState<DecisionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [inFlight, setInFlight] = useState<Record<string, boolean>>({});
  const [focusRow, setFocusRow] = useState(0);
  const [focusCol, setFocusCol] = useState(0);

  // Batch generation
  const batchCancelled = useRef(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    eta: string;
  } | null>(null);

  // Modals
  const [addOptionOpen, setAddOptionOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);

  // Add Option modal state
  const [optFiles, setOptFiles] = useState<File[]>([]);
  const [optPreviews, setOptPreviews] = useState<{ src: string; isHeic?: boolean }[]>([]);
  const [optName, setOptName] = useState('');

  // Add Room modal state
  const [roomFiles, setRoomFiles] = useState<File[]>([]);
  const [roomPreviews, setRoomPreviews] = useState<{ src: string; isHeic?: boolean }[]>([]);

  // Lightbox
  const [lbItems, setLbItems] = useState<{ src: string; label?: string }[]>([]);
  const [lbIndex, setLbIndex] = useState(0);
  const [lbOpen, setLbOpen] = useState(false);

  // Load state on mount — middleware already verified auth and set cookies
  useEffect(() => {
    reload();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!state) return;

      const rows = state.options.length + 1; // options + add row
      const cols = state.rooms.length + 1; // rooms + add col

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusRow((r) => Math.max(0, r - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusRow((r) => Math.min(rows - 1, r + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusCol((c) => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusCol((c) => Math.min(cols - 1, c + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusRow > 0 && focusCol > 0) {
            const optId = state.options[focusRow - 1].id;
            const roomId = state.rooms[focusCol - 1].id;
            handleSingleRender(optId, roomId);
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, focusRow, focusCol]);

  async function reload() {
    try {
      setLoading(true);
      const newState = await loadDecisionState(decisionId);
      setState(newState);
      setFocusRow(0);
      setFocusCol(0);
    } catch (err) {
      showToast(`Error loading decision: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  // Process option files for preview
  async function handleOptFiles(files: File[]) {
    setOptFiles(files);
    const previews = await Promise.all(
      files.map(async (f) => {
        if (isHeic(f)) {
          return { src: '', isHeic: true };
        }
        const reader = new FileReader();
        return new Promise<{ src: string; isHeic?: boolean }>((resolve) => {
          reader.onload = () => {
            resolve({ src: reader.result as string });
          };
          reader.readAsDataURL(f);
        });
      })
    );
    setOptPreviews(previews);
  }

  // Process room files for preview
  async function handleRoomFiles(files: File[]) {
    setRoomFiles(files);
    const previews = await Promise.all(
      files.map(async (f) => {
        if (isHeic(f)) {
          return { src: '', isHeic: true };
        }
        const reader = new FileReader();
        return new Promise<{ src: string; isHeic?: boolean }>((resolve) => {
          reader.onload = () => {
            resolve({ src: reader.result as string });
          };
          reader.readAsDataURL(f);
        });
      })
    );
    setRoomPreviews(previews);
  }

  // Add option with photos
  async function handleAddOption() {
    if (!optName.trim()) {
      showToast('Enter option name');
      return;
    }
    if (optFiles.length === 0) {
      showToast('Add at least one photo');
      return;
    }

    try {
      const resized = await Promise.all(optFiles.map((f) => resizeImage(f)));
      await addOption(decisionId, optName, resized);
      setAddOptionOpen(false);
      setOptName('');
      setOptFiles([]);
      setOptPreviews([]);
      showToast('Option added');
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  // Add room with photo
  async function handleAddRoom() {
    if (roomFiles.length === 0) {
      showToast('Select at least one room photo');
      return;
    }

    try {
      for (const file of roomFiles) {
        const resized = await resizeImage(file);
        await addRoom(decisionId, file.name, resized.mime, resized.data);
      }
      setAddRoomOpen(false);
      setRoomFiles([]);
      setRoomPreviews([]);
      showToast('Room(s) added');
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  // Single cell render
  async function handleSingleRender(optionId: number, roomId: number) {
    if (!apiKey) {
      showToast('Add Gemini API key first');
      return;
    }

    const key = `${optionId}-${roomId}`;
    if (inFlight[key]) return;

    try {
      setInFlight((prev) => ({ ...prev, [key]: true }));

      const option = state!.options.find((o) => o.id === optionId)!;
      const room = state!.rooms.find((r) => r.id === roomId)!;
      const photos = state!.photos[optionId] || [];

      if (photos.length === 0) {
        showToast('Option has no photos');
        return;
      }

      const pieces = photos.map((p) => ({
        name: option.name,
        mime: p.mime,
        data: p.data,
      }));

      const result = await callGemini(apiKey, model, pieces, room.data, room.mime);

      await saveRendering(decisionId, optionId, roomId, result.imageMime, result.imageData, result.warning);

      if (result.warning) {
        showToast('Warning: ' + result.warning);
      } else {
        showToast('Rendering saved');
      }

      await reload();
    } catch (err) {
      const msg = (err as Error).message;
      await saveRendering(decisionId, optionId, roomId, null, null, null, msg);
      showToast(`Error: ${msg}`);
      await reload();
    } finally {
      setInFlight((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Generate all missing renderings
  async function handleGenerateAll() {
    if (!state) return;
    if (!apiKey) {
      showToast('Add Gemini API key first');
      return;
    }

    const missing: { optionId: number; roomId: number }[] = [];
    for (const opt of state.options) {
      for (const room of state.rooms) {
        const key = `${opt.id}-${room.id}`;
        if (!state.renderings[key]) {
          missing.push({ optionId: opt.id, roomId: room.id });
        }
      }
    }

    if (missing.length === 0) {
      showToast('All cells already rendered');
      return;
    }

    batchCancelled.current = false;
    setBatchProgress({ done: 0, total: missing.length, eta: 'calculating...' });

    const startTime = Date.now();

    async function processBatch(items: typeof missing) {
      const results = await Promise.allSettled(
        items.map(async (item) => {
          if (batchCancelled.current) throw new Error('Cancelled');

          const option = state!.options.find((o) => o.id === item.optionId)!;
          const room = state!.rooms.find((r) => r.id === item.roomId)!;
          const photos = state!.photos[item.optionId] || [];

          if (photos.length === 0) {
            throw new Error('No photos');
          }

          const pieces = photos.map((p) => ({
            name: option.name,
            mime: p.mime,
            data: p.data,
          }));

          const result = await callGemini(apiKey, model, pieces, room.data, room.mime);
          await saveRendering(decisionId, item.optionId, item.roomId, result.imageMime, result.imageData, result.warning);

          return item;
        })
      );

      return results.filter((r) => r.status === 'fulfilled').length;
    }

    let done = 0;

    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      if (batchCancelled.current) break;

      const batch = missing.slice(i, i + CONCURRENCY);
      const batchDone = await processBatch(batch);
      done += batchDone;

      const elapsed = Date.now() - startTime;
      const perItem = elapsed / done;
      const remaining = missing.length - done;
      const etaMs = perItem * remaining;
      const etaMin = Math.ceil(etaMs / 60000);

      setBatchProgress({
        done,
        total: missing.length,
        eta: etaMin > 0 ? `${etaMin}m` : 'soon',
      });
    }

    if (!batchCancelled.current) {
      showToast('Generation complete');
    }
    setBatchProgress(null);
    await reload();
  }

  function handleCancelBatch() {
    batchCancelled.current = true;
    setBatchProgress(null);
  }

  async function handleDeleteRoom(roomId: number) {
    try {
      await removeRoom(roomId);
      showToast('Room deleted');
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  async function handleDeleteOption(optionId: number) {
    try {
      await removeOption(optionId);
      showToast('Option deleted');
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  async function handleToggleStar(optionId: number, starred: boolean) {
    try {
      await dbUpdate('options', optionId, { starred: !starred });
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  async function handleUpdateOptionName(optionId: number, newName: string) {
    if (!newName.trim()) {
      showToast('Name cannot be empty');
      return;
    }
    try {
      await dbUpdate('options', optionId, { name: newName });
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  async function handleMarkDecided() {
    try {
      await markDecided(decisionId);
      showToast('Marked as decided');
      await reload();
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  async function handleDeleteDecision() {
    if (!confirm('Delete this decision? This cannot be undone.')) return;
    try {
      await dbDelete('decisions', decisionId);
      showToast('Decision deleted');
      router.push('/');
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`);
    }
  }

  function handleCellClick(optionId: number, roomId: number) {
    const key = `${optionId}-${roomId}`;
    const rendering = state!.renderings[key];
    if (rendering && rendering.data) {
      const allRenderings = state!.options.flatMap((opt) =>
        state!.rooms.map((room) => {
          const k = `${opt.id}-${room.id}`;
          const r = state!.renderings[k];
          if (r && r.data) {
            return {
              src: `data:${r.mime};base64,${r.data}`,
              label: `${opt.name} + ${room.name}`,
            };
          }
          return null;
        })
      );

      const filtered = allRenderings.filter((x) => x !== null) as typeof lbItems;
      const idx = filtered.findIndex(
        (x) => x.label === `${state!.options.find((o) => o.id === optionId)!.name} + ${state!.rooms.find((r) => r.id === roomId)!.name}`
      );

      setLbItems(filtered);
      setLbIndex(Math.max(0, idx));
      setLbOpen(true);
    }
  }

  function renderCell(optionId: number, roomId: number) {
    const key = `${optionId}-${roomId}`;
    const rendering = state!.renderings[key];
    const isLoading = inFlight[key];

    if (isLoading) {
      return (
        <div
          className="flex items-center justify-center rounded-[12px] border-2 border-dashed"
          style={{
            aspectRatio: '4/3',
            borderColor: 'var(--border)',
            background: '#faf9f7',
          }}
        >
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      );
    }

    if (!rendering || !rendering.data) {
      return (
        <div
          className="flex items-center justify-center rounded-[12px] border-2 border-dashed cursor-pointer transition-colors hover:border-current"
          style={{
            aspectRatio: '4/3',
            borderColor: 'var(--border)',
            background: '#faf9f7',
          }}
          onClick={() => handleSingleRender(optionId, roomId)}
        >
          <Button variant="secondary" size="sm">
            Render
          </Button>
        </div>
      );
    }

    if (rendering.error) {
      return (
        <div
          className="flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed"
          style={{
            aspectRatio: '4/3',
            borderColor: 'var(--danger)',
            background: 'rgba(255, 100, 100, 0.05)',
          }}
        >
          <div className="text-xs text-center px-2" style={{ color: 'var(--danger)' }}>
            {rendering.error.slice(0, 40)}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-1"
            onClick={() => handleSingleRender(optionId, roomId)}
          >
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div
        className="relative group rounded-[12px] overflow-hidden cursor-pointer transition-all hover:shadow-lg"
        style={{
          aspectRatio: '4/3',
          background: '#f0f0f0',
        }}
        onClick={() => handleCellClick(optionId, roomId)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:${rendering.mime};base64,${rendering.data}`}
          alt=""
          className="w-full h-full object-cover"
        />
        <a
          href={`data:${rendering.mime};base64,${rendering.data}`}
          download={`${optionId}-${roomId}.jpg`}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            borderRadius: 6,
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          Save
        </a>
        {rendering.warning && (
          <div
            className="absolute bottom-2 left-2"
            style={{
              padding: '4px 8px',
              background: 'rgba(255, 165, 0, 0.8)',
              color: 'white',
              borderRadius: 4,
              fontSize: 10,
            }}
          >
            Warning
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Decision not found</div>
      </div>
    );
  }

  const optionsCount = state.options.length;
  const roomsCount = state.rooms.length;

  return (
    <>
      <ToastProvider />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Header
          breadcrumb={[
            { label: 'Envision', onClick: () => router.push('/') },
            { label: state.decision.name },
          ]}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div
            className="flex items-center gap-3 flex-wrap"
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            <Button onClick={() => setAddOptionOpen(true)} variant="primary" size="sm">
              + Add Option
            </Button>
            <Button onClick={() => setAddRoomOpen(true)} variant="primary" size="sm">
              + Add Room/Angle
            </Button>
            <div style={{ flex: 1 }} />
            {batchProgress && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Rendering {batchProgress.done}/{batchProgress.total} (ETA: {batchProgress.eta})
              </div>
            )}
            {batchProgress ? (
              <Button onClick={handleCancelBatch} variant="secondary" size="sm">
                Cancel
              </Button>
            ) : (
              <Button onClick={handleGenerateAll} variant="primary" size="sm">
                Generate All
              </Button>
            )}
            {state.decision.status === 'active' && (
              <Button onClick={handleMarkDecided} variant="secondary" size="sm">
                Mark Decided
              </Button>
            )}
            <Button onClick={handleDeleteDecision} variant="danger" size="sm">
              Delete
            </Button>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `180px repeat(${roomsCount}, 1fr) 50px`,
                gap: '16px',
                minWidth: 'fit-content',
              }}
            >
              {/* Header: Rooms */}
              <div />
              {state.rooms.map((room) => (
                <div key={room.id} className="flex flex-col items-center gap-2">
                  <div
                    className="rounded-[12px] overflow-hidden flex-shrink-0"
                    style={{
                      width: '100%',
                      height: 180,
                      background: '#f0f0f0',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${room.mime};base64,${room.data}`}
                      alt={room.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', wordBreak: 'break-word', maxWidth: '100%' }}>
                    {room.name}
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteRoom(room.id)}
                    style={{ padding: '4px 8px', fontSize: 11 }}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              <div />

              {/* Rows: Options — each child must be a direct grid child */}
              {state.options.map((option, rowIdx) => (
                <Fragment key={option.id}>
                  {/* Option label column */}
                  <div
                    className="flex flex-col items-start gap-2"
                    style={{
                      minHeight: 200,
                      paddingRight: 8,
                      gridColumn: '1',
                      gridRow: `${rowIdx + 2}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleStar(option.id, option.starred)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 18,
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        {option.starred ? '⭐' : '☆'}
                      </button>
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) => handleUpdateOptionName(option.id, e.target.value)}
                        onBlur={(e) => handleUpdateOptionName(option.id, e.target.value)}
                        className="text-xs outline-none px-2 py-1 rounded"
                        style={{
                          border: '1px solid var(--border)',
                          background: '#faf9f7',
                          flex: 1,
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(state.photos[option.id] || []).map((photo) => (
                        <div
                          key={photo.id}
                          className="rounded overflow-hidden flex-shrink-0"
                          style={{
                            width: 52,
                            height: 52,
                            background: '#f0f0f0',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:${photo.mime};base64,${photo.data}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteOption(option.id)}
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      Delete
                    </Button>
                  </div>

                  {/* Cells for this option */}
                  {state.rooms.map((room, colIdx) => (
                    <div
                      key={`${option.id}-${room.id}`}
                      style={{
                        gridColumn: `${colIdx + 2}`,
                        gridRow: `${rowIdx + 2}`,
                      }}
                    >
                      {renderCell(option.id, room.id)}
                    </div>
                  ))}

                  {/* Add room button for this row */}
                  <div
                    style={{
                      gridColumn: `${roomsCount + 2}`,
                      gridRow: `${rowIdx + 2}`,
                    }}
                  >
                    <button
                      onClick={() => setAddRoomOpen(true)}
                      className="flex items-center justify-center rounded-[12px] border-2 border-dashed transition-colors hover:border-current"
                      style={{
                        aspectRatio: '4/3',
                        borderColor: 'var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 24,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      +
                    </button>
                  </div>
                </Fragment>
              ))}

              {/* Add option row */}
              <div
                style={{
                  gridColumn: '1',
                  gridRow: `${optionsCount + 2}`,
                }}
              >
                <button
                  onClick={() => setAddOptionOpen(true)}
                  className="flex items-center justify-center rounded-[12px] border-2 border-dashed transition-colors hover:border-current"
                  style={{
                    width: '100%',
                    minHeight: 80,
                    borderColor: 'var(--border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 32,
                    color: 'var(--text-secondary)',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Add Option Modal */}
        <Modal
          open={addOptionOpen}
          onClose={() => {
            setAddOptionOpen(false);
            setOptName('');
            setOptFiles([]);
            setOptPreviews([]);
          }}
          title="Add Option"
          actions={
            <>
              <Button
                onClick={() => {
                  setAddOptionOpen(false);
                  setOptName('');
                  setOptFiles([]);
                  setOptPreviews([]);
                }}
                variant="secondary"
                size="sm"
              >
                Cancel
              </Button>
              <Button onClick={handleAddOption} variant="primary" size="sm">
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Name
              </label>
              <input
                type="text"
                value={optName}
                onChange={(e) => setOptName(e.target.value)}
                placeholder="e.g., Sofa A"
                className="w-full mt-2 px-3 py-2 rounded-lg outline-none text-sm"
                style={{
                  border: '1px solid var(--border)',
                  background: '#faf9f7',
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Photos
              </label>
              <div className="mt-2">
                <DropZone onFiles={handleOptFiles} multiple previews={optPreviews} />
              </div>
            </div>
          </div>
        </Modal>

        {/* Add Room Modal */}
        <Modal
          open={addRoomOpen}
          onClose={() => {
            setAddRoomOpen(false);
            setRoomFiles([]);
            setRoomPreviews([]);
          }}
          title="Add Room/Angle"
          actions={
            <>
              <Button
                onClick={() => {
                  setAddRoomOpen(false);
                  setRoomFiles([]);
                  setRoomPreviews([]);
                }}
                variant="secondary"
                size="sm"
              >
                Cancel
              </Button>
              <Button onClick={handleAddRoom} variant="primary" size="sm">
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Room Photos
              </label>
              <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-secondary)' }}>
                You can add multiple room photos. Each will become a separate column.
              </p>
              <DropZone onFiles={handleRoomFiles} multiple previews={roomPreviews} />
            </div>
          </div>
        </Modal>

        {/* Lightbox */}
        {lbOpen && <Lightbox items={lbItems} startIndex={lbIndex} onClose={() => setLbOpen(false)} />}
      </div>
    </>
  );
}
