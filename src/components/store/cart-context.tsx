'use client';

/**
 * Shared shopping-bag state for the header, product pages, cart and checkout.
 * Browser storage is restored after mount so the first server and client render start from the same empty bag.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { normalizeCart, addCartItem, changeCartQuantity, type CartItem } from './cart-state';
export type { CartItem } from './cart-state';
type CartContextType = {
  items: CartItem[];
  ready: boolean;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  change: (id: string, q: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  storageWarning: string;
};
const Context = createContext<CartContextType | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  // Restore and normalize saved items only after browser APIs become available.
  useEffect(() => {
    try {
      setItems(normalizeCart(JSON.parse(localStorage.getItem('ascend.cart.v1') || '[]')));
    } catch {
      setStorageWarning(
        'Your saved bag could not be restored. Items added now remain available in this tab.',
      );
    }
    setReady(true);
  }, []);
  // Wait for restoration before persisting, so the initial empty state cannot overwrite a saved bag.
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem('ascend.cart.v1', JSON.stringify(items));
      } catch {
        setStorageWarning('Your bag is available in this tab but cannot be saved on this device.');
      }
  }, [items, ready]);
  const add = (item: CartItem) => setItems((current) => addCartItem(current, item));
  const change = (id: string, q: number) =>
    setItems((current) => changeCartQuantity(current, id, q));
  return (
    <Context.Provider
      value={{
        items,
        ready,
        add,
        change,
        remove: (id) => setItems((current) => current.filter((i) => i.variant_id !== id)),
        clear: () => setItems([]),
        count: items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.price, 0),
        storageWarning,
      }}
    >
      {children}
    </Context.Provider>
  );
}
/** Read the shared bag state; callers must be inside the root CartProvider. */
export function useCart() {
  const c = useContext(Context);
  if (!c) throw new Error('CartProvider required');
  return c;
}
