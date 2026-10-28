// Server entry for named admin sections such as /admin/products and /admin/inventory.
import { notFound } from 'next/navigation';
import { getAdminData } from '@/lib/admin';
import { AdminSection } from '@/components/admin/admin-section';
import { sections } from '@/components/admin/admin-config';

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  // Route parameters are asynchronous in this Next.js version. Reject unknown section names.
  const { section } = await params;
  if (!(section in sections) || section === 'overview') notFound();
  const data = await getAdminData(section, { pageSize: 10 });
  return <AdminSection key={section} section={section} data={data} />;
}
