/** Provides a local hidden-password recovery command for the verified ASCEND owner, with a read-only check option. */
// Local, interactive recovery for the existing ASCEND owner. Never accepts a password argument.
import { existsSync } from 'node:fs';
import { emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const OWNER_EMAIL = 'akgreat62@gmail.com';
class RecoveryError extends Error {}
const identityError = 'The confirmed ASCEND owner could not be verified. No password was changed.';

// Match the existing confirmed owner identity before allowing the privileged password update.
export async function findVerifiedOwner(client) {
  const { data: roles, error } = await client
    .from('staff_roles')
    .select('user_id')
    .eq('role', 'owner');
  if (error || !Array.isArray(roles) || roles.length === 0) throw new RecoveryError(identityError);
  for (const role of roles) {
    const { data, error: userError } = await client.auth.admin.getUserById(role.user_id);
    if (userError) throw new RecoveryError(identityError);
    const user = data?.user;
    if (user?.email?.toLowerCase() !== OWNER_EMAIL) continue;
    const banned =
      user.banned_until &&
      (Number.isNaN(Date.parse(user.banned_until)) || Date.parse(user.banned_until) > Date.now());
    if (
      user.id !== role.user_id ||
      !user.email_confirmed_at ||
      user.is_anonymous ||
      user.deleted_at ||
      banned
    )
      throw new RecoveryError(identityError);
    return user;
  }
  throw new RecoveryError(identityError);
}

export async function resetOwnerPassword(client, password, confirmation) {
  const owner = await findVerifiedOwner(client);
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 128 ||
    !password.trim() ||
    /[\u0000-\u001f\u007f]/.test(password)
  )
    throw new RecoveryError(
      'Choose a password with 8 to 128 characters, without control characters.',
    );
  if (password !== confirmation)
    throw new RecoveryError('The passwords did not match. No password was changed.');
  const { data, error } = await client.auth.admin.updateUserById(owner.id, { password });
  if (error)
    throw new RecoveryError(
      'Supabase could not update the password. It may not meet the project password requirements. Try again with a stronger password.',
    );
  if (data?.user?.id !== owner.id)
    throw new RecoveryError(
      'The update could not be confirmed. Check the account before trying again.',
    );
  return OWNER_EMAIL;
}

// Read keystrokes directly from a real terminal so the password is not echoed or accepted as a shell argument.
export function readHiddenPassword(label, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function')
    return Promise.reject(
      new RecoveryError(
        'Run this command directly in the VS Code terminal. Passwords cannot be supplied through a pipe.',
      ),
    );
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = Boolean(input.isRaw);
    let finished = false;
    function done(error) {
      if (finished) return;
      finished = true;
      input.removeListener('keypress', onKey);
      input.removeListener('end', onEnd);
      input.removeListener('error', onError);
      input.setRawMode(previousRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
      value = '';
    }
    function onEnd() {
      done(new RecoveryError('Cancelled. No password was changed.'));
    }
    function onError() {
      done(new RecoveryError('The terminal could not read the password. No password was changed.'));
    }
    function onKey(text, key = {}) {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) return onEnd();
      if (key.name === 'return' || key.name === 'enter') return done();
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }
      if (key.ctrl || key.meta || !text || /[\u0000-\u001f\u007f]/.test(text)) return;
      value += text;
      if (value.length > 128)
        done(
          new RecoveryError(
            'The password is too long. Use 8 to 128 characters. No password was changed.',
          ),
        );
    }
    emitKeypressEvents(input);
    input.on('keypress', onKey);
    input.once('end', onEnd);
    input.once('error', onError);
    output.write(label);
    input.setRawMode(true);
    input.resume();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.length === 1 && args[0] === '--check';
  if (args.length && !checkOnly)
    throw new RecoveryError(
      'Use npm run admin:password, or add -- --check for a read-only check. Passwords must be entered at the hidden prompts.',
    );
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new RecoveryError(
      'Run npm run admin:password directly in the VS Code terminal. Piped password input is not supported.',
    );
  const envPath = new URL('../.env.local', import.meta.url);
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceKey)
    throw new RecoveryError(
      'The Supabase URL and private service-role key must be configured in .env.local.',
    );
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RecoveryError('The Supabase project URL is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.supabase.co') ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new RecoveryError(
      'Use the trusted HTTPS Supabase project URL from this project configuration.',
    );
  const client = createClient(url.origin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const owner = await findVerifiedOwner(client);
  console.log('Verified existing ASCEND owner: ' + owner.email);
  console.log('Supabase project: ' + url.hostname);
  if (checkOnly) {
    console.log('Read-only check passed. No password or account data was changed.');
    return;
  }
  console.log('This changes the ASCEND website password for the owner shown above.');
  console.log('The two password entries are hidden. Press Ctrl+C to cancel.');
  let password, confirmation;
  try {
    password = await readHiddenPassword('New password (8-128 characters): ');
    confirmation = await readHiddenPassword('Enter it again: ');
    await resetOwnerPassword(client, password, confirmation);
  } finally {
    password = undefined;
    confirmation = undefined;
  }
  console.log('Owner password updated. Sign in at http://localhost:3000/account?next=/admin');
  console.log('Email: ' + OWNER_EMAIL);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    // Only our bounded messages are displayed; SDK errors can contain private metadata.
    const safe = error instanceof RecoveryError;
    console.error(
      safe
        ? error.message
        : 'Owner recovery could not complete. Check the private Supabase configuration and try again.',
    );
    process.exitCode = 1;
  });
}
