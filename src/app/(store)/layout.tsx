/**
 * Shared storefront layout: surrounds each customer page with the header and footer.
 * The main-content ID is the destination of the root layout accessibility skip link.
 */
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}
