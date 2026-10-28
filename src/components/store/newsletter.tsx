'use client';

/**
 * Newsletter signup: sends an email address and explicit marketing consent to the newsletter API.
 * Subscription success and connection errors are announced in the existing form feedback area.
 */
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
export function Newsletter() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="newsletter-section">
      <div>
        <p className="eyebrow">STAY IN THE MOVEMENT</p>
        <h2>
          The next drop.
          <br />
          Your next chapter.
        </h2>
        <p>Collection news, training updates, and a little motivation.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setStatus('');
          const data = new FormData(e.currentTarget);
          try {
            const r = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: data.get('email'), consent: true }),
            });
            const j = await r.json();
            setStatus(
              r.ok
                ? 'You’re on the list. You can unsubscribe at any time.'
                : j.error || 'Subscription is unavailable. Please try again.',
            );
          } catch {
            setStatus('Connection unavailable. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="newsletter-input">
          <label className="sr-only" htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            placeholder="Your email address"
            required
            maxLength={254}
          />
          <button aria-label="Subscribe to collection news" disabled={busy}>
            {busy ? '…' : <ArrowRight size={24} />}
          </button>
        </div>
        <label className="check-label">
          <input type="checkbox" name="consent" required />I agree to receive ASCEND emails.
          Unsubscribe anytime.
        </label>
        <p role="status" className="form-feedback">
          {status}
        </p>
      </form>
    </section>
  );
}
