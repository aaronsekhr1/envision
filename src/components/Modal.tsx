'use client';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-[22px] overflow-y-auto"
        style={{
          background: 'var(--bg-card)', padding: '30px 32px',
          width: 460, maxWidth: '94vw', maxHeight: '90vh',
          boxShadow: '0 16px 64px rgba(0,0,0,0.2)',
        }}
      >
        <h2 className="text-lg font-bold mb-6" style={{ letterSpacing: '-0.03em' }}>
          {title}
        </h2>
        {children}
        {actions && (
          <div className="flex gap-2 justify-end mt-6">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
