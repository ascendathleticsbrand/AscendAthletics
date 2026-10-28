/**
 * Contact page: reads the configured public phone, pickup information and optional email.
 * WhatsApp links use the business number saved in settings, with the established fallback number.
 */
import { MessageCircle, MapPin, ArrowUpRight, Mail } from 'lucide-react';
import { getBusinessSettings } from '@/lib/catalog';
import { whatsapp } from '@/lib/format';
export const metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';
export default async function Contact() {
  const s = await getBusinessSettings();
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">LET’S MAKE THE NEXT STEP COUNT</p>
          <h1>LET’S TALK.</h1>
          <p>
            Questions about merchandise, your order, or personal training? Get in touch with ASCEND.
          </p>
        </div>
      </div>
      <section className="container page-body">
        <div className="contact-cards">
          <div className="contact-card">
            <MessageCircle size={30} />
            <h2>WHATSAPP.</h2>
            <p>
              {s.whatsapp_number?.replace(/\D/g, '') === '2349130607719'
                ? '+234 913 060 7719'
                : '+' + String(s.whatsapp_number || '2349130607719').replace(/\D/g, '')}
            </p>
            <p>Talk to us about merchandise, training, pickup, or delivery.</p>
            <a
              className="button"
              href={whatsapp(
                'Hi ASCEND ATHLETICS, I’d like some help.',
                s.whatsapp_number || undefined,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Start a conversation <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="contact-card">
            <MapPin size={30} />
            <h2>PICKUP & DELIVERY.</h2>
            {s.pickup_location ? (
              <>
                <p>{s.pickup_location}</p>
                <p>{s.pickup_instructions}</p>
                {s.pickup_hours && <p>Pickup hours: {s.pickup_hours}</p>}
              </>
            ) : (
              <p>
                Pickup location and hours are awaiting confirmation. Contact us before visiting or
                arranging collection.
              </p>
            )}
            <p>
              Nationwide delivery fees are confirmed for your location. Unconfigured fees require
              your approval before payment.
            </p>
          </div>
          {s.contact_email && (
            <div className="contact-card">
              <Mail size={30} />
              <h2>EMAIL.</h2>
              <a href={`mailto:${s.contact_email}`} className="text-link">
                {s.contact_email}
                <ArrowUpRight size={15} />
              </a>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
