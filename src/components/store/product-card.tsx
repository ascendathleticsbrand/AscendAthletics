/**
 * Reusable public product card: links to the detail page and shows its first image and price.
 * The availability badge requires a variant with confirmed opening stock and a positive available quantity.
 */
import Link from 'next/link';
import { Shirt } from 'lucide-react';
import type { Product } from '@/lib/backend/types';
import { money } from '@/lib/format';
export function ProductCard({ product }: { product: Product }) {
  const available = product.variants.some(
    (v) => v.opening_stock_confirmed && v.available_quantity > 0,
  );
  return (
    <Link href={`/shop/${product.slug}`} className="product-card">
      <div className="product-image">
        {product.images[0] ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" />
        ) : (
          <Shirt size={90} strokeWidth={0.6} />
        )}
        <span className="tag">{available ? 'Available' : 'Sold out'}</span>
      </div>
      <div className="product-meta">
        <h3>{product.name}</h3>
        <p>{money(product.price_ngn)}</p>
      </div>
      <span className="stock-label">
        {available ? 'Explore sizes & colours' : 'Restock to be confirmed'}
      </span>
    </Link>
  );
}
