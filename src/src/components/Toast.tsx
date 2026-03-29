'use client';

import { useEffect, useState } from 'react';

let _toastFn: ((msg: string, duration?: number) => void) | null = null;

export function showToast(msg: string, duration = 3000) {
  _toastFn?.(msg, duration);
}

export function ToastProvider() {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    _toastFn = (msg, duration = 3000) => {
      setMessage(msg);
      setVisible(true);
      setTimeout(() => setVisible(false), duration);
    };
    return () => { _toastFn = null; };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] rounded-xl px-6 py-3 text-sm text-white"
      style={{ background: 'var(--accent)', animation: 'toast-in 0.3s ease' }}
    >
      {message}
    </div>
  );
}
