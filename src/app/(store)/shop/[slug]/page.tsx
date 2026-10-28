/**
 * Product detail route: resolves a public product by slug and builds its page metadata.
 * The gallery and bag controls receive that product; related items come from the same category.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicProduct, getPublicCatalog } from '@/lib/catalog';
import { ProductDetail } from '@/components/store/product-detail';
import { ProductCard } from '@/components/store/product-card';
export const dynamic = 'force-dynamic';
/** Use the public product details for the browser title and shared-link preview. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicProduct(slug);
  return {
    title: p?.name || 'Product unavailable',
    description: p?.description,
    openGraph: p
      ? {
          title: p.name,
          description: p.description,
          images: p.images.length ? p.images : undefined,
        }
      : undefined,
  };
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublicProduct(slug);
  if (!product) notFound();
  const catalog = await getPublicCatalog();
  const related = catalog.products
    .filter((p) => p.id !== product.id && p.category_id === product.category_id)
    .slice(0, 3);
  return (
    <div className="container page-body">
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <ProductDetail product={product} />
      {related.length > 0 && (
        <section className="section">
          <p className="eyebrow">KEEP THE MOMENTUM</p>
          <h2>MORE FOR YOUR NEXT LEVEL.</h2>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
