/**
 * FAQ page: displays owner-published questions when available, otherwise the built-in answers.
 * The fallback answers explain the existing ordering, verification and coaching workflows.
 */
import Link from 'next/link';
import { getPublicContent } from '@/lib/catalog';
import { whatsapp } from '@/lib/format';
const questions = [
  [
    'Do I need an account to buy merchandise?',
    'No. Merchandise checkout supports guests. After checkout, save the private order link to view payment and fulfillment updates. Coaching clients need a secure account.',
  ],
  [
    'How do payments work?',
    'V1 uses manual bank transfer. Create an order or request coaching enrollment, review the confirmed total and bank instructions, then submit your transfer reference and optional proof image. The owner verifies the actual bank credit.',
  ],
  [
    'Does submitting a receipt confirm my payment?',
    'No. A reference or receipt is payment evidence. The status stays awaiting verification until the owner confirms receipt of funds.',
  ],
  [
    'Can I collect my order or choose delivery?',
    'Both options are supported when configured. Pickup requires a confirmed location. Nationwide delivery fees depend on the location; if no fee is configured, the owner quotes a fee and you approve the full total before payment.',
  ],
  [
    'When does my coaching plan start?',
    'The coach confirms your start date after payment verification and approval. Monthly expiry uses calendar months; the last day is clamped to a valid day in the renewal month. Session bundles follow the package’s session count.',
  ],
  [
    'What happens if my stock reservation expires?',
    'Pending orders reserve stock temporarily. If payment is confirmed after that reservation expires, the owner must resolve availability before fulfillment. Stock is never silently oversold.',
  ],
  [
    'How do I renew a coaching plan?',
    'Sign in to your coaching account and request renewal. Submit payment evidence against the new pending enrollment. The owner verifies payment and confirms the renewed start date.',
  ],
  [
    'How do I return merchandise?',
    'Contact ASCEND to discuss your request. The owner’s final returns policy will be published before launch; no automatic refund or return eligibility is promised here.',
  ],
];
export const metadata = { title: 'Questions & answers' };
export const dynamic = 'force-dynamic';
export default async function FAQ() {
  const content = await getPublicContent();
  const custom = content.faq?.data?.items;
  const items = Array.isArray(custom) ? custom.map((q: any) => [q.question, q.answer]) : questions;
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">A LITTLE CLARITY</p>
          <h1>GOOD QUESTIONS.</h1>
          <p>What to expect when you shop or train with ASCEND.</p>
        </div>
      </div>
      <div className="container page-body">
        <div className="reading faq-list">
          {items.map(([q, a]: string[], i: number) => (
            <details key={i}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
          <div className="button-row">
            <a
              className="button secondary"
              href={whatsapp('Hi ASCEND ATHLETICS, I have a question.')}
              target="_blank"
              rel="noreferrer"
            >
              Ask on WhatsApp
            </a>
            <Link href="/contact" className="text-link">
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
