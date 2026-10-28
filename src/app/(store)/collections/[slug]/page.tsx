/**
 * Collection detail route: resolves the URL slug against the public catalog.
 * Only products assigned to that collection are displayed; an unknown slug returns the normal 404 page.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicCatalog } from '@/lib/catalog';
import { ProductCard } from '@/components/store/product-card';
import { Newsletter } from '@/components/store/newsletter';
export const dynamic = 'force-dynamic';
/** Use the selected collection content for the browser title and shared-link preview. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicCatalog();
  const c = catalog.collections.find((c: any) => c.slug === slug) as any;
  return {
    title: c?.name || 'Collection unavailable',
    description: c?.description,
    openGraph: c
      ? {
          title: c.name,
          description: c.description,
          url: `/collections/${c.slug}`,
          images: c.banner_path ? [c.banner_path] : undefined,
        }
      : undefined,
  };
}
export default async function Collection({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getPublicCatalog();
  const c = catalog.collections.find((c: any) => c.slug === slug) as any;
  if (!c) notFound();
  const ids = new Set((c.collection_products || []).map((p: any) => p.product_id));
  const products = catalog.products.filter((p) => ids.has(p.id));
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/collections">Collections</Link>
            <span>/</span>
            <span>{c.name}</span>
          </div>
          <p className="eyebrow">{c.status === 'upcoming' ? 'UPCOMING DROP' : 'THE COLLECTION'}</p>
          <h1>{c.name.toUpperCase()}.</h1>
          <p>{c.description}</p>
        </div>
      </div>
      <section className="container page-body">
        {c.banner_path && (
          <img
            src={c.banner_path}
            alt={c.name}
            style={{ width: '100%', maxHeight: 450, objectFit: 'cover', marginBottom: 35 }}
          />
        )}
        {products.length ? (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>
              {c.status === 'upcoming'
                ? 'This drop is coming soon.'
                : 'Merchandise is being prepared.'}
            </h2>
            <p>
              Products will be available after the collection launches and inventory is confirmed.
            </p>
            <Link href="/shop" className="button secondary">
              Explore the shop
            </Link>
          </div>
        )}
      </section>
      <Newsletter />
    </>
  );
}
