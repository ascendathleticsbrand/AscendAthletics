/** Shared Next.js build, image-host and response-header configuration. */
import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // Limit parallel build workers on development machines with constrained memory.
  experimental: { cpus: 2, agentUpgrade: 'security' },
  images: {
    qualities: [75, 85],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      {
        protocol: 'https',
        hostname: 'pub-ce34609096ed4ef3a803b802b02c92b6.r2.dev',
      },
    ],
  },
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=15552000' });
    }
    return [
      {
        source: '/:path*',
        headers,
      },
    ];
  },
};
export default config;
