'use client';

/**
 * Interactive product gallery, variant selection and add-to-bag controls.
 * Only variants with confirmed opening stock are shown; server checkout rechecks their current stock and price.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Shirt, ArrowUpRight } from 'lucide-react';
import type { Product } from '@/lib/backend/types';
import { money, whatsapp } from '@/lib/format';
import { useCart } from './cart-context';
export function ProductDetail({ product }: { product: Product }) {
  const variants = product.variants.filter((v) => v.opening_stock_confirmed);
  const [selected, setSelected] = useState(
    variants.find((v) => v.available_quantity > 0)?.id || variants[0]?.id || '',
  );
  const variant = variants.find((v) => v.id === selected);
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const available = variant?.available_quantity || 0;
  return (
    <div className="product-detail">
      <div className="product-gallery">
        {product.images[photo] ? (
          <img src={product.images[photo]} alt={product.name} className="main-product-image" />
        ) : (
          <div className="empty-state">
            <Shirt size={80} />
            <p>Product image not yet available.</p>
          </div>
        )}
        {product.images.length > 1 && (
          <div className="gallery-thumbs">
            {product.images.map((url, i) => (
              <button
                aria-label={`View product image ${i + 1}`}
                onClick={() => setPhoto(i)}
                key={i}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="product-details">
        <p className="eyebrow">ASCEND MERCHANDISE</p>
        <h1>{product.name}</h1>
        <p className="product-price">{money(product.price_ngn)}</p>
        <p className="product-description">{product.description}</p>
        <p className="field-label">Choose size & colour</p>
        <div className="variant-buttons">
          {variants.map((v) => (
            <button
              type="button"
              className={selected === v.id ? 'selected' : ''}
              aria-pressed={selected === v.id}
              disabled={v.available_quantity <= 0}
              key={v.id}
              onClick={() => {
                setSelected(v.id);
                setQuantity(1);
                setAdded(false);
              }}
            >
              {[v.size, v.color].filter(Boolean).join(' / ') || v.sku}
              {v.available_quantity <= 0 ? ' · Sold out' : ''}
            </button>
          ))}
        </div>
        <span className="stock-label">
          {available > 0 ? 'Available for order' : 'Sold out — restock to be confirmed'}
        </span>
        <div className="detail-add">
          <div className="quantity-input">
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => q - 1)}
            >
              <Minus size={14} />
            </button>
            <span>{quantity}</span>
            <button
              aria-label="Increase quantity"
              disabled={quantity >= available || quantity >= 99}
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            className="button"
            disabled={!variant || available < 1}
            onClick={() => {
              if (variant)
                add({
                  variant_id: variant.id,
                  product_id: product.id,
                  slug: product.slug,
                  name: product.name,
                  sku: variant.sku,
                  size: variant.size,
                  color: variant.color,
                  image: product.images[0] || null,
                  price: product.price_ngn,
                  quantity,
                  available,
                });
              setAdded(true);
            }}
          >
            {added ? 'Added to bag' : 'Add to bag'}
            <ShoppingBag size={17} />
          </button>
        </div>
        {added && (
          <Link href="/cart" className="text-link">
            Review your bag <ArrowUpRight size={15} />
          </Link>
        )}
        <details>
          <summary>Size guide</summary>
          <p>{product.size_guide || 'Contact us for size guidance before placing your order.'}</p>
        </details>
        <details>
          <summary>Payment, pickup & delivery</summary>
          <p>
            Pay by manual bank transfer after your order total is confirmed. Pickup details and
            delivery fees are confirmed during checkout. Payment evidence is reviewed by the owner.
          </p>
        </details>
        <a
          className="text-link"
          href={whatsapp(`Hi ASCEND ATHLETICS, I have a question about ${product.name}.`)}
          target="_blank"
          rel="noreferrer"
        >
          Ask about this item <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}
