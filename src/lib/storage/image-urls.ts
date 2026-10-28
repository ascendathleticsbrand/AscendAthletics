/** Resolves existing Supabase image keys and R2 URLs, and validates which images may be attached to a product. */
const uuidPart = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const productImageKey = new RegExp(`^(${uuidPart})/${uuidPart}\\.(jpg|png|webp)$`, 'i');

/** Public origin only: access keys and the S3 endpoint never belong in image URLs. */
export function getR2PublicBaseUrl(
  raw: string | undefined = process.env.R2_PUBLIC_BASE_URL,
): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      /(?:^|\.)r2\.cloudflarestorage\.com$/i.test(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Existing Supabase object keys and absolute R2 URLs can coexist in the same gallery. */
export function publicImageUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return url.username || url.password ? '' : url.href;
    } catch {
      return '';
    }
  }
  if (path.startsWith('/') && !path.startsWith('//')) return path;
  if (path.startsWith('//') || path.includes(':')) return '';
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  return base
    ? `${base}/storage/v1/object/public/product-images/${path.split('/').map(encodeURIComponent).join('/')}`
    : '';
}

/** Only images issued for this product by one of our configured storage providers may be attached. */
export function productImageReference(value: string, productId: string): string | null {
  function legacyKey(path: string) {
    const match = productImageKey.exec(path);
    return match && match[1].toLowerCase() === productId.toLowerCase() ? path : null;
  }
  const raw = legacyKey(value);
  if (raw) return raw;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return null;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabase) {
    try {
      const base = new URL(supabase);
      const prefix = `${base.pathname.replace(/\/+$/, '')}/storage/v1/object/public/product-images/`;
      if (url.origin === base.origin && url.pathname.startsWith(prefix))
        return legacyKey(decodeURIComponent(url.pathname.slice(prefix.length)));
    } catch {
      return null;
    }
  }
  const r2 = getR2PublicBaseUrl();
  if (r2 && url.origin === r2 && url.pathname.startsWith('/products/')) {
    try {
      const path = legacyKey(decodeURIComponent(url.pathname.slice('/products/'.length)));
      if (path) return `${r2}/products/${path}`;
    } catch {
      return null;
    }
  }
  return null;
}
