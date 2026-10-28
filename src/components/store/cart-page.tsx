'use client';

/**
 * Shopping-bag view: displays saved items, quantity controls and the merchandise subtotal.
 * These browser-side prices and quantities are checked again by the server when checkout creates an order.
 */
import Link from 'next/link';
import { ShoppingBag, Minus, Plus, ArrowRight, Shirt, Trash2 } from 'lucide-react';
import { useCart } from './cart-context';
import { money } from '@/lib/format';
export function CartPage() {
  const { items, ready, change, remove, subtotal, storageWarning } = useCart();
  if (!ready) return <p role="status">Loading your bag…</p>;
  if (!items.length)
    return (
      <div className="empty-state">
        {storageWarning && (
          <p className="notice" role="status">
            {storageWarning}
          </p>
        )}
        <ShoppingBag size={40} strokeWidth={1} />
        <h2>Your next chapter starts here.</h2>
        <p>Your bag is empty. Explore the ASCEND shop to get started.</p>
        <Link href="/shop" className="button">
          Explore merchandise <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="two-column">
      <div>
        {storageWarning && (
          <p className="notice" role="status">
            {storageWarning}
          </p>
        )}
        {items.map((i) => (
          <div className="cart-row" key={i.variant_id}>
            {i.image ? (
              <img src={i.image} alt={i.name} />
            ) : (
              <div className="cart-placeholder">
                <Shirt size={30} />
              </div>
            )}
            <div className="cart-item-info">
              <Link href={`/shop/${i.slug}`}>
                <h3>{i.name}</h3>
              </Link>
              <p>
                {[i.size, i.color].filter(Boolean).join(' / ')} · {i.sku}
              </p>
              <div className="cart-controls">
                <div className="quantity-input">
                  <button
                    aria-label={`Decrease ${i.name} quantity`}
                    disabled={i.quantity <= 1}
                    onClick={() => change(i.variant_id, i.quantity - 1)}
                  >
                    <Minus size={13} />
                  </button>
                  <span>{i.quantity}</span>
                  <button
                    aria-label={`Increase ${i.name} quantity`}
                    disabled={i.quantity >= i.available}
                    onClick={() => change(i.variant_id, i.quantity + 1)}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <button
                  className="cart-remove"
                  aria-label={`Remove ${i.name}`}
                  onClick={() => remove(i.variant_id)}
                >
                  Remove
                </button>
              </div>
            </div>
            <strong>{money(i.price * i.quantity)}</strong>
          </div>
        ))}
      </div>
      <aside>
        <div className="panel">
          <h2>Your order summary</h2>
          <div className="summary-row">
            <span>Merchandise subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Delivery</span>
            <span>Confirmed at checkout</span>
          </div>
          <div className="summary-row total">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <p>
            Prices and stock are checked again when your order is created. Pay by bank transfer
            after the full total is confirmed.
          </p>
          <Link href="/checkout" className="button" style={{ width: '100%', marginTop: 15 }}>
            Continue to checkout <ArrowRight size={16} />
          </Link>
          <Link
            href="/shop"
            style={{ display: 'block', textAlign: 'center', fontSize: 11, marginTop: 20 }}
          >
            Continue shopping
          </Link>
        </div>
      </aside>
    </div>
  );
}
