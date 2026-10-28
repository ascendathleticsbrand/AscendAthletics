/** Read-only HTTP checks for page availability and public access boundaries. */
import assert from 'node:assert/strict';
import http from 'node:http';
const origin = process.env.ASCEND_TEST_URL || 'http://localhost:3001';
const site = new URL(origin);
const requestOrigin = process.env.ASCEND_TEST_REQUEST_ORIGIN || origin;
const requestHost = new URL(requestOrigin).host;
if (!['localhost', '127.0.0.1', '[::1]'].includes(site.hostname))
  throw new Error('HTTP smoke tests require a local disposable preview origin.');
const publicPaths = [
  '/',
  '/shop',
  '/shop?category=shorts',
  '/collections',
  '/coaching',
  '/account',
  '/cart',
  '/checkout',
  '/order-status',
  '/about',
  '/contact',
  '/faq',
  '/privacy',
  '/terms',
  '/returns',
  '/robots.txt',
  '/sitemap.xml',
];
const staffPaths = [
  '/admin',
  '/admin/products',
  '/admin/inventory',
  '/admin/orders',
  '/admin/customers',
  '/admin/clients',
  '/admin/packages',
  '/admin/payments',
  '/admin/finances',
  '/admin/marketing',
  '/admin/content',
  '/admin/settings',
];
let pages = 0,
  protectedPages = 0;
for (const path of publicPaths) {
  const r = await fetch(origin + path);
  assert.equal(r.status, 200, path + ' must serve');
  if (!path.endsWith('.xml') && !path.endsWith('.txt')) assert.match(await r.text(), /ASCEND/);
  pages++;
}
for (const path of staffPaths) {
  const r = await fetch(origin + path, { redirect: 'manual' });
  if ([303, 307, 308].includes(r.status)) {
    assert.match(r.headers.get('location') || '', /^\/account\?next=/);
    protectedPages++;
  } else {
    assert.equal(r.status, 200, path + ' setup preview must serve');
    assert.match(await r.text(), /setup/i);
  }
  pages++;
}
let boundary = 0;
async function check(name, path, init, expected) {
  // Explicit Host models a reverse proxy whose public canonical origin differs from the local listen port.
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      origin + path,
      { method: init.method || 'GET', headers: init.headers || {} },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
    req.end(init.body);
  });
  assert.ok(
    [expected].flat().includes(status),
    `${name}: expected ${expected}, received ${status}`,
  );
  boundary++;
}
await check(
  'missing origin',
  '/api/checkout',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  403,
);
await check(
  'cross origin',
  '/api/checkout',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://invalid.example' },
    body: '{}',
  },
  403,
);
await check(
  'invalid JSON',
  '/api/checkout',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Host: requestHost },
    body: '{',
  },
  400,
);
await check(
  'oversized JSON',
  '/api/checkout',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Host: requestHost },
    body: JSON.stringify({ padding: 'x'.repeat(129000) }),
  },
  413,
);
await check(
  'invalid cart before DB',
  '/api/checkout',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Host: requestHost },
    body: JSON.stringify({
      customer: { name: 'Smoke Test', phone: '00000000', email: 'unused@example.invalid' },
      items: [],
      fulfillment_method: 'pickup',
    }),
  },
  422,
);
await check('unauthenticated cron', '/api/cron', {}, [401, 503]);
const missing = await fetch(origin + '/shop/unpublished-nonexistent-product');
assert.ok([200, 404].includes(missing.status), 'missing product must use the not-found boundary');
const missingBody = await missing.text();
assert.match(missingBody, /noindex/);
if (missing.status === 200) assert.match(missingBody, /NEXT_HTTP_ERROR_FALLBACK;404/); // Next.js streamed notFound keeps HTTP200.
boundary++;
await check('unauthenticated account API', '/api/account', {}, [200, 401, 503]);
console.log(
  JSON.stringify(
    {
      pageChecks: pages,
      protectedAdminPages: protectedPages,
      boundaryChecks: boundary,
      origin,
      requestOrigin,
      noBusinessRecordsCreated: true,
    },
    null,
    2,
  ),
);
