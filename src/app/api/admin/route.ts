/** Exposes staff dashboard reads and validated admin actions through the shared API response format. */
import { z } from 'zod';
import { route, jsonBody } from '@/lib/backend/http';
import { getAdminData } from '@/lib/admin';
import { requireStaff } from '@/lib/auth';
import { adminAction } from '@/lib/backend/admin-actions';
import { rateLimit } from '@/lib/backend/rate-limit';
export async function GET(request: Request) {
  return route(async () => {
    await requireStaff();
    const search = new URL(request.url).searchParams;
    return getAdminData(search.get('section') || 'overview', {
      range: search.get('range') || undefined,
      from: search.get('from') || undefined,
      to: search.get('to') || undefined,
      page: search.get('page') || undefined,
      pageSize: search.get('pageSize') || undefined,
      search: search.get('search') || undefined,
      filter: search.get('filter') || undefined,
      paymentFilter: search.get('paymentFilter') || undefined,
      stockFilter: search.get('stockFilter') || undefined,
      categoryId: search.get('categoryId') || undefined,
    });
  });
}
export async function POST(request: Request) {
  return route(async () => {
    const raw = await jsonBody(request);
    const { action } = z.object({ action: z.string().min(1) }).parse(raw);
    await requireStaff();
    await rateLimit(request, 'admin-action', 120, 60);
    return adminAction(action, raw);
  });
}

export const maxDuration = 60;
