/**
 * Shared storefront footer: combines fixed navigation with public business contact settings.
 * The official wordmark comes from BrandLogo; optional social and email links appear only when configured.
 */
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { whatsapp, whatsappNumber } from '@/lib/format';
import { getBusinessSettings } from '@/lib/catalog';
export async function Footer() {
  const settings = await getBusinessSettings();
  const phone = settings.whatsapp_number || whatsappNumber;
  const displayedPhone =
    phone.replace(/\D/g, '') === whatsappNumber
      ? '+234 913 060 7719'
      : '+' + phone.replace(/\D/g, '');
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link href="/" className="brand-viewport footer-brand" aria-label="ASCEND ATHLETICS home">
            <BrandLogo />
          </Link>
          <p>
            For the work. For the progress.
            <br />
            For who you’re becoming.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <Link href="/shop">Merchandise</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/coaching">Personal training</Link>
          <Link href="/about">Our story</Link>
        </div>
        <div>
          <h3>Your ASCEND</h3>
          <Link href="/account">Coaching account</Link>
          <Link href="/order-status">Track your order</Link>
          <Link href="/faq">Questions & answers</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div>
          <h3>Keep moving</h3>
          <a
            href={whatsapp('Hi ASCEND ATHLETICS, I’d like to learn more.', phone)}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp <ArrowUpRight size={14} />
          </a>
          <p>{displayedPhone}</p>
          {settings.instagram_url && (
            <a href={settings.instagram_url} target="_blank" rel="noreferrer">
              Instagram <ArrowUpRight size={14} />
            </a>
          )}
          <a href="https://www.tiktok.com/@ascend.athletics4" target="_blank" rel="noreferrer">
            TikTok <ArrowUpRight size={14} />
          </a>
          {settings.contact_email && (
            <a href={`mailto:${settings.contact_email}`}>
              Email us <ArrowUpRight size={14} />
            </a>
          )}
          <span className="gold slogan">RISE. PUSH. BECOME.</span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} ASCEND ATHLETICS</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/returns">Returns</Link>
        </div>
        <span>Built for your next level.</span>
      </div>
    </footer>
  );
}
