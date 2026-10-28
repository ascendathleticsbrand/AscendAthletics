/**
 * About page: loads the published brand story and coach content on the server.
 * Editorial images and copy provide the existing fallback when content is not configured.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getPublicContent } from '@/lib/catalog';
export const metadata = { title: 'Our story' };
export const dynamic = 'force-dynamic';
export default async function About() {
  const content = await getPublicContent();
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">THE ASCEND MINDSET</p>
          <h1>
            PROGRESS IS
            <br />A <span className="gold">PRACTICE.</span>
          </h1>
          <p>RISE. PUSH. BECOME.</p>
        </div>
      </div>
      <div className="container page-body">
        <div className="coaching-hero" style={{ paddingTop: 0 }}>
          <div className="editorial-image">
            <img
              src={content.about?.image_path || '/images/gym-editorial.jpg'}
              alt={content.about?.image_path ? 'ASCEND ATHLETICS' : 'Editorial gym space'}
            />
            {!content.about?.image_path && (
              <span className="photo-credit">Editorial photography · Unsplash</span>
            )}
          </div>
          <div>
            <p className="eyebrow">FOR WHO YOU’RE BECOMING</p>
            <h2>
              SHOW UP.
              <br />
              PUT IN THE WORK.
            </h2>
            <p>
              {content.about?.body ||
                'ASCEND ATHLETICS brings gym merchandise and personal training together around one commitment: progress through consistent effort.'}
            </p>
            <p>
              Explore physical and online coaching, choose your training apparel, and keep moving
              toward your next level.
            </p>
            <Link href="/coaching" className="button">
              Start your next chapter <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        {content.coach && (
          <div className="reading">
            <p className="eyebrow">MEET YOUR COACH</p>
            <h2>{content.coach.title || 'ASCEND coaching'}</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{content.coach.body}</p>
          </div>
        )}
      </div>
    </>
  );
}
