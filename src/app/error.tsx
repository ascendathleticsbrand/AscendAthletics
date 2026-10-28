/** Client-side error boundary: the retry button asks Next.js to render again. */
'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="view-error">
      <p className="eyebrow">LET’S TRY THAT AGAIN</p>
      <h1>A QUICK PAUSE.</h1>
      <p>We couldn’t load this page. Check your connection and try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
