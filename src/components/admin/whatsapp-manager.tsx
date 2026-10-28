'use client';

/** Owner message controls: selection is explicit, and provider acceptance is separate from delivery. */
import { useCallback, useEffect, useRef, useState } from 'react';
import './whatsapp-manager.css';
type Contact = {
  id: string;
  name: string;
  phone: string | null;
  reminders_opt_in: boolean;
  updates_opt_in: boolean;
  consent_phone_matches: boolean;
};
type Dashboard = {
  configuration: {
    configured: boolean;
    updatesReady: boolean;
    remindersReady: boolean;
    message: string;
  };
  settings: { reminders_enabled: boolean; reminder_days: number[]; timezone: string };
  contacts: Contact[];
  pagination: { page: number; total: number; totalPages: number };
  messages: {
    id: string;
    kind: string;
    status: string;
    created_at: string;
    phone: string;
    last_error: string | null;
  }[];
  totals: Record<string, number>;
};
async function request(body?: unknown, query = '') {
  const response = await fetch(
    '/api/admin/whatsapp' + query,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.error || 'WhatsApp controls are unavailable.');
  return result.data;
}
export function WhatsAppManager() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, Contact>>({});
  const [text, setText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [note, setNote] = useState('');
  const [updates, setUpdates] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('7, 2, 0');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const batch = useRef<{ signature: string; id: string } | null>(null);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const next: Dashboard = await request(
        undefined,
        `?q=${encodeURIComponent(search)}&page=${page}`,
      );
      if (!mounted.current || current !== sequence.current) return;
      setData(next);
      setEnabled(next.settings.reminders_enabled);
      setDays(next.settings.reminder_days.join(', '));
      setSelected((previous) => {
        const copy = { ...previous };
        for (const c of next.contacts)
          if (copy[c.id]) {
            if (c.updates_opt_in && c.consent_phone_matches) copy[c.id] = c;
            else delete copy[c.id];
          }
        return copy;
      });
      setError('');
    } catch (e) {
      if (mounted.current && current === sequence.current) setError((e as Error).message);
    } finally {
      if (mounted.current && current === sequence.current) setLoading(false);
    }
  }, [search, page]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [load]);
  const selectedContacts = Object.values(selected);
  const ids = selectedContacts.map((c) => c.id).sort();
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) {
        setBusy(false);
        await load();
      }
    }
  }
  // One owner action continues small server batches while this panel remains open.
  // The hosted scheduler can continue work after the panel closes.
  async function drain() {
    let accepted = 0,
      failed = 0,
      uncertain = 0,
      remaining = 0;
    for (let i = 0; i < 40 && mounted.current; i++) {
      const outcome = await request({ action: 'process' });
      accepted += outcome.accepted || 0;
      failed += outcome.failed || 0;
      uncertain += outcome.uncertain || 0;
      remaining = outcome.remaining || 0;
      if (mounted.current)
        setNotice(
          `WhatsApp accepted ${accepted}. Failed: ${failed}. Needs review: ${uncertain}. Still queued: ${remaining}.`,
        );
      if (outcome.disabled || !remaining) break;
      if (!(outcome.accepted || outcome.failed || outcome.uncertain || outcome.skipped)) break;
    }
    if (mounted.current)
      setNotice(
        `WhatsApp accepted ${accepted}. Failed: ${failed}. Needs review: ${uncertain}. Still queued: ${remaining}. Acceptance does not confirm delivery.`,
      );
  }
  function startEdit(contact: Contact) {
    setEditing(contact);
    setUpdates(contact.updates_opt_in && contact.consent_phone_matches);
    setReminders(contact.reminders_opt_in && contact.consent_phone_matches);
    setNote('');
  }
  return (
    <section
      className="whatsapp-panel"
      aria-label="WhatsApp messages and reminders"
      aria-busy={busy || loading}
    >
      <div className="whatsapp-heading">
        <div>
          <h2>WhatsApp messages & reminders</h2>
          <p>Select the people to contact. Each person receives a private message.</p>
        </div>
        <button
          type="button"
          className="admin-button"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          Refresh WhatsApp
        </button>
      </div>
      {error && (
        <p role="alert" className="whatsapp-alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && loading && <p role="status">Loading WhatsApp controls...</p>}
      {data && (
        <>
          <p className="whatsapp-setup">{data.configuration.message}</p>
          <div className="whatsapp-stats">
            <span>Queued: {data.totals.pending || 0}</span>
            <span>Accepted: {data.totals.accepted || 0}</span>
            <span>Failed: {data.totals.failed || 0}</span>
            <span>Needs review: {data.totals.uncertain || 0}</span>
          </div>
          <div className="whatsapp-columns">
            <div>
              <h3>1. Select contacts</h3>
              <label>
                Find a customer
                <input
                  type="search"
                  value={search}
                  disabled={busy}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Name or phone"
                />
              </label>
              <p>
                {ids.length} selected (up to 500). Only contacts who agreed to updates can be
                selected.
              </p>
              <div className="whatsapp-contact-list">
                {data.contacts.map((c) => (
                  <div className="whatsapp-contact" key={c.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name} ${c.phone || ''}`}
                        checked={Boolean(selected[c.id])}
                        disabled={
                          busy ||
                          !c.updates_opt_in ||
                          !c.consent_phone_matches ||
                          (!selected[c.id] && ids.length >= 500)
                        }
                        onChange={(e) => {
                          setSelected((prev) => {
                            const copy = { ...prev };
                            if (e.target.checked) copy[c.id] = c;
                            else delete copy[c.id];
                            return copy;
                          });
                          setReviewed(false);
                        }}
                      />
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.phone || 'No phone saved'}</small>
                        <small>
                          {c.consent_phone_matches
                            ? c.updates_opt_in
                              ? 'Updates allowed'
                              : 'Updates not allowed'
                            : 'Permission needed for this phone'}
                        </small>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="admin-button"
                      disabled={busy}
                      onClick={() => startEdit(c)}
                    >
                      Permission
                    </button>
                  </div>
                ))}
                {!data.contacts.length && <p>No matching customers. Add a customer first.</p>}
              </div>
              <div className="whatsapp-heading">
                <button
                  className="admin-button"
                  disabled={busy || loading || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous contacts
                </button>
                <span>
                  Page {data.pagination.page} of {data.pagination.totalPages}
                </span>
                <button
                  className="admin-button"
                  disabled={busy || loading || page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next contacts
                </button>
              </div>
              {!!ids.length && (
                <button
                  className="admin-button"
                  disabled={busy}
                  onClick={() => {
                    setSelected({});
                    setReviewed(false);
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>
            <div>
              <h3>2. Review and send</h3>
              <label>
                Message
                <textarea
                  maxLength={1000}
                  rows={5}
                  value={text}
                  disabled={busy}
                  onChange={(e) => {
                    setText(e.target.value);
                    setReviewed(false);
                  }}
                  placeholder="Write the update for your selected contacts"
                />
              </label>
              <p>
                Your approved WhatsApp update template supplies the greeting and business wording.
              </p>
              {selectedContacts[0] && (
                <div className="whatsapp-preview">
                  <strong>Example for {selectedContacts[0].name}</strong>
                  <p>Hi {selectedContacts[0].name},</p>
                  <p>{text || 'Your message will appear here.'}</p>
                  <small>
                    Preview of the supplied text; final wording follows your approved template.
                  </small>
                </div>
              )}
              <label className="whatsapp-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the selected contacts and message.
              </label>
              <button
                className="admin-button admin-button-gold"
                disabled={
                  busy ||
                  !data.configuration.updatesReady ||
                  !ids.length ||
                  !text.trim() ||
                  !reviewed
                }
                onClick={() =>
                  void perform(async () => {
                    const signature = JSON.stringify([ids, text.trim()]);
                    if (batch.current?.signature !== signature)
                      batch.current = { signature, id: crypto.randomUUID() };
                    const result = await request({
                      action: 'broadcast',
                      customer_ids: ids,
                      message: text.trim(),
                      request_id: batch.current.id,
                    });
                    setNotice(
                      `${result.queued} messages queued; ${result.skipped} contacts skipped.`,
                    );
                    await drain();
                    setSelected({});
                    setReviewed(false);
                    batch.current = null;
                  })
                }
              >
                {busy ? 'Working...' : `Send to ${ids.length} selected`}
              </button>
              {!data.configuration.updatesReady && (
                <p>
                  Sending stays disabled until the business sender and update template are connected
                  and tested.
                </p>
              )}
              {(data.totals.pending || 0) > 0 && (
                <button
                  className="admin-button"
                  disabled={
                    busy || (!data.configuration.updatesReady && !data.configuration.remindersReady)
                  }
                  onClick={() => void perform(drain)}
                >
                  Continue queued messages
                </button>
              )}
            </div>
          </div>
          {editing && (
            <form
              className="whatsapp-permission"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await request({
                    action: 'consent',
                    customer_id: editing.id,
                    updates_opt_in: updates,
                    reminders_opt_in: reminders,
                    note,
                  });
                  setEditing(null);
                  setNotice('Customer permission saved.');
                });
              }}
            >
              <h3>Permission for {editing.name}</h3>
              <p>
                Record what this customer actually agreed to. Saving a phone number does not grant
                permission.
              </p>
              <label className="whatsapp-check">
                <input
                  type="checkbox"
                  checked={updates}
                  disabled={busy}
                  onChange={(e) => setUpdates(e.target.checked)}
                />
                Agreed to receive general updates on WhatsApp
              </label>
              <label className="whatsapp-check">
                <input
                  type="checkbox"
                  checked={reminders}
                  disabled={busy}
                  onChange={(e) => setReminders(e.target.checked)}
                />
                Agreed to receive coaching expiry reminders on WhatsApp
              </label>
              <label>
                How and when they agreed, or withdrew permission
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="For example: confirmed by WhatsApp on 19 October 2026"
                />
              </label>
              <button
                className="admin-button admin-button-gold"
                disabled={busy || note.trim().length < 3}
              >
                Save permission
              </button>{' '}
              <button
                className="admin-button"
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </form>
          )}
          <form
            className="whatsapp-automation"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                if (!/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(days))
                  throw new Error('Enter reminder days separated by commas, such as 7, 2, 0.');
                await request({
                  action: 'settings',
                  reminders_enabled: enabled,
                  reminder_days: days.split(',').map((n) => Number(n.trim())),
                });
                setNotice('WhatsApp reminder settings saved.');
              });
            }}
          >
            <h3>Automatic coaching reminders</h3>
            <label className="whatsapp-check">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy || (!data.configuration.remindersReady && !enabled)}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable automatic WhatsApp expiry reminders
            </label>
            <label>
              Days before expiry
              <input value={days} disabled={busy} onChange={(e) => setDays(e.target.value)} />
            </label>
            <p>
              7, 2, 0 means seven days before expiry, two days before, and on expiry day. Timezone:{' '}
              {data.settings.timezone}. Only clients with reminder permission and a confirmed expiry
              date qualify.
            </p>
            <p>
              A hosted scheduler is required when this page is closed. No automatic sending runs
              from a switched-off local computer.
            </p>
            {!data.configuration.remindersReady && (
              <p>Connect and test the renewal template before enabling reminders.</p>
            )}
            <button className="admin-button" disabled={busy}>
              Save reminder settings
            </button>
          </form>
          <details>
            <summary>Recent WhatsApp activity ({data.messages.length})</summary>
            <p>
              Accepted means WhatsApp accepted the request. Check WhatsApp Manager for delivery.
              Needs review messages are never retried automatically.
            </p>
            <div className="whatsapp-contact-list">
              {data.messages.map((m) => (
                <div className="whatsapp-activity" key={m.id}>
                  <strong>{m.phone}</strong>
                  <span>
                    {m.kind === 'renewal' ? 'Expiry reminder' : 'Update'}:{' '}
                    {m.status === 'uncertain'
                      ? 'Needs review'
                      : m.status === 'accepted'
                        ? 'Accepted by WhatsApp'
                        : m.status}
                  </span>
                  {m.last_error && <small>{m.last_error}</small>}
                </div>
              ))}
              {!data.messages.length && <p>No messages queued yet.</p>}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
