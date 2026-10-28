// Client error boundary for admin routes. The retry button asks Next.js to render the section again.
'use client';
import { CircleAlert, RefreshCw } from 'lucide-react';
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="admin-error-page" role="alert">
      <CircleAlert size={34} strokeWidth={1.5} />
      <p className="admin-eyebrow">WORKSPACE UNAVAILABLE</p>
      <h1>Your records could not be loaded.</h1>
      <p>Check the database connection and staff permissions, then try again.</p>
      <button className="admin-button admin-button-gold" onClick={reset}>
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  );
}
