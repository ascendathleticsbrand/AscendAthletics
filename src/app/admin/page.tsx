// Server entry for /admin. Load an authorized initial overview before handing interaction to the client.
import { getAdminData } from '@/lib/admin';
import { AdminSection } from '@/components/admin/admin-section';
export default async function OverviewPage() {
  const data = await getAdminData('overview', { pageSize: 10 });
  return <AdminSection key="overview" section="overview" data={data} />;
}
