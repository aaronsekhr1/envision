'use client';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

const styles: Record<string, React.CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'white', border: 'none' },
  secondary: { background: 'var(--bg-card)', color: '#444', border: '1px solid var(--border)' },
  ghost: { background: 'none', color: 'var(--text-secondary)', border: 'none' },
  danger: { background: 'none', color: 'var(--danger)', border: 'none' },
};

export function Button({ variant = 'primary', size = 'md', className = '', style, children, ...props }: ButtonProps) {
  const padding = size === 'sm' ? '6px 14px' : '9px 18px';
  const fontSize = size === 'sm' ? 12 : 13;
  const radius = size === 'sm' ? 8 : 10;

  return (
    <button
      className={`inline-flex items-center gap-1.5 font-medium cursor-pointer transition-all whitespace-nowrap ${className}`}
      style={{
        padding,
        fontSize,
        borderRadius: radius,
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
        ...styles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
