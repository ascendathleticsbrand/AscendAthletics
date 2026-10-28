/**
 * Shared policy presentation for privacy, returns and terms routes.
 * Owner-published content replaces the supplied fallback; the WhatsApp contact link remains available in both cases.
 */
import { getPublicContent } from '@/lib/catalog';
import { whatsapp } from '@/lib/format';
export async function PolicyPage({
  section,
  title,
  children,
}: {
  section: string;
  title: string;
  children: React.ReactNode;
}) {
  const content = await getPublicContent();
  const policy = content[section];
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">ASCEND ATHLETICS</p>
          <h1>{title.toUpperCase()}.</h1>
        </div>
      </div>
      <div className="container page-body">
        <article className="reading">
          {policy ? (
            <p style={{ whiteSpace: 'pre-line' }}>{policy.body}</p>
          ) : (
            <>
              <div className="notice">
                This policy is awaiting the owner’s final review and approval before public launch.
                The information below explains the intended service workflow.
              </div>
              {children}
            </>
          )}
          <p>
            For questions, contact{' '}
            <a
              className="gold"
              href={whatsapp(
                `Hi ASCEND ATHLETICS, I have a question about your ${title.toLowerCase()}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              ASCEND on WhatsApp: +234 913 060 7719
            </a>
            .
          </p>
        </article>
      </div>
    </>
  );
}
