'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { ToastProvider, showToast } from '@/components/Toast';
import { useAuth } from '@/hooks/use-auth';
import {
  getUserDecisions,
  createDecision,
  getUserVizProjects,
  createVizProject,
  dbDelete,
  dbDeleteWhere,
} from '@/lib/db';
import type { Decision, VizProject } from '@/lib/types';

/* ── SVG Icons ── */

function DecisionIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b5b0a8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M2 18v-2a2 2 0 0 1 2-2v6H4a2 2 0 0 1-2-2z" />
      <path d="M22 18v-2a2 2 0 0 0-2-2v6h0a2 2 0 0 0 2-2z" />
      <path d="M6 18h12" />
      <path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
    </svg>
  );
}

function VisualizerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b5b0a8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 3v6" />
    </svg>
  );
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [vizProjects, setVizProjects] = useState<VizProject[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [newDecisionOpen, setNewDecisionOpen] = useState(false);
  const [newVizOpen, setNewVizOpen] = useState(false);
  const [newName, setNewName] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'decision' | 'visualizer';
    id: number;
    name: string;
  } | null>(null);

  // Wait for auth before loading — prevents race condition where user is null
  useEffect(() => {
    if (user) loadData();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  async function loadData() {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([
        getUserDecisions(user!.id),
        getUserVizProjects(user!.id),
      ]);
      setDecisions(d);
      setVizProjects(v);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    setLoading(false);
  }

  async function handleNewDecision() {
    if (!newName.trim() || !user) return;
    const id = await createDecision(user.id, newName.trim());
    setNewDecisionOpen(false);
    setNewName('');
    router.push(`/decisions/${id}`);
  }

  async function handleNewVisualizer() {
    if (!newName.trim() || !user) return;
    const id = await createVizProject(user.id, newName.trim());
    setNewVizOpen(false);
    setNewName('');
    router.push(`/visualizer/${id}`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'decision') {
        // Clean up child tables first
        await dbDeleteWhere('renderings', 'decision_id', deleteTarget.id);
        // option_photos needs options lookup — just delete decision, cascade handles it
        await dbDelete('decisions', deleteTarget.id);
      } else {
        await dbDelete('visualizer_projects', deleteTarget.id);
      }
      setDeleteTarget(null);
      showToast('Deleted');
      await loadData();
    } catch (e) {
      showToast('Delete failed: ' + (e as Error).message);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  const activeDecisions = decisions.filter((d) => d.status === 'active');
  const decidedDecisions = decisions.filter((d) => d.status === 'decided');

  return (
    <>
      <Header />
      <ToastProvider />

      <div className="mx-auto max-w-6xl px-8 py-11 pb-24">
        <h2 className="text-2xl font-bold mb-10" style={{ letterSpacing: '-0.04em' }}>
          Envision
        </h2>

        {/* ── Decisions ── */}
        <div style={{ marginBottom: 40 }}>
          <div className="flex items-baseline gap-3 mb-4">
            <h3 className="text-base font-semibold" style={{ letterSpacing: '-0.02em' }}>
              Decisions
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Compare furniture options side-by-side
            </span>
          </div>
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {activeDecisions.map((d) => (
              <div
                key={d.id}
                onClick={() => router.push(`/decisions/${d.id}`)}
                className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  position: 'relative',
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
                {/* Delete X */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ type: 'decision', id: d.id, name: d.name });
                  }}
                  className="card-delete-btn"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    color: 'white',
                    border: 'none',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2,
                  }}
                >
                  ×
                </button>
                <div
                  className="flex items-center justify-center"
                  style={{ height: 80, background: '#f0ede9' }}
                >
                  <DecisionIcon />
                </div>
                <div style={{ padding: '10px 14px' }}>
                  <div className="font-semibold text-sm mb-0.5" style={{ letterSpacing: '-0.025em' }}>
                    {d.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}

            {decidedDecisions.map((d) => (
              <div
                key={d.id}
                onClick={() => router.push(`/decisions/${d.id}`)}
                className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  opacity: 0.6,
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ type: 'decision', id: d.id, name: d.name });
                  }}
                  className="card-delete-btn"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    color: 'white',
                    border: 'none',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2,
                  }}
                >
                  ×
                </button>
                <div style={{ padding: '10px 14px' }}>
                  <span
                    className="inline-block text-xs font-semibold uppercase mb-1.5 rounded px-2 py-0.5"
                    style={{
                      color: 'var(--success)',
                      background: '#edf5ee',
                      letterSpacing: '0.06em',
                      fontSize: 10,
                    }}
                  >
                    Decided
                  </span>
                  <div className="font-semibold text-sm">{d.name}</div>
                </div>
              </div>
            ))}

            {/* New Decision card */}
            <div
              onClick={() => {
                setNewName('');
                setNewDecisionOpen(true);
              }}
              className="rounded-2xl cursor-pointer transition-all overflow-hidden"
              style={{
                border: '2px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 120,
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-hover)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 2 }}>+</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>New Decision</div>
            </div>

            {activeDecisions.length === 0 && decidedDecisions.length === 0 && (
              <div
                className="text-sm py-8 text-center"
                style={{ color: 'var(--text-muted)', gridColumn: '2/-1' }}
              >
                Start a new one to compare furniture in your space.
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 0 32px' }} />

        {/* ── Room Visualizer ── */}
        <div style={{ marginBottom: 40 }}>
          <div className="flex items-baseline gap-3 mb-4">
            <h3 className="text-base font-semibold" style={{ letterSpacing: '-0.02em' }}>
              Room Visualizer
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Mix & match design elements in your space
            </span>
          </div>
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {vizProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/visualizer/${p.id}`)}
                className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  position: 'relative',
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ type: 'visualizer', id: p.id, name: p.name });
                  }}
                  className="card-delete-btn"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    color: 'white',
                    border: 'none',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2,
                  }}
                >
                  ×
                </button>
                <div
                  className="flex items-center justify-center"
                  style={{ height: 80, background: '#f0ede9' }}
                >
                  <VisualizerIcon />
                </div>
                <div style={{ padding: '10px 14px' }}>
                  <div className="font-semibold text-sm mb-0.5" style={{ letterSpacing: '-0.025em' }}>
                    {p.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}

            {/* New Visualizer card */}
            <div
              onClick={() => {
                setNewName('');
                setNewVizOpen(true);
              }}
              className="rounded-2xl cursor-pointer transition-all overflow-hidden"
              style={{
                border: '2px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 120,
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-hover)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 2 }}>+</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>New Project</div>
            </div>

            {vizProjects.length === 0 && (
              <div
                className="text-sm py-8 text-center"
                style={{ color: 'var(--text-muted)', gridColumn: '2/-1' }}
              >
                Create a project to mix and match design options.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── New Decision Modal ── */}
      <Modal
        open={newDecisionOpen}
        onClose={() => setNewDecisionOpen(false)}
        title="New Decision"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewDecisionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNewDecision}>Create</Button>
          </>
        }
      >
        <div>
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Living Room Sofa"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewDecision();
            }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ── New Visualizer Modal ── */}
      <Modal
        open={newVizOpen}
        onClose={() => setNewVizOpen(false)}
        title="New Visualizer Project"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewVizOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNewVisualizer}>Create</Button>
          </>
        }
      >
        <div>
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Project Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Baby's Room"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewVisualizer();
            }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type === 'decision' ? 'decision' : 'project'}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              style={{ background: 'var(--danger)', color: 'white', border: 'none' }}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Are you sure you want to delete &ldquo;
          <strong style={{ color: 'var(--text)' }}>{deleteTarget?.name}</strong>
          &rdquo;? This will permanently remove all rooms, options, and renderings. This cannot be
          undone.
        </p>
      </Modal>
    </>
  );
}
