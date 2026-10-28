import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    throw new Error('Live clients are forbidden in this test.');
  }),
}));

import {
  OWNER_EMAIL,
  findVerifiedOwner,
  readHiddenPassword,
  resetOwnerPassword,
} from './reset-admin-password.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const password = 'Private owner password 26!';
const sensitiveError = 'fake-provider-secret-do-not-print';
const verifiedUser = () => ({
  id: ownerId,
  email: OWNER_EMAIL,
  email_confirmed_at: '2026-10-13T10:00:00Z',
  is_anonymous: false,
});

function fakeClient({
  roles = [{ user_id: ownerId }],
  user = verifiedUser(),
  roleError = null,
  userError = null,
  updateError = null,
} = {}) {
  const eq = vi.fn().mockResolvedValue({ data: roles, error: roleError });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUserById = vi.fn().mockResolvedValue({ data: { user }, error: userError });
  const updateUserById = vi.fn().mockResolvedValue({ data: { user }, error: updateError });
  return { from, select, eq, auth: { admin: { getUserById, updateUserById } } };
}

function fakeTerminal({ interactive = true, wasRaw = false } = {}) {
  const input = new PassThrough();
  input.isTTY = interactive;
  input.isRaw = wasRaw;
  input.setRawMode = vi.fn((value) => {
    input.isRaw = value;
    return input;
  });
  input.resume = vi.fn(() => input);
  input.pause = vi.fn(() => input);
  const output = { isTTY: interactive, write: vi.fn() };
  const key = (str, details = {}) => input.emit('keypress', str, { name: str, ...details });
  const written = () => output.write.mock.calls.map(([text]) => String(text)).join('');
  return { input, output, key, written };
}

async function startPrompt(terminal) {
  const result = readHiddenPassword('New password: ', terminal);
  await vi.waitFor(() => expect(terminal.input.listenerCount('keypress')).toBeGreaterThan(0));
  return { result };
}

function expectTerminalRestored(terminal, raw = false) {
  expect(terminal.input.isRaw).toBe(raw);
  expect(terminal.input.setRawMode).toHaveBeenLastCalledWith(raw);
  expect(terminal.input.listenerCount('keypress')).toBe(0);
}

