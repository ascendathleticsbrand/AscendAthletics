/** Receives named dashboard actions after checking staff access, request origin and request frequency. */
import { route, jsonBody } from '@/lib/backend/http';
import { adminAction } from '@/lib/backend/admin-actions';
import { requireStaff } from '@/lib/auth';
import { rateLimit } from '@/lib/backend/rate-limit';
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return route(async () => {
    const raw = await jsonBody(request);
    await requireStaff();
    await rateLimit(request, 'admin-action', 120, 60);
    return adminAction((await params).action, raw);
  });
}

export const maxDuration = 60;
