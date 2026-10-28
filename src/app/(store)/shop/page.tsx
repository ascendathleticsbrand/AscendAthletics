/**
 * Shop route: loads the public catalog and the optional category from the URL.
 * ShopCatalog applies the interactive search, price, size and colour filters to that snapshot.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicCatalog } from '@/lib/catalog';
import { ShopCatalog } from '@/components/store/shop-catalog';
export const metadata: Metadata = { title: 'Merchandise' };
export const dynamic = 'force-dynamic';
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [catalog, params] = await Promise.all([getPublicCatalog(), searchParams]);
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Shop</span>
          </div>
          <p className="eyebrow">APPAREL FOR THE WORK</p>
          <h1>THE ASCEND SHOP.</h1>
          <p>Choose your apparel and accessories. Bring your effort.</p>
        </div>
      </div>
      <section className="page-body container">
        <ShopCatalog catalog={catalog} initialCategory={params.category} />
      </section>
    </>
  );
}
