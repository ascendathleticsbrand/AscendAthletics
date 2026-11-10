/** Shared HTML shell, page metadata and the customer cart provider. */
import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/components/store/cart-context';
import { connection } from 'next/server';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'ASCEND ATHLETICS | RISE. PUSH. BECOME.', template: '%s | ASCEND ATHLETICS' },
  description:
    'Performance merchandise. Physical and online personal training. Built for your next level.',
  icons: {
    icon: [
      { url: '/brand/ascend-monogram.png', type: 'image/png', sizes: '500x500' },
      { url: '/brand/ascend-monogram.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
  },
  openGraph: {
    title: 'ASCEND ATHLETICS',
    description: 'RISE. PUSH. BECOME.',
    type: 'website',
    images: [
      {
        url: '/brand/ascend-primary.png',
        width: 500,
        height: 500,
        alt: 'ASCEND ATHLETICS official logo',
      },
    ],
  },
  robots: {
    index: process.env.LAUNCH_READY === 'true',
    follow: process.env.LAUNCH_READY === 'true',
  },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A per-request CSP nonce cannot be safely attached to a build-time static page.
  await connection();
  return (
    <html lang="en">
      {/* Browser extensions can add harmless body attributes before hydration. */}
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
