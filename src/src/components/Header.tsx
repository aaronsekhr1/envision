'use client';

import { useSettings } from '@/hooks/use-settings';
import { useAuth } from '@/hooks/use-auth';
import { GEMINI_MODELS } from '@/lib/types';
import { testApiKey } from '@/lib/gemini';
import { useState } from 'react';

interface HeaderProps {
  breadcrumb?: { label: string; onClick?: () => void }[];
}

export function Header({ breadcrumb }: HeaderProps) {
  const { apiKey, setApiKey, model, setModel } = useSettings();
  const { user, signOut } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  async function handleTest() {
    if (!apiKey) {
      setTestResult('Enter an API key first');
      return;
    }
    setTesting(true);
    setTestResult('');
    try {
      const msg = await testApiKey(apiKey, model);
      setTestResult(msg);
    } catch (e) {
      setTestResult(`Error: ${(e as Error).message}`);
    }
    setTesting(false);
    setTimeout(() => setTestResult(''), 4000);
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 md:px-8"
      style={{
        height: 58,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        {breadcrumb?.map((bc, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span style={{ color: '#d4d0cb' }}>/</span>}
            {bc.onClick ? (
              <button
                onClick={bc.onClick}
                className="bg-transparent border-none cursor-pointer transition-colors"
                style={{ color: 'var(--text-secondary)', fontFamily: 'inherit', padding: 0, fontSize: 14 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {bc.label}
              </button>
            ) : (
              <span className="font-semibold truncate" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
                {bc.label}
              </span>
            )}
          </span>
        )) ?? (
          <span className="font-semibold" style={{ letterSpacing: '-0.01em' }}>
            Envision
          </span>
        )}
      </div>

      {/* Right side: settings */}
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Gemini API key"
          className="text-xs rounded-lg outline-none transition-colors font-mono"
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border)',
            background: '#faf9f7',
            color: '#666',
            width: 180,
          }}
        />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as typeof model)}
          className="text-xs rounded-lg outline-none cursor-pointer"
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border)',
            background: '#faf9f7',
            color: '#555',
          }}
        >
          {GEMINI_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleTest}
          disabled={testing}
          className="text-xs rounded-md cursor-pointer text-white"
          style={{ padding: '4px 10px', background: '#444' }}
        >
          {testing ? '...' : 'Test'}
        </button>
        {testResult && (
          <span className="text-xs" style={{ color: testResult.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
            {testResult}
          </span>
        )}
        {user && (
          <button
            onClick={signOut}
            className="text-xs rounded-md cursor-pointer transition-colors ml-2"
            style={{ padding: '4px 10px', color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
