'use client';

// Small customer-entry form used by Customers and Coaching Clients. Email stays optional here.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, CircleAlert, Loader2, Plus } from 'lucide-react';
import type { AdminRecord } from './admin-config';

type Props = {
  disabled: boolean;
  onSaved: (customer: AdminRecord) => Promise<void> | void;
  onAssignTraining: (customer: AdminRecord) => void;
};

export function CustomerQuickAdd({ disabled, onSaved, onAssignTraining }: Props) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  // A ref blocks a second submission immediately, before React updates the button state.
  const savingRef = useRef(false);
  const focusAfterSave = useRef(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCustomer, setSavedCustomer] = useState<AdminRecord | null>(null);

  // Return focus to the name field only after a confirmed save, ready for the next person.
  useEffect(() => {
    if (!saving && focusAfterSave.current) {
      focusAfterSave.current = false;
      nameRef.current?.focus();
    }
  }, [saving]);

  // Keep entered details on failure; clear the form only after validating the saved record.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveCustomer',
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (email.trim()) setShowEmail(true);
        throw new Error(
          typeof result.error === 'string'
            ? result.error
            : 'Unable to save this customer. Check the details and try again.',
        );
      }
      const customer = result.data;
      if (
        !customer ||
        typeof customer.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer.id) ||
        typeof customer.name !== 'string' ||
        !customer.name.trim()
      ) {
        throw new Error(
          'The saved customer could not be confirmed. Refresh the customer list before trying again.',
        );
      }
      setSavedCustomer(customer);
      setName('');
      setPhone('');
      setEmail('');
      setShowEmail(false);
      focusAfterSave.current = true;
      // A list-refresh error must not imply the already-saved customer needs to be created again.
      try {
        await onSaved(customer);
      } catch {
        setError('Customer saved. Refresh the page to update the customer list.');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save this customer. Your details are still in the form.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="admin-quick-customer" aria-labelledby={`${id}-title`}>
      <div className="admin-quick-customer-heading">
        <div>
          <h2 id={`${id}-title`}>Quick add customer</h2>
          <p>Save their name and phone. Add email now or edit their details later.</p>
        </div>
        <Plus size={19} aria-hidden="true" />
      </div>
      <form onSubmit={submit} autoComplete="off" aria-busy={saving}>
        <fieldset disabled={disabled || saving}>
          <div className="admin-quick-customer-fields">
            <div className="admin-form-field">
              <label htmlFor={`${id}-name`}>
                Full name <span>*</span>
              </label>
              <input
                ref={nameRef}
                id={`${id}-name`}
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor={`${id}-phone`}>
                Phone number <span>*</span>
              </label>
              <input
                id={`${id}-phone`}
                name="phone"
                type="tel"
                required
                minLength={7}
                maxLength={30}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="off"
              />
            </div>
            <button className="admin-button admin-button-gold" type="submit">
              {saving ? (
                <>
                  <Loader2 size={16} className="admin-spinning" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus size={16} aria-hidden="true" />
                  Save customer
                </>
              )}
            </button>
          </div>
          <button
            className="admin-quick-customer-disclosure"
            type="button"
            aria-expanded={showEmail}
            aria-controls={`${id}-email-field`}
            onClick={() => setShowEmail(!showEmail)}
          >
            <ChevronDown size={14} aria-hidden="true" />
            {showEmail
              ? 'Hide optional email'
              : email.trim()
                ? 'Email added (optional)'
                : 'Add email (optional)'}
          </button>
          <div
            id={`${id}-email-field`}
            hidden={!showEmail}
            className="admin-quick-customer-email admin-form-field"
          >
            <label htmlFor={`${id}-email`}>Email address (optional)</label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              disabled={!showEmail}
            />
          </div>
        </fieldset>
      </form>
      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          {error}
        </div>
      )}
      {savedCustomer && (
        <div className="admin-quick-customer-success">
          <span role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            {String(savedCustomer.name)} saved. Add another customer above.
          </span>
          <button
            className="admin-button admin-button-subtle"
            type="button"
            disabled={disabled || saving}
            onClick={() => onAssignTraining(savedCustomer)}
          >
            Assign training package <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
