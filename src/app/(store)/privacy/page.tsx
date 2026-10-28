/**
 * Privacy route: supplies the fallback privacy explanation to the shared PolicyPage.
 * Published owner-approved content for the privacy section takes precedence over this fallback.
 */
import { PolicyPage } from '@/components/store/policy-page';
export const metadata = { title: 'Privacy notice' };
export const dynamic = 'force-dynamic';
export default function Privacy() {
  return (
    <PolicyPage section="privacy" title="Privacy notice">
      <h2>Information used to provide the service</h2>
      <p>
        Merchandise orders use your name, email, phone number, selected products and pickup or
        delivery details. Coaching accounts use your account identity, contact details, package
        preferences and enrollment history. Transfer submissions may include a reference and
        optional private proof image.
      </p>
      <h2>Access and use</h2>
      <p>
        Customer records are used for orders, coaching administration and payment reconciliation.
        Access is restricted to your own account records and authorized staff. Guest order links are
        private credentials; keep them secure.
      </p>
      <h2>Optional marketing</h2>
      <p>
        Purchasing merchandise or registering for coaching does not automatically subscribe you to
        marketing. Newsletter subscriptions require separate consent and provide an unsubscribe
        option.
      </p>
      <h2>Owner review required</h2>
      <p>
        The owner must approve the final data retention periods, service-provider disclosures,
        business identity details and the process for privacy requests before launch. Contact ASCEND
        to discuss your information.
      </p>
    </PolicyPage>
  );
}
