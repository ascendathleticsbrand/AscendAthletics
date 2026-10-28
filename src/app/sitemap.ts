/** Publish public page URLs only after launch and when the site origin is configured. */
import type { MetadataRoute } from 'next';
import { getPublicCatalog } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.LAUNCH_READY !== 'true' || !process.env.NEXT_PUBLIC_SITE_URL) return [];
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  const catalog = await getPublicCatalog();
  const routes = [
    '',
    '/shop',
    '/collections',
    '/coaching',
    '/about',
    '/contact',
    '/faq',
    '/privacy',
    '/terms',
    '/returns',
    ...catalog.products.map((p) => '/shop/' + p.slug),
    ...catalog.collections
      .filter((c) => c.status === 'published')
      .map((c) => '/collections/' + String(c.slug)),
  ];
  return routes.map((route) => ({
    url: new URL(route || '/', origin).toString(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.7,
  }));
}
