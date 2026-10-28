'use client';

/**
 * WhatsApp handoff for an already-saved order and invoice.
 * Builds the message after mount, optionally opens WhatsApp once, and keeps manual send/copy controls available.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Copy } from 'lucide-react';
import { buildOrderWhatsApp, type OrderWhatsAppSnapshot } from './order-whatsapp';

export function OrderWhatsAppHandoff({
  snapshot,
  token,
  autoOpen = false,
  businessNumber,
}: {
  snapshot: OrderWhatsAppSnapshot;
  token: string;
  autoOpen?: boolean;
  businessNumber?: string;
}) {
  const attempted = useRef<string | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; orderUrl: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    const orderUrl = new URL(`/order-status/${token}`, window.location.origin).href;
    let prepared;
    try {
      prepared = buildOrderWhatsApp(snapshot, orderUrl, businessNumber);
    } catch {
      setHandoff(null);
      setError('Your order is saved. Please refresh this page to prepare its WhatsApp invoice.');
      return;
    }
    setHandoff({ url: prepared.url, orderUrl });
    if (!autoOpen || attempted.current === token) return;
    attempted.current = token;
    // Consume the one-time intent first so browser Back returns here without opening WhatsApp again.
    window.history.replaceState(window.history.state, '', `/order-status/${token}`);
    setNotice('Your order is saved. WhatsApp is opening; review your invoice and press Send.');
    try {
      window.location.assign(prepared.url);
    } catch {
      setNotice('Your order is saved. Use the WhatsApp button below to send your invoice.');
    }
  }, [snapshot, token, autoOpen, businessNumber]);

  if (!handoff && !error) return null;
  return (
    <section className="panel order-whatsapp-handoff" aria-label="Send your order invoice">
      <h2>{autoOpen ? 'Your order is saved' : 'Send your invoice to ASCEND'}</h2>
      <p>
        WhatsApp opens with your saved order details and private invoice link. Press Send in
        WhatsApp to share them with ASCEND.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {handoff && (
        <div className="button-row">
          <a className="button" href={handoff.url} target="_blank" rel="noopener noreferrer">
            Send invoice on WhatsApp <ArrowUpRight size={16} />
          </a>
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(handoff.orderUrl);
                setNotice('Secure order link copied. Keep it private.');
              } catch {
                setNotice('Copy the secure order link from your browser address bar.');
              }
            }}
          >
            Copy secure order link <Copy size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
