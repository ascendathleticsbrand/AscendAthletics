'use client';

/**
 * Payment-evidence form shared by customer coaching accounts and private order pages.
 * An optional proof image uses a signed private upload; submitting evidence never marks a payment verified.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './request';
export function EvidenceForm({
  endpoint,
  invoiceId,
  guestToken,
  onSuccess,
}: {
  endpoint: string;
  invoiceId: string;
  guestToken?: string;
  onSuccess?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <form
      className="evidence-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setMessage('');
        const form = e.currentTarget;
        const f = new FormData(form);
        try {
          let proof_path: string | undefined;
          const file = f.get('proof') as File | null;
          if (file?.size) {
            if (
              file.size > 5 * 1024 * 1024 ||
              !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
            )
              throw new Error('Choose a JPEG, PNG, or WebP image up to 5 MB.');
            const upload = await api('/api/uploads', {
              invoice_id: invoiceId,
              guest_token: guestToken,
              mime: file.type,
              size: file.size,
            });
            const response = await fetch(upload.signedUploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': file.type },
              body: file,
            });
            if (!response.ok) throw new Error('Proof upload failed. Please try again.');
            proof_path = upload.path;
          }
          await api(endpoint, {
            amount: Number(f.get('amount')),
            transfer_reference: f.get('transfer_reference'),
            bank_name: f.get('bank_name') || undefined,
            transferred_at: f.get('transferred_at')
              ? new Date(String(f.get('transferred_at'))).toISOString()
              : undefined,
            proof_path,
          });
          setMessage(
            'Payment evidence submitted — awaiting manual verification. This does not confirm receipt of funds.',
          );
          form.reset();
          router.refresh();
          await onSuccess?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to submit evidence.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Submit transfer information</h3>
      <p>
        Submit only after making your transfer. The owner must confirm the bank credit before
        payment is verified.
      </p>
      <div className="form-grid">
        <label>
          <span className="field-label">Amount transferred (₦)</span>
          <input
            className="field"
            type="number"
            name="amount"
            min="0.01"
            max="100000000"
            step="0.01"
            required
          />
        </label>
        <label>
          <span className="field-label">Transfer reference</span>
          <input
            className="field"
            name="transfer_reference"
            minLength={3}
            maxLength={160}
            required
          />
        </label>
        <label>
          <span className="field-label">Sending bank (optional)</span>
          <input className="field" name="bank_name" maxLength={100} />
        </label>
        <label>
          <span className="field-label">Transfer date & time (optional)</span>
          <input className="field" name="transferred_at" type="datetime-local" />
        </label>
        <label className="full">
          <span className="field-label">Payment proof image (optional, up to 5 MB)</span>
          <input
            className="field"
            name="proof"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
      </div>
      <p role="alert" className="form-feedback error">
        {error}
      </p>
      <p role="status" className="form-feedback">
        {message}
      </p>
      <button className="button small" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit payment evidence'}
      </button>
    </form>
  );
}
