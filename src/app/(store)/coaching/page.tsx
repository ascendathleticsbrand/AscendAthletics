/**
 * Coaching page: loads published packages and coach content together on the server.
 * Package links lead to account enrollment; payment verification and activation happen separately.
 */
import Link from 'next/link';
import { MapPin, Monitor, Check, ArrowUpRight } from 'lucide-react';
import { getCoachingPackages, getPublicContent } from '@/lib/catalog';
import { money, whatsapp, label } from '@/lib/format';
export const metadata = { title: 'Personal training' };
export const dynamic = 'force-dynamic';
export default async function Coaching() {
  const [packages, content] = await Promise.all([getCoachingPackages(), getPublicContent()]);
  // Read the published monthly price so later owner edits stay consistent with enrollment invoices.
  const monthlyPrice = (mode: string) =>
    packages.find(
      (p) => p.mode === mode && p.billing_model === 'monthly' && p.duration_months === 1,
    )?.price;
  return (
    <>
      <div className="container coaching-hero">
        <div>
          <p className="eyebrow eyebrow-line">PERSONAL TRAINING · PHYSICAL & ONLINE</p>
          <h1>
            YOUR EFFORT.
            <br />A <span className="gold">DIRECTION.</span>
          </h1>
          <p>
            {content.coach?.body ||
              'Consistent effort deserves a clear path. Explore personal training with ASCEND, in person or online, and take the next step toward your goals.'}
          </p>
          <a href="#packages" className="button">
            Explore training <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="editorial-image">
          <img
            src={content.coach?.image_path || '/images/gym-editorial.jpg'}
            alt={content.coach?.image_path ? 'ASCEND coach' : 'Editorial training space'}
          />
          {!content.coach?.image_path && (
            <span className="photo-credit">Editorial photography · Unsplash</span>
          )}
        </div>
      </div>
      <section className="container page-body">
        <div className="coaching-mode-grid">
          <div className="mode-card">
            <MapPin size={28} />
            <h3>PHYSICAL COACHING.</h3>
            {monthlyPrice('physical') != null && (
              <p className="mode-price">
                <strong>{money(monthlyPrice('physical'))}</strong> <span>per month</span>
              </p>
            )}
            <p>
              Train in person with direct guidance and a focused coaching relationship. Location,
              session timing, and package details are confirmed before enrollment.
            </p>
          </div>
          <div className="mode-card">
            <Monitor size={28} />
            <h3>ONLINE COACHING.</h3>
            {monthlyPrice('online') != null && (
              <p className="mode-price">
                <strong>{money(monthlyPrice('online'))}</strong> <span>per month</span>
              </p>
            )}
            <p>
              Build consistency wherever you train. Discuss your goals, choose an online package,
              and manage your membership through your secure coaching account.
            </p>
          </div>
        </div>
        <section className="section" id="packages">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHOOSE YOUR NEXT CHAPTER</p>
              <h2>TRAIN WITH PURPOSE.</h2>
            </div>
            <p>
              Monthly plans, session bundles, and fixed programs are published by the coach when
              available.
            </p>
          </div>
          {packages.length ? (
            <div className="package-grid">
              {packages.map((p) => (
                <div className="package-card" key={p.id}>
                  <span className="status-badge">{label(p.mode)} coaching</span>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <p className="price">{money(p.price_ngn)}</p>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {p.billing_model === 'monthly'
                      ? `${p.duration_months || 1} calendar month${(p.duration_months || 1) > 1 ? 's' : ''}`
                      : p.billing_model === 'fixed_duration'
                        ? `${p.duration_days} day program`
                        : `${p.session_count} paid session${p.session_count === 1 ? '' : 's'}`}
                  </span>
                  <ul>
                    {p.features.map((f, i) => (
                      <li key={i}>
                        <Check size={14} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link className="button" href={`/account?package=${p.id}`}>
                    Choose this package <ArrowUpRight size={15} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Your training begins with a conversation.</h2>
              <p>
                Coaching packages and prices are being confirmed. Talk to ASCEND about physical or
                online training.
              </p>
              <a
                className="button"
                href={whatsapp(
                  'Hi ASCEND ATHLETICS, I’d like to discuss physical or online personal training.',
                )}
                target="_blank"
                rel="noreferrer"
              >
                Discuss your goals <ArrowUpRight size={16} />
              </a>
            </div>
          )}
        </section>
        <div className="notice">
          How enrollment works: choose a package, create a secure account, request enrollment,
          transfer payment, then submit evidence. The owner verifies receipt and confirms your start
          date. Your plan never starts from a receipt alone.
        </div>
      </section>
    </>
  );
}
