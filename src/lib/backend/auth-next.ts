/** Restricts post-login redirects to local account and admin pages so a submitted URL cannot send users elsewhere. */
export function safeAuthNext(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\r\n]/.test(value)
  )
    return '/account';
  try {
    const parsed = new URL(value, 'https://ascend.invalid');
    if (
      parsed.origin !== 'https://ascend.invalid' ||
      !['/account', '/admin'].some(
        (path) => parsed.pathname === path || parsed.pathname.startsWith(path + '/'),
      )
    )
      return '/account';
    return parsed.pathname + parsed.search;
  } catch {
    return '/account';
  }
}
