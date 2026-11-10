import 'server-only';
/** Shared request guards, bounded JSON parsing and consistent JSON responses for server API handlers. */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';
export function requestBaseOrigin(request: Request) {
  const parsed = new URL(request.url);
  const host = request.headers.get('host');
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    parsed.protocol.replace(':', '');
  if (host && !/[\s/\\]/.test(host) && ['http', 'https'].includes(protocol))
    return protocol + '://' + host;
  return parsed.origin;
}
// Mutations must originate from the host serving this request. Comparing the browser's
// Origin with the request host protects against cross-site requests while allowing the
// same deployment to serve its Vercel alias and any configured custom domain.
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = requestBaseOrigin(request);
  if (!origin || origin !== expected)
    throw new AppError(
      'The request origin could not be verified. Reload the page and try again.',
      403,
      'invalid_origin',
    );
}
export function checkMutationOrigin(request: Request) {
  assertSameOrigin(request);
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new AppError('Send this request as JSON.', 415);
}
export async function jsonBody(request: Request) {
  checkMutationOrigin(request);
  const limit = 128_000;
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new AppError('This request is too large.', 413);
  // Count streamed bytes too, because a caller can omit or misstate Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Send a JSON request body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new AppError('This request is too large.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Invalid JSON request.');
  }
}
// The browser receives one response shape; unexpected internal errors become a generic service message.
export async function route(work: () => Promise<unknown>, status = 200) {
  try {
    return NextResponse.json(
      { ok: true, data: await work() },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          ok: false,
          error: error.issues[0]?.message || 'Please check the entered values.',
          issues: error.issues,
        },
        { status: 422 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    console.error(
      'ASCEND request failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          'This feature is temporarily unavailable. Check the server configuration and try again.',
      },
      { status: 503 },
    );
  }
}
