import { afterEach, describe, expect, it, vi } from 'vitest';
import { getR2PublicBaseUrl, productImageReference, publicImageUrl } from './image-urls';
const product = '11111111-1111-4111-8111-111111111111';
const image = '22222222-2222-4222-8222-222222222222';
const key = `${product}/${image}.jpg`;
const sb = 'https://project.supabase.co';
const r2 = 'https://pub-example.r2.dev';
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', sb);
  vi.stubEnv('R2_PUBLIC_BASE_URL', r2);
}

describe('mixed image provider URLs', () => {
  it('keeps old Supabase keys working alongside absolute R2 and local image paths', () => {
    configure();
    expect(publicImageUrl(key)).toBe(`${sb}/storage/v1/object/public/product-images/${key}`);
    expect(publicImageUrl(`${r2}/products/${key}`)).toBe(`${r2}/products/${key}`);
    expect(publicImageUrl('/images/training-editorial.jpg')).toBe('/images/training-editorial.jpg');
    vi.stubEnv('R2_PUBLIC_BASE_URL', '');
    expect(publicImageUrl(`${r2}/products/${key}`)).toBe(`${r2}/products/${key}`);
  });
  it('does not produce credential-bearing, protocol-relative or executable image URLs', () => {
    configure();
    for (const path of [
      'javascript:alert(1)',
      'data:image/svg+xml,anything',
      '//unknown.example/x.jpg',
      'https://user:pass@example.com/x.jpg',
    ])
      expect(publicImageUrl(path)).toBe('');
    expect(publicImageUrl(null)).toBe('');
  });
  it('requires an HTTPS public origin instead of credentials or the R2 API endpoint', () => {
    expect(getR2PublicBaseUrl(r2 + '/')).toBe(r2);
    for (const value of [
      '',
      undefined,
      'http://images.example',
      'https://user:pass@images.example',
      'https://images.example/products',
      'https://images.example/?key=secret',
      'https://images.example/#fragment',
      'https://abc.r2.cloudflarestorage.com',
    ])
      expect(getR2PublicBaseUrl(value ?? '')).toBeNull();
  });
  it('normalizes only provider URLs and object keys belonging to the selected product', () => {
    configure();
    expect(productImageReference(key, product)).toBe(key);
    expect(
      productImageReference(`${sb}/storage/v1/object/public/product-images/${key}`, product),
    ).toBe(key);
    expect(productImageReference(`${r2}/products/${key}`, product)).toBe(`${r2}/products/${key}`);
    const other = '33333333-3333-4333-8333-333333333333';
    for (const value of [
      key.replace(product, other),
      `${r2}/products/${key.replace(product, other)}`,
      `https://unknown.example/products/${key}`,
      `${r2}.evil.example/products/${key}`,
      `${r2}/products/${key}?anything=1`,
      `${r2}/products/${key}#fragment`,
      `${r2}/products/../${key}`,
      `${sb}/storage/v1/object/public/payment-proofs/${key}`,
      `${r2}/products/${product}/..%2F${image}.jpg`,
    ])
      expect(productImageReference(value, product)).toBeNull();
  });
});
