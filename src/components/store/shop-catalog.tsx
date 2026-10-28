'use client';

/**
 * Interactive shop filters applied to the public catalog supplied by the server.
 * Size and colour selections must match an available variant; category defaults keep empty catalogs navigable.
 */
import { useState } from 'react';
import { Search, Package, ArrowUpRight } from 'lucide-react';
import { ProductCard } from './product-card';
import type { PublicCatalog } from '@/lib/backend/types';
import { whatsapp } from '@/lib/format';
const defaults = [
  ['Compression Shirts', 'compression-shirts'],
  ['Gym Tops', 'gym-tops'],
  ['Shorts', 'shorts'],
  ['Joggers', 'joggers'],
  ['Gym Accessories', 'gym-accessories'],
  ['Other Merchandise', 'other-merchandise'],
  ['Supplements', 'supplements'],
];
export function ShopCatalog({
  catalog,
  initialCategory = '',
}: {
  catalog: PublicCatalog;
  initialCategory?: string;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [maxPrice, setMaxPrice] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const categories = catalog.categories.length
    ? catalog.categories.map((c) => ({
        id: String(c.id),
        name: String(c.name),
        slug: String(c.slug),
      }))
    : defaults.map(([name, slug]) => ({ id: slug, name, slug }));
  const sizes = [
    ...new Set(catalog.products.flatMap((p) => p.variants.map((v) => v.size).filter(Boolean))),
  ];
  const colors = [
    ...new Set(catalog.products.flatMap((p) => p.variants.map((v) => v.color).filter(Boolean))),
  ];
  const visible = catalog.products.filter((p) => {
    const c = categories.find((c) => c.slug === category);
    return (
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (!category || p.category_id === c?.id) &&
      (!maxPrice || p.price_ngn <= Number(maxPrice)) &&
      (!(size || color) ||
        p.variants.some(
          (v) =>
            (!size || v.size === size) && (!color || v.color === color) && v.available_quantity > 0,
        ))
    );
  });
  const awaitingSupplements =
    category === 'supplements' &&
    !catalog.products.some(
      (p) => p.category_id === categories.find((c) => c.slug === 'supplements')?.id,
    );
  return (
    <>
      <div className="filters">
        <label className="search">
          <span className="sr-only">Search merchandise</span>
          <input
            className="field"
            placeholder="Search merchandise"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Maximum price in naira</span>
          <input
            className="field price-filter"
            type="number"
            min="0"
            placeholder="Max price (₦)"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </label>
        {sizes.length > 0 && (
          <label>
            <span className="sr-only">Size</span>
            <select className="field" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">All sizes</option>
              {sizes.map((s) => (
                <option key={s} value={s!}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {colors.length > 0 && (
          <label>
            <span className="sr-only">Colour</span>
            <select className="field" value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">All colours</option>
              {colors.map((c) => (
                <option key={c} value={c!}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="result-count">
        {visible.length} {visible.length === 1 ? 'product' : 'products'}
        {category
          ? ` · ${categories.find((c) => c.slug === category)?.name || 'Selected category'}`
          : ''}
      </p>
      {visible.length > 0 ? (
        <div className="product-grid">
          {visible.map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Package size={38} strokeWidth={1} />
          <h2>
            {awaitingSupplements
              ? 'No supplements listed yet.'
              : catalog.products.length
                ? 'No products match your filters.'
                : 'The next chapter is coming.'}
          </h2>
          <p>
            {awaitingSupplements
              ? 'Check back for supplement products, prices and availability.'
              : catalog.products.length
                ? 'Try another category or clear your search.'
                : 'We’re preparing our merchandise catalog. Only products with confirmed prices and stock will be available to order.'}
          </p>
          {catalog.products.length ? (
            <button
              className="button secondary"
              onClick={() => {
                setSearch('');
                setCategory('');
                setMaxPrice('');
                setColor('');
                setSize('');
              }}
            >
              Clear filters
            </button>
          ) : (
            <a
              className="button secondary"
              href={whatsapp('Hi ASCEND ATHLETICS, please tell me about upcoming merchandise.')}
              target="_blank"
              rel="noreferrer"
            >
              Ask on WhatsApp <ArrowUpRight size={16} />
            </a>
          )}
        </div>
      )}
    </>
  );
}