describe('local owner password recovery', () => {
  it('resolves only the existing owner membership and confirmed account', async () => {
    const user = { ...verifiedUser(), email: OWNER_EMAIL.toUpperCase() };
    const client = fakeClient({ user });
    await expect(findVerifiedOwner(client)).resolves.toEqual(user);
    expect(client.from).toHaveBeenCalledWith('staff_roles');
    expect(client.select).toHaveBeenCalledWith('user_id');
    expect(client.eq).toHaveBeenCalledWith('role', 'owner');
    expect(client.auth.admin.getUserById).toHaveBeenCalledWith(ownerId);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("updates only the verified owner's password and preserves intentional spaces", async () => {
    const client = fakeClient();
    const chosen = ' ' + password + ' ';
    await expect(resetOwnerPassword(client, chosen, chosen)).resolves.toBe(OWNER_EMAIL);
    expect(client.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(ownerId, { password: chosen });
    expect(client.from.mock.calls).toEqual([['staff_roles']]);
  });

  it('refuses invalid or mismatched passwords without any update', async () => {
    for (const [value, confirmation] of [
      ['short', 'short'],
      ['x'.repeat(129), 'x'.repeat(129)],
      [' '.repeat(12), ' '.repeat(12)],
      ['secret\npassword', 'secret\npassword'],
      ['secret\u0000password', 'secret\u0000password'],
      [password, password + 'x'],
    ]) {
      const client = fakeClient();
      await expect(resetOwnerPassword(client, value, confirmation)).rejects.toThrow();
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
  });

  it('cannot create an owner or reset an account absent from owner memberships', async () => {
    const client = fakeClient({ roles: [] });
    await expect(resetOwnerPassword(client, password, password)).rejects.toThrow();
    expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('rejects a different email or an account UUID inconsistent with its owner membership', async () => {
    for (const user of [
      { ...verifiedUser(), email: 'another-owner@example.test' },
      { ...verifiedUser(), id: '22222222-2222-4222-8222-222222222222' },
    ]) {
      const client = fakeClient({ user });
      await expect(resetOwnerPassword(client, password, password)).rejects.toThrow();
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
  });

  it('refuses unconfirmed, anonymous, deleted, or currently banned accounts', async () => {
    for (const patch of [
      { email_confirmed_at: null },
      { is_anonymous: true },
      { deleted_at: '2026-10-15T10:00:00Z' },
      { banned_until: '2999-01-01T00:00:00Z' },
      { banned_until: 'malformed-date' },
    ]) {
      const client = fakeClient({ user: { ...verifiedUser(), ...patch } });
      await expect(resetOwnerPassword(client, password, password)).rejects.toThrow();
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
    const client = fakeClient({
      user: { ...verifiedUser(), banned_until: '2000-01-01T00:00:00Z' },
    });
    await expect(findVerifiedOwner(client)).resolves.toMatchObject({ id: ownerId });
  });

  it('fails closed on lookup errors without exposing provider internals', async () => {
    for (const options of [
      { roleError: { message: sensitiveError } },
      { userError: { message: sensitiveError } },
    ]) {
      const client = fakeClient(options);
      const error = await resetOwnerPassword(client, password, password).catch((value) => value);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toContain(sensitiveError);
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
  });

  it('does not report success or disclose details when the password update fails', async () => {
    const client = fakeClient({ updateError: { message: sensitiveError + password } });
    const error = await resetOwnerPassword(client, password, password).catch((value) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(sensitiveError);
    expect(error.message).not.toContain(password);
    expect(client.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
  });
});

describe('hidden terminal password input', () => {
  it('captures the secret without echoing it and restores terminal state', async () => {
    const terminal = fakeTerminal();
    const { result } = await startPrompt(terminal);
    for (const char of password) terminal.key(char);
    terminal.key('\r', { name: 'return' });
    await expect(result).resolves.toBe(password);
    expect(terminal.written()).not.toContain(password);
    expect(terminal.written().replace(/New password: |[\r\n]/g, '')).toBe('');
    expectTerminalRestored(terminal);
  });

  it('supports correction without printing removed characters or leaving raw mode changed', async () => {
    const terminal = fakeTerminal({ wasRaw: true });
    const { result } = await startPrompt(terminal);
    terminal.key('s');
    terminal.key('e');
    terminal.key('x');
    terminal.key('', { name: 'backspace' });
    terminal.key('c');
    terminal.key('r');
    terminal.key('e');
    terminal.key('t');
    terminal.key('\r', { name: 'return' });
    await expect(result).resolves.toBe('secret');
    expect(terminal.written()).not.toContain('secret');
    expectTerminalRestored(terminal, true);
  });

  it('cancels on Ctrl-C and restores raw mode and event listeners', async () => {
    const terminal = fakeTerminal();
    const { result } = await startPrompt(terminal);
    const rejection = expect(result).rejects.toThrow();
    terminal.key('p');
    terminal.key('r');
    terminal.key('\u0003', { name: 'c', ctrl: true });
    await rejection;
    expect(terminal.written()).not.toContain('pr');
    expectTerminalRestored(terminal);
  });

  it('rejects redirected input or output rather than falling back to visible passwords', async () => {
    for (const [inputTTY, outputTTY] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const terminal = fakeTerminal({ interactive: false });
      terminal.input.isTTY = inputTTY;
      terminal.output.isTTY = outputTTY;
      await expect(readHiddenPassword('New password: ', terminal)).rejects.toThrow();
      expect(terminal.input.setRawMode).not.toHaveBeenCalled();
      expect(terminal.input.listenerCount('keypress')).toBe(0);
    }
  });
});
