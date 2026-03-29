'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { ToastProvider } from '@/components/Toast';
import { useAuth } from '@/hooks/use-auth';
import {
  getUserDecisions,
  createDecision,
  getUserVizProjects,
  createVizProject,
} from '@/lib/db';
import type { Decision, VizProject } from '@/lib/types';

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

  // Load on mount — middleware already verified auth and set cookies
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const [d, v] = await Promise.all([
        getUserDecisions(user.id),
        getUserVizProjects(user.id),
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
        <h2 className="text-2xl font-bold mb-8" style={{ letterSpacing: '-0.04em' }}>
          Envision
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
          {/* Decisions */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold" style={{ letterSpacing: '-0.02em' }}>
                Decisions
              </h3>
              <Button size="sm" onClick={() => { setNewName(''); setNewDecisionOpen(true); }}>
                + New
              </Button>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {activeDecisions.map((d) => (
                <div
                  key={d.id}
                  onClick={() => router.push(`/decisions/${d.id}`)}
                  className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
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
                    className="flex items-center justify-center"
                    style={{ height: 100, background: '#ede9e4', fontSize: 28, color: '#ccc8c3' }}
                  >
                    🪑
                  </div>
                  <div className="p-3.5">
                    <div className="font-semibold text-sm mb-1" style={{ letterSpacing: '-0.025em' }}>
                      {d.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
              {activeDecisions.length === 0 && (
                <div className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>
                  <strong className="block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    No decisions yet
                  </strong>
                  Start a new one to compare furniture in your space.
                </div>
              )}
            </div>

            {decidedDecisions.length > 0 && (
              <div className="mt-8">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
                  Decided
                </h4>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                  {decidedDecisions.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => router.push(`/decisions/${d.id}`)}
                      className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: 0.7 }}
                    >
                      <div className="p-3.5">
                        <span
                          className="inline-block text-xs font-semibold uppercase mb-2 rounded px-2 py-0.5"
                          style={{ color: 'var(--success)', background: '#edf5ee', letterSpacing: '0.06em', fontSize: 10 }}
                        >
                          Decided
                        </span>
                        <div className="font-semibold text-sm">{d.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Visualizer */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold" style={{ letterSpacing: '-0.02em' }}>
                Room Visualizer
              </h3>
              <Button size="sm" onClick={() => { setNewName(''); setNewVizOpen(true); }}>
                + New
              </Button>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {vizProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/visualizer/${p.id}`)}
                  className="rounded-2xl cursor-pointer transition-all overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
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
                    className="flex items-center justify-center"
                    style={{ height: 100, background: '#ede9e4', fontSize: 28, color: '#ccc8c3' }}
                  >
                    🏠
                  </div>
                  <div className="p-3.5">
                    <div className="font-semibold text-sm mb-1" style={{ letterSpacing: '-0.025em' }}>
                      {p.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
              {vizProjects.length === 0 && (
                <div className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>
                  <strong className="block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    No projects yet
                  </strong>
                  Create a project to mix and match design options.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Decision Modal */}
      <Modal
        open={newDecisionOpen}
        onClose={() => setNewDecisionOpen(false)}
        title="New Decision"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewDecisionOpen(false)}>Cancel</Button>
            <Button onClick={handleNewDecision}>Create</Button>
          </>
        }
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Living Room Sofa"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNewDecision(); }}
            autoFocus
          />
        </div>
      </Modal>

      {/* New Visualizer Modal */}
      <Modal
        open={newVizOpen}
        onClose={() => setNewVizOpen(false)}
        title="New Visualizer Project"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewVizOpen(false)}>Cancel</Button>
            <Button onClick={handleNewVisualizer}>Create</Button>
          </>
        }
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Project Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Baby's Room"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1.5px solid var(--border)', fontFamily: 'inherit' }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNewVisualizer(); }}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
