/**
 * Cart route: provides the page heading and delegates the saved shopping bag to CartPage.
 * The shared CartProvider owns quantities and browser storage.
 */
import { CartPage } from '@/components/store/cart-page';
export const metadata = { title: 'Your bag' };
export default function Cart() {
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>YOUR BAG.</h1>
        </div>
      </div>
      <div className="container page-body">
        <CartPage />
      </div>
    </>
  );
}
