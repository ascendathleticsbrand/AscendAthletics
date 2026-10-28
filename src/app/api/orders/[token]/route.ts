/** Returns the guest order snapshot associated with a private checkout link. */
import { route } from '@/lib/backend/http';
import { guestOrder } from '@/lib/backend/guest';
import { rateLimit } from '@/lib/backend/rate-limit';
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return route(async () => {
    await rateLimit(request, 'guest-order', 60);
    return guestOrder((await params).token);
  });
}
