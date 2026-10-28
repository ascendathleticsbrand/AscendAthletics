/** Shared missing-page screen with a link back to the shop. */
import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="view-error">
      <p className="eyebrow">KEEP MOVING</p>
      <h1>
        NOT HERE.
        <br />
        <span className="gold">NOT THE END.</span>
      </h1>
      <p>This page or product isn’t available. Explore the ASCEND shop or contact us for help.</p>
      <Link className="button" href="/shop">
        Back to the shop
      </Link>
    </main>
  );
}
