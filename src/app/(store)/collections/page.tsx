/**
 * Collections page: lists published collection announcements from the public catalog.
 * When no collection is available, the existing empty state links customers back to the shop.
 */
import Link from 'next/link';
import { Layers, ArrowUpRight } from 'lucide-react';
import { getPublicCatalog } from '@/lib/catalog';
import { businessDate } from '@/lib/format';
import { Newsletter } from '@/components/store/newsletter';
export const metadata = { title: 'Collections & product drops' };
export const dynamic = 'force-dynamic';
export default async function Collections() {
  const catalog = await getPublicCatalog();
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">THE NEXT CHAPTER</p>
          <h1>ASCEND COLLECTIONS.</h1>
          <p>New drops. New energy. Discover the latest ASCEND merchandise collections.</p>
        </div>
      </div>
      <section className="container page-body">
        {catalog.collections.length ? (
          catalog.collections.map((c: any) => (
            <Link className="collection-card" key={c.id} href={`/collections/${c.slug}`}>
              {c.banner_path && <img src={c.banner_path} alt={c.name} />}
              <span className="eyebrow">
                {c.status === 'upcoming' ? 'UPCOMING DROP' : 'THE COLLECTION'}
                {c.launch_at ? ` · ${businessDate(c.launch_at)}` : ''}
              </span>
              <h2>{c.name}</h2>
              <p>{c.description}</p>
              <span className="text-link">
                Explore the collection <ArrowUpRight size={16} />
              </span>
            </Link>
          ))
        ) : (
          <div className="empty-state">
            <Layers size={38} strokeWidth={1} />
            <h2>The next drop is taking shape.</h2>
            <p>
              Collection announcements will appear here when the owner publishes them. Join the
              newsletter to hear what’s next.
            </p>
            <Link className="button secondary" href="/shop">
              Explore merchandise <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <Newsletter />
    </>
  );
}
