// Shared admin navigation and workspace frame. Pages supply the section content as children.
'use client';

import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  CircleUserRound,
  CreditCard,
  Dumbbell,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from 'lucide-react';

// One navigation list drives desktop links, mobile links and the active breadcrumb.
export const adminNavigation = [
  { id: 'overview', label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { id: 'products', label: 'Products', href: '/admin/products', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory', href: '/admin/inventory', icon: Boxes },
  { id: 'orders', label: 'Orders', href: '/admin/orders', icon: Package },
  { id: 'customers', label: 'Customers', href: '/admin/customers', icon: Users },
  { id: 'clients', label: 'Coaching Clients', href: '/admin/clients', icon: Dumbbell },
  { id: 'packages', label: 'Training Packages', href: '/admin/packages', icon: FileText },
  { id: 'payments', label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { id: 'finances', label: 'Finances', href: '/admin/finances', icon: BarChart3 },
  { id: 'marketing', label: 'Marketing', href: '/admin/marketing', icon: Megaphone },
  { id: 'content', label: 'Website Content', href: '/admin/content', icon: FileText },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: Settings },
];

// The drawer state is visual only; access is checked by the server layout and API.
export function AdminShell({
  children,
  role,
  setupRequired,
  email,
}: {
  children: React.ReactNode;
  role?: string;
  setupRequired: boolean;
  email?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = adminNavigation.find((item) => item.href === pathname) || adminNavigation[0];
  return (
    <div className="admin-root">
      <button
        className="admin-mobile-bar"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin navigation"
        aria-expanded={mobileOpen}
        aria-controls="admin-sidebar"
      >
        <Menu size={22} />
        <BrandLogo className="admin-mobile-logo" />
      </button>
      {mobileOpen && (
        <button
          className="admin-nav-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside id="admin-sidebar" className={`admin-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="admin-sidebar-brand">
          <Link href="/admin" aria-label="ASCEND Athletics admin overview">
            <BrandLogo className="admin-logo" />
          </Link>
          <button
            className="admin-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="admin-workspace-name">
          <span className="admin-live-dot" />
          <span>Business workspace</span>
          <ChevronDown size={14} />
        </div>
        <nav aria-label="Admin navigation">
          <p className="admin-nav-label">YOUR BUSINESS</p>
          {adminNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`admin-nav-link ${pathname === href ? 'active' : ''}`}
              aria-current={pathname === href ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {pathname === href && <span className="admin-nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link href="/" target="_blank" className="admin-store-link">
            View storefront <ArrowUpRight size={16} />
          </Link>
          <div className="admin-user">
            <div className="admin-avatar">
              <CircleUserRound size={22} />
            </div>
            <div>
              <strong>
                {setupRequired
                  ? 'Workspace preview'
                  : role === 'owner'
                    ? 'Owner / Coach'
                    : 'Assistant'}
              </strong>
              <span>
                {setupRequired ? 'Configuration required' : email || 'Signed in securely'}
              </span>
            </div>
            <Check size={15} />
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            Workspace <span>/</span> <strong>{active.label}</strong>
          </div>
          <div className="admin-topbar-actions">
            <span className={`admin-connection ${setupRequired ? 'needs-setup' : ''}`}>
              <span />
              {setupRequired ? 'Setup required' : 'Connected workspace'}
            </span>
            <Link href="/account" className="admin-profile-link" aria-label="Open account">
              <CircleUserRound size={22} />
            </Link>
          </div>
        </header>
        <main id="admin-main" className="admin-main">
          {children}
        </main>
        <footer className="admin-page-footer">
          <span>ASCEND ATHLETICS</span>
          <span>RISE. PUSH. BECOME.</span>
        </footer>
      </div>
    </div>
  );
}
