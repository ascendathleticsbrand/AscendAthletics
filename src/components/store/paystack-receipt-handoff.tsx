'use client';

/** Creates a customer-reviewed WhatsApp receipt message after Paystack is verified. */
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { money, whatsapp } from '@/lib/format';

export function PaystackReceiptHandoff({
  token,
  orderNumber,
  invoiceNumber,
  amountPaid,
  businessNumber,
}: {
  token: string;
  orderNumber: string;
  invoiceNumber: string;
  amountPaid: number | string;
  businessNumber?: string;
}) {
  const [href, setHref] = useState('');

  useEffect(() => {
    const orderUrl = new URL(`/order-status/${token}`, window.location.origin).href;
    const message = [
      'Hi ASCEND ATHLETICS, my Paystack payment is confirmed.',
      `Order: ${orderNumber}`,
      `Invoice: ${invoiceNumber}`,
      `Amount paid: ${money(amountPaid)}`,
      `Order and payment record: ${orderUrl}`,
      'Please confirm and share my receipt. Thank you.',
    ].join('\n');
    setHref(whatsapp(message, businessNumber));
  }, [token, orderNumber, invoiceNumber, amountPaid, businessNumber]);

  return (
    <section className="panel" aria-label="Send Paystack payment details">
      <h2>Send payment details to ASCEND</h2>
      <p>
        Your Paystack payment is confirmed. Open WhatsApp to share the order and payment record;
        review the message and press Send. ASCEND can then send your receipt.
      </p>
      {href && (
        <a className="button" href={href} target="_blank" rel="noopener noreferrer">
          Send payment details on WhatsApp <ArrowUpRight size={16} />
        </a>
      )}
    </section>
  );
}
