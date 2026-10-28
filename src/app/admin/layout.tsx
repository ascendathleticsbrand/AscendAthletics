// Shared server boundary for admin pages: check staff access and wrap the requested section.
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { AdminShell } from '@/components/admin/admin-shell';
import '@/components/admin/admin.css';

export const metadata = {
  title: 'Business workspace | ASCEND ATHLETICS',
  robots: { index: false, follow: false },
};
// Staff sessions and business records must be checked for each request.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await getAdminContext();
  if (!context.setupRequired && !['owner', 'assistant'].includes(context.role || ''))
    redirect('/account?next=/admin');
  return (
    <AdminShell
      role={context.role || undefined}
      setupRequired={context.setupRequired}
      email={context.user?.email}
    >
      {children}
    </AdminShell>
  );
}
