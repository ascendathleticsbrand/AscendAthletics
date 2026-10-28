// Loading UI shown by Next.js while an admin route retrieves its server data.
export default function AdminLoading() {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <p className="admin-eyebrow">ASCEND BUSINESS WORKSPACE</p>
      <h1>Loading your workspace...</h1>
      <p>Retrieving your authorized business records.</p>
      <div className="admin-loading-cards" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="admin-loading-table" aria-hidden="true" />
    </div>
  );
}
