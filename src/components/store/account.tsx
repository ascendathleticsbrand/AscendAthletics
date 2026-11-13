'use client';

/**
 * Customer account interactions: sign-in, signup, coaching enrollment and profile actions.
 * Server APIs perform authentication and authorization; this module presents their results and refreshes account data.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { api } from './request';
import { money, businessDate, label, whatsapp } from '@/lib/format';
import { safeInternalPath, secureOrderToken, embeddedInvoice } from './client-values';
import type { CoachingPackage } from '@/lib/backend/types';
/** Submit credentials to the auth API; follow only a validated internal destination after sign-in. */
export function AuthForm({
  configured,
  next = '/account',
}: {
  configured: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel login-box">
      <div className="tabs">
        <button
          className={mode === 'signIn' ? 'active' : ''}
          onClick={() => {
            setMode('signIn');
            setError('');
            setMessage('');
          }}
        >
          Sign in
        </button>
        <button
          className={mode === 'signUp' ? 'active' : ''}
          onClick={() => {
            setMode('signUp');
            setError('');
            setMessage('');
          }}
        >
          Create account
        </button>
      </div>
      <h2>{mode === 'signIn' ? 'Welcome back.' : 'Your progress starts here.'}</h2>
      <p>A secure account for your coaching plans, renewals, and payment history.</p>
      {!configured && (
        <div className="notice">
          Coaching accounts are awaiting secure service configuration. Contact ASCEND to discuss
          training.
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setMessage('');
          const f = new FormData(e.currentTarget);
          try {
            const data = await api('/api/auth', {
              action: mode,
              email: f.get('email'),
              password: f.get('password'),
              next: safeInternalPath(next),
              ...(mode === 'signUp' ? { name: f.get('name'), phone: f.get('phone') } : {}),
            });
            if (data.signedIn) {
              router.push(safeInternalPath(next));
              router.refresh();
            } else setMessage(data.message || 'Check your email to confirm your account.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to sign in.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === 'signUp' && (
          <>
            <label className="form-group" style={{ display: 'block' }}>
              <span className="field-label">Full name</span>
              <input
                className="field"
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="form-group" style={{ display: 'block' }}>
              <span className="field-label">Phone number</span>
              <input
                className="field"
                type="tel"
                name="phone"
                autoComplete="tel"
                required
                minLength={7}
                maxLength={30}
              />
            </label>
          </>
        )}
        <label className="form-group" style={{ display: 'block' }}>
          <span className="field-label">Email address</span>
          <input
            className="field"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label className="form-group" style={{ display: 'block' }}>
          <span className="field-label">Password (at least 8 characters)</span>
          <input
            className="field"
            type="password"
            name="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            maxLength={128}
          />
        </label>
        {mode === 'signUp' && (
          <label className="check-label">
            <input type="checkbox" required />I agree to the <Link href="/terms">terms</Link> and
            acknowledge the <Link href="/privacy">privacy notice</Link>. Marketing emails are
            optional and require separate consent.
          </label>
        )}
        <p className="form-feedback error" role="alert">
          {error}
        </p>
        <p className="form-feedback" role="status">
          {message}
        </p>
        <button className="button" style={{ width: '100%' }} disabled={busy || !configured}>
          {busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create coaching account'}
          <ArrowUpRight size={16} />
        </button>
      </form>
      <p style={{ marginTop: 22, fontSize: 11 }}>
        Merchandise orders do not require an account.{' '}
        <Link href="/order-status" className="gold">
          Look up your guest order.
        </Link>
      </p>
    </div>
  );
}
/** Request a package enrollment; the owner still verifies payment and confirms the training start. */
export function EnrollmentRequest({
  pkg,
  profile,
  bank,
}: {
  pkg: CoachingPackage;
  profile: any;
  bank: any;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <div className="panel" style={{ marginBottom: 30 }}>
      <p className="eyebrow">YOUR NEXT STEP</p>
      <h2>Enroll in {pkg.name}</h2>
      <p>
        {label(pkg.mode)} coaching · {money(pkg.price_ngn)} · {label(pkg.billing_model)}
        {pkg.billing_model === 'monthly'
          ? ` (${pkg.duration_months || 1} calendar month${(pkg.duration_months || 1) > 1 ? 's' : ''})`
          : pkg.session_count
            ? ` · ${pkg.session_count} sessions`
            : pkg.duration_days
              ? ` · ${pkg.duration_days} days`
              : ''}
      </p>
      <p>{pkg.description}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const f = new FormData(e.currentTarget);
          try {
            const result = await api<{ enrollment: any; invoice: any }>('/api/coaching/enroll', {
              package_id: pkg.id,
              name: f.get('name'),
              phone: f.get('phone'),
              preferences: { goal: f.get('goal'), schedule: f.get('schedule') || '' },
            });
            const invoice = result.invoice;
            const message = [
              'Hi ASCEND ATHLETICS, I requested coaching and would like to pay by bank transfer.',
              `Customer: ${String(f.get('name') || '')}`,
              `Phone: ${String(f.get('phone') || '')}`,
              `Coaching plan: ${result.enrollment?.package_name || pkg.name}`,
              `Invoice: ${invoice?.invoice_number || invoice?.id || 'See my ASCEND account'}`,
              `Amount due: ${money(invoice?.total_amount ?? pkg.price_ngn)}`,
              ...(bank?.bank_account_number
                ? [
                    '',
                    'Bank transfer details:',
                    `Bank: ${bank.bank_name || ''}`,
                    `Account number: ${bank.bank_account_number}`,
                    `Account name: ${bank.bank_account_holder || bank.account_holder || ''}`,
                    `Transfer narration: ${invoice?.invoice_number || invoice?.id || 'Coaching invoice'}`,
                    ...(bank.payment_instructions ? [bank.payment_instructions] : []),
                  ]
                : ['Please send me the bank transfer details.']),
              '',
              'I will reply here with my transfer confirmation after I pay. Coaching starts after ASCEND verifies payment and confirms my start date.',
              `My account: ${new URL('/account', window.location.origin).href}`,
            ].join('\n');
            setMessage('Your coaching invoice is ready. WhatsApp is opening with the bank details.');
            window.location.assign(whatsapp(message));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to request enrollment.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            <span className="field-label">Full name</span>
            <input
              className="field"
              name="name"
              defaultValue={profile?.full_name || ''}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            <span className="field-label">Phone</span>
            <input
              className="field"
              type="tel"
              name="phone"
              defaultValue={profile?.phone || ''}
              required
              minLength={7}
              maxLength={30}
            />
          </label>
          <label>
            <span className="field-label">Training focus</span>
            <select className="field" name="goal" defaultValue="general_fitness">
              <option value="general_fitness">General fitness</option>
              <option value="strength">Strength</option>
              <option value="conditioning">Conditioning</option>
            </select>
          </label>
          <label>
            <span className="field-label">Preferred schedule (optional)</span>
            <input
              className="field"
              name="schedule"
              maxLength={200}
              placeholder="e.g. Weekday evenings"
            />
          </label>
        </div>
        <p className="form-feedback error" role="alert">
          {error}
        </p>
        <p className="form-feedback" role="status">
          {message}
        </p>
        <button className="button" disabled={busy}>
          {busy ? 'Requesting…' : 'Request enrollment'}
          <ArrowUpRight size={16} />
        </button>
      </form>
    </div>
  );
}
/** Render the server-loaded account snapshot and refresh it after successful customer actions. */
export function AccountDashboard({
  account,
  selectedPackage,
}: {
  account: any;
  selectedPackage?: CoachingPackage;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const bank = account.bank_details;
  const run = async (url: string, body: unknown, success: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(url, body);
      setMessage(success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="account-header">
        <div>
          <p className="eyebrow">YOUR ASCEND</p>
          <h1>
            WELCOME,{' '}
            {String(account.profile?.full_name || account.user?.email?.split('@')[0] || 'ATHLETE')
              .split(' ')[0]
              .toUpperCase()}
            .
          </h1>
        </div>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() => run('/api/auth', { action: 'signOut' }, 'Signed out securely.')}
        >
          Sign out
        </button>
      </div>
      {account.error && <div className="notice danger-notice">{account.error}</div>}
      <p role="alert" className="form-feedback error">
        {error}
      </p>
      <p role="status" className="form-feedback">
        {message}
      </p>
      {selectedPackage && (
        <EnrollmentRequest pkg={selectedPackage} profile={account.profile} bank={bank} />
      )}
      <div className="two-column">
        <div>
          {account.enrollments.length === 0 ? (
            <div className="empty-state">
              <h2>Your next level is waiting.</h2>
              <p>
                You don’t have a coaching enrollment yet. Explore physical and online training
                packages.
              </p>
              <Link href="/coaching" className="button">
                Explore training <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            account.enrollments.map((e: any) => {
              const invoice = embeddedInvoice(e.invoices);
              const expired =
                e.expiry_date &&
                e.expiry_date <=
                  new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Africa/Lagos',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date());
              return (
                <div className="panel enrollment-card" key={e.id}>
                  <span className="status-badge">
                    {expired && e.status === 'active' ? 'Expired' : label(e.status)}
                  </span>
                  <h2 style={{ marginTop: 20, marginBottom: 10 }}>{e.package_name}</h2>
                  <p>
                    {label(e.mode)} coaching · {label(e.billing_model)}
                  </p>
                  <dl className="plan-grid">
                    <div>
                      <dt>Confirmed start</dt>
                      <dd>{businessDate(e.start_date)}</dd>
                    </div>
                    <div>
                      <dt>Expiry / renewal</dt>
                      <dd>{businessDate(e.expiry_date)}</dd>
                    </div>
                    <div>
                      <dt>Sessions remaining</dt>
                      <dd>
                        {e.session_count == null
                          ? 'Not session based'
                          : Math.max(0, Number(e.session_count) - Number(e.sessions_used || 0))}
                      </dd>
                    </div>
                    <div>
                      <dt>Plan price</dt>
                      <dd>{money(e.price)}</dd>
                    </div>
                    <div>
                      <dt>Payment status</dt>
                      <dd>{invoice ? label(invoice.payment_status) : 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Outstanding balance</dt>
                      <dd>
                        {invoice?.outstanding_amount == null
                          ? 'Not confirmed'
                          : money(invoice.outstanding_amount)}
                      </dd>
                    </div>
                  </dl>
                  {e.status === 'requested' && (
                    <div className="notice">
                      Your plan starts only after payment is verified and the coach confirms your
                      start date.
                    </div>
                  )}
                  {invoice &&
                    invoice.outstanding_amount > 0 &&
                    bank?.bank_account_number &&
                    e.status !== 'cancelled' && (
                      <div className="notice">
                        <h3>Bank transfer details</h3>
                        <p>
                          Bank: <strong>{bank.bank_name}</strong>
                          <br />
                          Account number: <strong>{bank.bank_account_number}</strong>
                          <br />
                          Account name: <strong>{bank.bank_account_holder || bank.account_holder}</strong>
                          <br />
                          Amount due: <strong>{money(invoice.outstanding_amount)}</strong>
                          <br />
                          Transfer narration: <strong>{invoice.invoice_number || invoice.id}</strong>
                        </p>
                        {bank.payment_instructions && <p>{bank.payment_instructions}</p>}
                        <p>
                          After transferring, send your invoice and payment confirmation to ASCEND on
                          WhatsApp. Your coaching starts after payment and start-date verification.
                        </p>
                        <a
                          className="button small"
                          target="_blank"
                          rel="noreferrer"
                          href={whatsapp(
                            [
                          'Hi ASCEND ATHLETICS, I am arranging payment for my coaching invoice by bank transfer.',
                              `Plan: ${e.package_name}`,
                              `Invoice: ${invoice.invoice_number || invoice.id}`,
                              `Amount due: ${money(invoice.outstanding_amount)}`,
                              `Bank: ${bank.bank_name || ''}`,
                              `Account number: ${bank.bank_account_number}`,
                              `Account name: ${bank.bank_account_holder || bank.account_holder || ''}`,
                              `Transfer narration: ${invoice.invoice_number || invoice.id}`,
                            ].join('\n'),
                          )}
                        >
                          Continue to WhatsApp <ArrowUpRight size={15} />
                        </a>
                      </div>
                    )}
                  <div className="button-row">
                    {['active', 'expired'].includes(e.status) &&
                      !account.enrollments.some(
                        (pending: any) =>
                          pending.package_id === e.package_id && pending.status === 'requested',
                      ) && (
                        <button
                          className="button small"
                          disabled={busy}
                          onClick={() =>
                            run(
                              `/api/coaching/${e.id}/renew`,
                              {},
                              'Renewal requested. Review the new invoice and send your transfer confirmation to ASCEND on WhatsApp.',
                            )
                          }
                        >
                          Request renewal <ArrowUpRight size={15} />
                        </button>
                      )}
                    <a
                      className="text-link"
                      target="_blank"
                      rel="noreferrer"
                      href={whatsapp(
                        `Hi ASCEND ATHLETICS, please help me with my ${e.package_name} coaching plan.`,
                      )}
                    >
                      Ask your coach <ArrowUpRight size={15} />
                    </a>
                  </div>
                </div>
              );
            })
          )}
          <div className="panel" style={{ marginTop: 25 }}>
            <h2>Your payment history</h2>
            {account.payments.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Submitted</th>
                      <th>Verified received</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{businessDate(p.created_at)}</td>
                        <td>{p.transfer_reference}</td>
                        <td>{money(p.submitted_amount)}</td>
                        <td>
                          {p.status === 'verified'
                            ? p.amount_received == null
                              ? 'Not confirmed'
                              : money(p.amount_received)
                            : 'Awaiting verification'}
                        </td>
                        <td>
                          <span className="status-badge">{label(p.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No payment records yet.</p>
            )}
          </div>
        </div>
        <aside>
          <div className="panel">
            <h2>Bank transfer for coaching</h2>
            {bank?.bank_account_number ? (
              <>
                <div className="summary-row">
                  <span>Bank</span>
                  <span>{bank.bank_name}</span>
                </div>
                <div className="summary-row">
                  <span>Account</span>
                  <strong>{bank.bank_account_number}</strong>
                </div>
                <div className="summary-row">
                  <span>Account holder</span>
                  <span>{bank.bank_account_holder}</span>
                </div>
                <p style={{ marginTop: 20 }}>{bank.payment_instructions}</p>
                <p>
                  After transferring, send your payment confirmation to ASCEND on WhatsApp. Coaching
                  starts after payment verification and start-date confirmation.
                </p>
              </>
            ) : (
              <p>
                Bank instructions are awaiting configuration. Contact ASCEND before making a
                transfer.
              </p>
            )}
          </div>
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Your profile</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(
                  '/api/account',
                  { action: 'updateProfile', name: f.get('name'), phone: f.get('phone') },
                  'Your profile was updated.',
                );
              }}
            >
              <label className="form-group" style={{ display: 'block' }}>
                <span className="field-label">Full name</span>
                <input
                  className="field"
                  name="name"
                  defaultValue={account.profile?.full_name || ''}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label className="form-group" style={{ display: 'block' }}>
                <span className="field-label">Phone number</span>
                <input
                  className="field"
                  type="tel"
                  name="phone"
                  defaultValue={account.profile?.phone || ''}
                  required
                  minLength={7}
                  maxLength={30}
                />
              </label>
              <p>{account.user?.email}</p>
              <button className="button secondary small" disabled={busy}>
                Save profile
              </button>
            </form>
          </div>
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Link a guest order</h2>
            <p>
              Use your private order token to link a purchase made with your verified account email.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const token = secureOrderToken(f.get('guest_token'));
                if (!token) {
                  setError(
                    'Use the secure order token or complete private link. An order number cannot link a purchase.',
                  );
                  return;
                }
                run(
                  '/api/account',
                  { action: 'linkGuest', guest_token: token },
                  'Your guest purchase was linked securely.',
                );
              }}
            >
              <label>
                <span className="field-label">Secure order token or link</span>
                <input className="field" name="guest_token" required autoComplete="off" />
              </label>
              <button className="button secondary small" disabled={busy} style={{ marginTop: 18 }}>
                Link order
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
