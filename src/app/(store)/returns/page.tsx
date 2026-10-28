/**
 * Returns route: supplies the fallback returns explanation to the shared PolicyPage.
 * The shared component displays published owner-approved policy content when it exists.
 */
import { PolicyPage } from '@/components/store/policy-page';
export const metadata = { title: 'Refunds & returns' };
export const dynamic = 'force-dynamic';
export default function Returns() {
  return (
    <PolicyPage section="returns" title="Refunds & returns">
      <h2>Contact ASCEND first</h2>
      <p>
        Keep your private order link and contact ASCEND about any cancellation, refund or return
        request. Do not ship an item back until return instructions are confirmed.
      </p>
      <h2>Policy awaiting approval</h2>
      <p>
        The owner has not supplied a final returns window, eligibility rules, return address or
        refund processing terms. These details must be reviewed and published before the platform
        launches.
      </p>
      <h2>Order and inventory records</h2>
      <p>
        Approved refunds are recorded separately from received payments. A returned item is added
        back to available stock only after it has been inspected and confirmed resellable.
      </p>
    </PolicyPage>
  );
}
