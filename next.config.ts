/** Shared Next.js build, image-host and response-header configuration. */
import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // Limit parallel build workers on development machines with constrained memory.
  experimental: { cpus: 2, agentUpgrade: 'security' },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
