/**
 * Account route: loads the current session and its permitted customer records.
 * Shows the sign-in form for guests, or the coaching dashboard and a selected package for signed-in users.
 */
import { getAccountData } from '@/lib/account';
import { getCoachingPackages } from '@/lib/catalog';
import { AuthForm, AccountDashboard } from '@/components/store/account';
export const metadata = { title: 'Coaching account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; package?: string; error?: string; auth_error?: string }>;
}) {
  const [account, params] = await Promise.all([getAccountData(), searchParams]);
  const packages = params.package ? await getCoachingPackages() : [];
  const selectedPackage = packages.find((p) => p.id === params.package);
  return (
    <div className="container page-body">
      {account.user ? (
        <AccountDashboard account={account} selectedPackage={selectedPackage} />
      ) : (
        <>
          <div className="page-intro" style={{ border: 0, textAlign: 'center', paddingTop: 20 }}>
            <p className="eyebrow">YOUR PROGRESS, IN ONE PLACE</p>
            <h1>YOUR ASCEND ACCOUNT.</h1>
          </div>
          {(params.error || params.auth_error) && (
            <p className="notice">
              The email confirmation link could not be verified. Please request a new link or sign
              in.
            </p>
          )}
          <AuthForm
            configured={!account.setupRequired}
            next={
              params.package
                ? `/account?package=${encodeURIComponent(params.package)}`
                : params.next || '/account'
            }
          />
        </>
      )}
    </div>
  );
}
