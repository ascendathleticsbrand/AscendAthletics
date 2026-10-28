/**
 * Storefront loading boundary: announces that a customer page is still being prepared.
 */
export default function Loading() {
  return (
    <div className="container page-body">
      <p className="eyebrow" role="status">
        LOADING YOUR NEXT CHAPTER…
      </p>
    </div>
  );
}
