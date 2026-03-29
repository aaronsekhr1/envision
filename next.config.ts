import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pszvkebbpdpynkzkhuan.supabase.co' },
    ],
  },
};

export default nextConfig;
