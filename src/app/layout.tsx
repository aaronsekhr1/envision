import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Envision',
  description: 'AI-powered interior design visualization',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
