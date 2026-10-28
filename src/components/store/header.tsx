'use client';

/**
 * Storefront navigation: renders the official icon, page links, account link and bag count.
 * Only the mobile menu and shopping-bag count need client-side state.
 */
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, ShoppingBag, UserRound, ArrowUpRight } from 'lucide-react';
import { useCart } from './cart-context';

const links = [
  ['Shop', '/shop'],
  ['Collections', '/collections'],
  ['Personal training', '/coaching'],
  ['Our story', '/about'],
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  return (
    <>
      <div className="announcement">
        <span>RISE. PUSH. BECOME.</span>
        <Link href="/coaching">
          Your next level starts here <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="site-header">
        <Link href="/" className="brand-viewport header-brand" aria-label="ASCEND ATHLETICS home">
          <BrandLogo variant="icon" />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(([text, url]) => (
            <Link href={url} key={url} className={pathname === url ? 'active' : ''}>
              {text}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/account" className="account-link" aria-label="Your coaching account">
            <UserRound size={20} />
          </Link>
          <Link href="/cart" aria-label={`Shopping bag, ${count} items`} className="cart-icon">
            <ShoppingBag size={20} />
            {count > 0 && <span>{count}</span>}
          </Link>
          <button
            className="mobile-menu icon-button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {open && (
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">
          {links.map(([text, url]) => (
            <Link key={url} href={url} onClick={() => setOpen(false)}>
              {text}
              <ArrowUpRight size={18} />
            </Link>
          ))}
          <Link href="/account" onClick={() => setOpen(false)}>
            Your account
            <UserRound size={18} />
          </Link>
          <Link href="/contact" onClick={() => setOpen(false)}>
            Contact us
            <ArrowUpRight size={18} />
          </Link>
        </nav>
      )}
    </>
  );
}
