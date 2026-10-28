/** Keep search crawlers out until launch; account and admin routes stay private. */
import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const launched = process.env.LAUNCH_READY === 'true';
  return {
    rules: launched
      ? [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/account', '/api', '/checkout', '/cart', '/order-status'],
          },
        ]
      : [{ userAgent: '*', disallow: '/' }],
    ...(launched && process.env.NEXT_PUBLIC_SITE_URL
      ? { sitemap: new URL('/sitemap.xml', process.env.NEXT_PUBLIC_SITE_URL).toString() }
      : {}),
  };
}
