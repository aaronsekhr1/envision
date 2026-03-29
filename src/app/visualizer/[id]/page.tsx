'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { DropZone } from '@/components/DropZone';
import { Lightbox } from '@/components/Lightbox';
import { ToastProvider, showToast } from '@/components/Toast';
import {
  loadVizState,
  addVizCategory,
  addVizOption,
  saveVizRendering,
  updateVizRoomPhoto,
  dbDelete,
} from '@/lib/db';
import { useSettings } from '@/hooks/use-settings';
import { useAuth } from '@/hooks/use-auth';
import { resizeImage, isHeic } from '@/lib/image-utils';
import { callGemini } from '@/lib/gemini';
import type { GeminiPiece } from '@/lib/gemini';
import type { VizState } from '@/lib/types';

const CONCURRENCY = 2;

interface Combo {
  catId: number;
  catName: string;
  optId: number;
  optName: string;
  photo: string | null;
  mime: string | null;
  placement: string | null;
}

export default function VisualizerPage() {
  const params = useParams();
  const router = useRouter();
  const { apiKey, model } = useSettings();
  const { user } = useAuth();
  const projectId = Number(params.id);

  const [state, setState] = useState<VizState | null>(null);
  const [loading, setLoading] = useState(true);

  // Batch generation
  const batchCancelled = useRef(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    eta: string;
  } | null>(null);

  // Modals
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [optModalOpen, setOptModalOpen] = useState(false);
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreview, setRoomPreview] = useState('');
  const [optFile, setOptFile] = useState<File | null>(null);
  const [optPreview, setOptPreview] = useState('');
  const [optCatId, setOptCatId] = useState<number | null>(null);
  const [optName, setOptName] = useState('');
  const [optPlacement, setOptPlacement] = useState('');
  const [catName, setCatName] = useState('');

  // Category toggles — which categories are active in the current view
  const [activeCatIds, setActiveCatIds] = useState<Set<number>>(new Set());

  // Lightbox
  const [lbOpen, setLbOpen] = useState(false);
  const [lbItems, setLbItems] = useState<{ src: string; label?: string }[]>([]);
  const [lbIndex, setLbIndex] = useState(0);

  const reload = useCallback(async () => {
    try {
      const data = await loadVizState(projectId);
      setState(data);
      // Initialize active categories to all categories with options on first load
      setActiveCatIds((prev) => {
        if (prev.size === 0) {
          const allIds = data.categories.filter((c) => c.options.length > 0).map((c) => c.id);
          return new Set(allIds);
        }
        return prev;
      });
    } catch (e) {
      console.error(e);
      showToast('Failed to load project');
      router.push('/');
    }
    setLoading(false);
  }, [projectId, router]);

  // Load on mount — middleware already verified auth and set cookies
  useEffect(() => {
    reload();
  }, [reload]);

  function toggleCategory(catId: number) {
    setActiveCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  }

  // ── N-Category Cross-Product Combination Logic ──

  function getCombinations(): Combo[][] {
    if (!state) return [];
    const validCats = state.categories.filter((c) => c.options.length > 0 && activeCatIds.has(c.id));
    if (validCats.length === 0) return [];

    // N-dimensional cross-product: multiply all categories together
    let combos: Combo[][] = [[]];
    for (const cat of validCats) {
      const next: Combo[][] = [];
      for (const existing of combos) {
        for (const opt of cat.options) {
          next.push([
            ...existing,
            {
              catId: cat.id,
              catName: cat.name,
              optId: opt.id,
              optName: opt.name,
              photo: opt.photo,
              mime: opt.mime,
              placement: opt.placement ?? null,
            },
          ]);
        }
      }
      combos = next;
    }
    return combos;
  }

  function comboKey(combo: Combo[]): string {
    return combo.map((c) => `${c.catId}-${c.optId}`).join('|');
  }

  // ── Single render ──

  async function handleSingleGenerate(key: string) {
    if (!state || !apiKey) {
      showToast('Set your Gemini API key first');
      return;
    }
    if (!state.project.room_photo) {
      showToast('Upload a room photo first');
      return;
    }

    // Parse key back to combo parts
    const parts = key.split('|').map((p) => {
      const [catId, optId] = p.split('-').map(Number);
      const cat = state.categories.find((c) => c.id === catId);
      const opt = cat?.options.find((o) => o.id === optId);
      return {
        catName: cat?.name || '',
        optName: opt?.name || '',
        photo: opt?.photo || '',
        mime: opt?.mime || '',
        placement: opt?.placement ?? null,
      };
    });

    // Mark loading
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: {
          ...prev.results,
          [key]: { id: 0, project_id: projectId, combination_key: key, mime: null, data: null, error: null, loading: true },
        },
      };
    });

    try {
      const pieces: GeminiPiece[] = parts
        .filter((p) => p.photo)
        .map((p) => ({
          name: `${p.catName}: ${p.optName}`,
          data: p.photo!,
          mime: p.mime!,
          placement: p.placement,
        }));
      const result = await callGemini(apiKey, model, pieces, state.project.room_photo!, state.project.room_mime!);
      await saveVizRendering(projectId, key, result.imageMime, result.imageData);
      await reload();
      showToast('Rendering complete');
    } catch (e) {
      const errMsg = (e as Error).message;
      await saveVizRendering(projectId, key, null, null, errMsg);
      await reload();
      showToast('Render failed');
    }
  }

  // ── Batch render ──

  async function handleGenerateAll() {
    if (!state) return;
    if (!apiKey) {
      showToast('Enter your Gemini API key in the header first');
      return;
    }
    if (!state.project.room_photo) {
      showToast('Upload a room photo first');
      return;
    }

    try {
      const combos = getCombinations();
      const missing = combos.filter((c) => {
        const key = comboKey(c);
        const r = state.results[key];
        return !r || (!r.data && !r.loading);
      });

      if (!missing.length) {
        showToast('All combinations already rendered');
        return;
      }

      showToast(`Starting ${missing.length} renders...`);
      batchCancelled.current = false;
      const total = missing.length;
      let done = 0;
      const startTime = Date.now();
      setBatchProgress({ done: 0, total, eta: 'starting...' });

      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        if (batchCancelled.current) break;
        const batch = missing.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map(async (combo) => {
            if (batchCancelled.current) return;
            const key = comboKey(combo);
            const pieces: GeminiPiece[] = combo
              .filter((c) => c.photo)
              .map((c) => ({
                name: `${c.catName}: ${c.optName}`,
                data: c.photo!,
                mime: c.mime!,
                placement: c.placement,
              }));

            if (pieces.length === 0) {
              console.warn('Skipping combo with no photos:', key);
              done++;
              return;
            }

            try {
              const result = await callGemini(apiKey, model, pieces, state.project.room_photo!, state.project.room_mime!);
              await saveVizRendering(projectId, key, result.imageMime, result.imageData);
            } catch (e) {
              console.error('Render failed for', key, e);
              await saveVizRendering(projectId, key, null, null, (e as Error).message);
            }
            done++;
            const elapsed = Date.now() - startTime;
            const perItem = elapsed / done;
            const remaining = (total - done) * perItem;
            setBatchProgress({
              done,
              total,
              eta: remaining < 60000 ? `~${Math.ceil(remaining / 1000)}s` : `~${Math.ceil(remaining / 60000)}min`,
            });
          })
        );
      }

      await reload();
      setBatchProgress(null);
      showToast(batchCancelled.current ? 'Cancelled' : `Done — ${done} rendered`);
    } catch (e) {
      console.error('handleGenerateAll error:', e);
      setBatchProgress(null);
      showToast('Generation failed: ' + (e as Error).message);
    }
  }

  // ── Room photo ──

  async function handleUploadRoom() {
    if (!roomFile) return;
    try {
      const resized = await resizeImage(roomFile);
      await updateVizRoomPhoto(projectId, resized.data, resized.mime);
      setRoomModalOpen(false);
      setRoomFile(null);
      setRoomPreview('');
      await reload();
    } catch (e) {
      showToast('Failed to upload: ' + (e as Error).message);
    }
  }

  // ── Add category ──

  async function handleAddCategory() {
    if (!catName.trim()) return;
    try {
      await addVizCategory(projectId, catName.trim(), state?.categories.length || 0);
      setCatModalOpen(false);
      setCatName('');
      await reload();
    } catch (e) {
      showToast('Failed: ' + (e as Error).message);
    }
  }

  // ── Add option ──

  async function handleAddOption() {
    if (!optName.trim() || optCatId === null) return;
    try {
      let photo: string | null = null;
      let mime: string | null = null;
      if (optFile) {
        const resized = await resizeImage(optFile);
        photo = resized.data;
        mime = resized.mime;
      }
      const cat = state?.categories.find((c) => c.id === optCatId);
      await addVizOption(
        optCatId,
        optName.trim(),
        photo,
        mime,
        cat?.options.length || 0,
        optPlacement.trim() || null
      );
      setOptModalOpen(false);
      setOptName('');
      setOptPlacement('');
      setOptFile(null);
      setOptPreview('');
      setOptCatId(null);
      await reload();
    } catch (e) {
      showToast('Failed: ' + (e as Error).message);
    }
  }

  // ── Remove ──

  async function handleRemoveCategory(catId: number) {
    if (!confirm('Delete this category and all its options?')) return;
    try {
      await dbDelete('visualizer_categories', catId);
      await reload();
    } catch (e) {
      showToast('Failed: ' + (e as Error).message);
    }
  }

  async function handleRemoveOption(optId: number) {
    if (!confirm('Delete this option?')) return;
    try {
      await dbDelete('visualizer_options', optId);
      await reload();
    } catch (e) {
      showToast('Failed: ' + (e as Error).message);
    }
  }

  async function handleDeleteProject() {
    if (!confirm('Delete this entire project? Cannot be undone.')) return;
    try {
      await dbDelete('visualizer_projects', projectId);
      router.push('/');
    } catch (e) {
      showToast('Failed: ' + (e as Error).message);
    }
  }

  // ── Render ──

  if (loading || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  const allValidCats = state.categories.filter((c) => c.options.length > 0);
  const activeCats = allValidCats.filter((c) => activeCatIds.has(c.id));
  const combos = getCombinations();
  const missingCount = combos.filter((c) => !state.results[comboKey(c)]?.data).length;

  // Build formula string like "Rug(2) × Wallpaper(1) = 4"
  const formulaParts = activeCats.map((c) => `${c.name}(${c.options.length})`);
  const formulaStr = formulaParts.length > 0
    ? `${formulaParts.join(' × ')} = ${combos.length}`
    : '';

  return (
    <>
      <ToastProvider />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Header
          breadcrumb={[
            { label: 'Envision', onClick: () => router.push('/') },
            { label: state.project.name },
          ]}
        />

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
          {/* ── Sidebar ── */}
          <div style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            {/* Room Photo */}
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                Room Photo
              </div>
              <div
                className="rounded-xl overflow-hidden mb-3 flex items-center justify-center"
                style={{ width: '100%', height: 200, background: '#ede9e4' }}
              >
                {state.project.room_photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${state.project.room_mime};base64,${state.project.room_photo}`}
                    alt="Room"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No room photo</span>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                style={{ width: '100%' }}
                onClick={() => {
                  setRoomFile(null);
                  setRoomPreview('');
                  setRoomModalOpen(true);
                }}
              >
                {state.project.room_photo ? 'Change Photo' : 'Upload Room Photo'}
              </Button>
            </div>

            {/* Categories */}
            <div style={{ padding: 20 }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                Categories
              </div>
              {state.categories.map((cat) => (
                <div key={cat.id} className="rounded-xl mb-3" style={{ background: '#f7f6f4', padding: 12 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex-1 text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>
                      {cat.name}
                    </span>
                    <button
                      onClick={() => handleRemoveCategory(cat.id)}
                      className="text-xs cursor-pointer transition-colors"
                      style={{ background: 'none', border: 'none', color: '#e0dcd8' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#e0dcd8')}
                    >
                      ×
                    </button>
                  </div>
                  {cat.options.map((opt) => (
                    <div
                      key={opt.id}
                      className="flex gap-2 rounded-lg mb-2"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 10 }}
                    >
                      {opt.photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:${opt.mime};base64,${opt.photo}`}
                          alt=""
                          className="rounded-md shrink-0"
                          style={{ width: 40, height: 40, objectFit: 'cover' }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{opt.name}</div>
                        {opt.placement && (
                          <div
                            className="text-xs mt-0.5 truncate"
                            style={{ color: '#999', fontSize: '10px' }}
                          >
                            📍 {opt.placement}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveOption(opt.id)}
                        className="text-xs cursor-pointer shrink-0 transition-colors"
                        style={{ background: 'none', border: 'none', color: '#e0dcd8' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#e0dcd8')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setOptCatId(cat.id);
                      setOptName('');
                      setOptPlacement('');
                      setOptFile(null);
                      setOptPreview('');
                      setOptModalOpen(true);
                    }}
                  >
                    + Add Option
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  setCatName('');
                  setCatModalOpen(true);
                }}
              >
                + Add Category
              </Button>
            </div>
          </div>

          {/* ── Main Area ── */}
          <div style={{ background: '#faf9f7', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Category Toggle Chips — separate row */}
            {allValidCats.length > 0 && (
              <div
                style={{
                  padding: '14px 32px',
                  background: '#fff',
                  borderBottom: '1px solid #e8e6e2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span className="text-xs font-bold uppercase" style={{ color: '#999', letterSpacing: '0.06em', marginRight: 4 }}>
                  Show:
                </span>
                {allValidCats.map((cat) => {
                  const isActive = activeCatIds.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      style={{
                        padding: '7px 18px',
                        borderRadius: 999,
                        border: isActive ? '2px solid #1a1a1a' : '2px solid #ddd',
                        background: isActive ? '#1a1a1a' : '#fff',
                        color: isActive ? '#fff' : '#888',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {cat.name} ({cat.options.length})
                    </button>
                  );
                })}
                {combos.length > 0 && (
                  <span className="text-xs" style={{ color: '#aaa', fontFamily: 'monospace', marginLeft: 8 }}>
                    {formulaStr}
                  </span>
                )}
              </div>
            )}

            {/* Toolbar */}
            <div
              className="flex items-center gap-2.5 flex-wrap"
              style={{ padding: '11px 32px', background: 'var(--bg-card)', borderBottom: '1px solid #e8e6e2' }}
            >
              <div style={{ flex: 1 }} />

              {batchProgress && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {batchProgress.done}/{batchProgress.total} — {batchProgress.eta}
                </span>
              )}
              {batchProgress && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    batchCancelled.current = true;
                  }}
                >
                  Cancel
                </Button>
              )}
              {!batchProgress && missingCount > 0 && (
                <Button size="sm" onClick={handleGenerateAll}>
                  Generate {missingCount} Remaining
                </Button>
              )}

              <Button variant="danger" size="sm" onClick={handleDeleteProject}>
                Delete Project
              </Button>
            </div>

            {/* Results Grid */}
            <div style={{ padding: '24px 32px 80px', flex: 1 }}>
              {!state.project.room_photo || allValidCats.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {!state.project.room_photo
                    ? 'Upload a room photo and add at least 1 category to get started.'
                    : 'Add at least 1 category with options to see combinations.'}
                </div>
              ) : combos.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {activeCatIds.size === 0
                    ? 'Toggle on some categories above to see combinations.'
                    : 'Add options to your categories to generate combinations.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {combos.map((combo) => {
                    const key = comboKey(combo);
                    const r = state.results[key];
                    const label = combo.map((c) => `${c.catName}: ${c.optName}`).join(' / ');

                    return (
                      <div
                        key={key}
                        className="rounded-xl overflow-hidden transition-all"
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          cursor: r?.data ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (r?.data) {
                            const allRendered = combos
                              .filter((c) => state.results[comboKey(c)]?.data)
                              .map((c) => ({
                                src: `data:${state.results[comboKey(c)]!.mime};base64,${state.results[comboKey(c)]!.data}`,
                                label: c.map((p) => `${p.catName}: ${p.optName}`).join(' / '),
                              }));
                            const idx = allRendered.findIndex((item) => item.label === label);
                            setLbItems(allRendered);
                            setLbIndex(idx >= 0 ? idx : 0);
                            setLbOpen(true);
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-hover)';
                          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.09)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        <div
                          className="flex items-center justify-center relative"
                          style={{ width: '100%', aspectRatio: '4/3', background: '#faf9f7', overflow: 'hidden' }}
                        >
                          {r?.loading ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="spinner spinner-dark" />
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Generating...</span>
                            </div>
                          ) : r?.data ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`data:${r.mime};base64,${r.data}`}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <a
                                href={`data:${r.mime};base64,${r.data}`}
                                download={`combo-${key.replace(/[^a-z0-9]/gi, '-')}.jpg`}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute bottom-2 right-2 text-xs text-white rounded-md opacity-0 transition-opacity"
                                style={{ padding: '3px 10px', background: 'rgba(0,0,0,0.44)', textDecoration: 'none' }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                              >
                                Save
                              </a>
                            </>
                          ) : r?.error ? (
                            <div className="flex flex-col items-center gap-2 p-3 text-center">
                              <span className="text-xs" style={{ color: 'var(--danger)' }}>
                                {r.error.slice(0, 120)}
                              </span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleGenerate(key);
                                }}
                              >
                                Retry
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSingleGenerate(key);
                              }}
                            >
                              Render
                            </Button>
                          )}
                        </div>
                        <div className="p-3 text-xs leading-relaxed" style={{ color: '#666' }}>
                          {combo.map((c, i) => (
                            <div key={i}>
                              <strong>{c.catName}:</strong> {c.optName}
                              {c.placement && (
                                <span style={{ color: '#aaa', marginLeft: 6, fontSize: '10px' }}>
                                  → {c.placement}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Room Photo */}
      <Modal
        open={roomModalOpen}
        onClose={() => setRoomModalOpen(false)}
        title="Room Photo"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRoomModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadRoom} disabled={!roomFile}>Upload</Button>
          </>
        }
      >
        <DropZone
          multiple={false}
          onFiles={(files) => {
            setRoomFile(files[0]);
            if (!isHeic(files[0])) {
              setRoomPreview(URL.createObjectURL(files[0]));
            }
          }}
          previews={roomPreview ? [{ src: roomPreview }] : roomFile ? [{ src: '', isHeic: true }] : []}
        />
      </Modal>

      {/* Add Category */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="New Category"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCategory}>Add</Button>
          </>
        }
      >
        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
          Category Name
        </label>
        <input
          type="text"
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          placeholder="e.g. Wallpaper, Crib, Carpet"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddCategory();
          }}
          autoFocus
        />
      </Modal>

      {/* Add Option */}
      <Modal
        open={optModalOpen}
        onClose={() => setOptModalOpen(false)}
        title="New Option"
        actions={
          <>
            <Button variant="secondary" onClick={() => setOptModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddOption}>Add</Button>
          </>
        }
      >
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Option Name
          </label>
          <input
            type="text"
            value={optName}
            onChange={(e) => setOptName(e.target.value)}
            placeholder="e.g. Blue Floral"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
            autoFocus
          />
        </div>
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Placement in Room
          </label>
          <input
            type="text"
            value={optPlacement}
            onChange={(e) => setOptPlacement(e.target.value)}
            placeholder="e.g. center of floor, back wall, right corner"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
          />
          <div className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Tell the AI where to place this item in the room
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Photo <span className="normal-case font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <DropZone
            multiple={false}
            onFiles={(files) => {
              setOptFile(files[0]);
              if (!isHeic(files[0])) {
                setOptPreview(URL.createObjectURL(files[0]));
              }
            }}
            previews={optPreview ? [{ src: optPreview }] : optFile ? [{ src: '', isHeic: true }] : []}
          />
        </div>
      </Modal>

      {/* Lightbox */}
      {lbOpen && <Lightbox items={lbItems} startIndex={lbIndex} onClose={() => setLbOpen(false)} />}
    </>
  );
}
