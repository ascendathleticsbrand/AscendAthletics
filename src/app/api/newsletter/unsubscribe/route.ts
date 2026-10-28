/** Shows a confirmation page for a signed unsubscribe link, then applies the change only on a confirmed POST. */
import { NextResponse } from 'next/server';
import { route, jsonBody } from '@/lib/backend/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribeToken } from '@/lib/backend/marketing-token';
import { databaseError } from '@/lib/backend/errors';
import { z } from 'zod';
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
// Opening a link only shows confirmation, so email scanners cannot unsubscribe a customer by visiting it.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    verifyUnsubscribeToken(token);
  } catch {
    return new NextResponse('Invalid unsubscribe link.', { status: 400 });
  }
  const body =
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASCEND email preferences</title><body style="background:#080808;color:#F4F2EE;font-family:Arial;padding:40px;max-width:600px;margin:auto"><h1>ASCEND email preferences</h1><p>Confirm to stop receiving marketing emails. Your order and coaching updates will continue.</p><button id="confirm" style="padding:16px;background:#C9A36A;border:0">Unsubscribe</button><p id="result" role="status"></p><script>document.getElementById("confirm").onclick=async()=>{const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:' +
    JSON.stringify(token) +
    '})});const d=await r.json();document.getElementById("result").textContent=d.ok?"You have unsubscribed.":d.error;};</script></body></html>';
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    },
  });
}
export async function POST(request: Request) {
  return route(async () => {
    const { token } = z.object({ token: z.string().max(200) }).parse(await jsonBody(request));
    const id = verifyUnsubscribeToken(token);
    const { error } = await createAdminClient().rpc('unsubscribe_subscriber', {
      p_subscriber_id: id,
    });
    databaseError(error);
    return { unsubscribed: true };
  });
}
