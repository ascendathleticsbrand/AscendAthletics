/**
 * Home page: combines published editorial content with the fixed ASCEND landing-page sections.
 * Catalog availability supplies the optional collections link; new stock does not replace the category cards.
 */
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Shirt,
  Dumbbell,
  Footprints,
  Package,
  PillBottle,
  Monitor,
  MapPin,
} from 'lucide-react';
import { getPublicCatalog, getPublicContent } from '@/lib/catalog';
import { Newsletter } from '@/components/store/newsletter';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const [catalog, content] = await Promise.all([getPublicCatalog(), getPublicContent()]);
  const hero = content.hero;
  const bio = content.coach;
  const testimonials = content.testimonials?.data?.items;
  return (
    <>
      {/* Brand introduction: official wordmark, headline and the existing editorial background. */}
      <section className="hero">
        <img
          className="hero-photo"
          src={hero?.image_path || '/images/training-editorial.jpg'}
          alt="Strength training in the gym"
          fetchPriority="high"
        />
        <div className="container hero-inner">
          <div>
            <BrandLogo className="hero-brand-logo" />
            <p className="eyebrow eyebrow-line">BUILT FOR YOUR NEXT LEVEL</p>
            <h1>
              <span>RISE.</span>
              <span>PUSH.</span>
              <span className="gold">BECOME.</span>
            </h1>
            <p className="hero-description">
              {hero?.body || 'Performance wear. Purposeful coaching.'}
            </p>
            <div className="hero-buttons">
              <Link className="button" href="/shop">
                Shop merchandise <ArrowUpRight size={17} />
              </Link>
              <Link className="button secondary" href="/coaching">
                Start training <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
          <div className="hero-side">
            <span className="vertical-line" />
            <p>
              Progress is a practice.<span>MAKE EVERY REP COUNT.</span>
            </p>
          </div>
        </div>
        {!hero?.image_path && (
          <span className="photo-credit">
            Editorial photography · Unsplash · Not the ASCEND coach
          </span>
        )}
      </section>
      {/* The three service promises introduce merchandise, coaching and fulfillment. */}
      <div className="values-strip">
        <div className="container">
          <div className="value-item">
            <Shirt />
            <div>
              <strong>APPAREL FOR THE WORK</strong>
              <span>Discover ASCEND merchandise</span>
            </div>
          </div>
          <div className="value-item">
            <Dumbbell />
            <div>
              <strong>COACHING WITH PURPOSE</strong>
              <span>Physical & online personal training</span>
            </div>
          </div>
          <div className="value-item">
            <Package />
            <div>
              <strong>YOUR WAY TO ASCEND</strong>
              <span>Pickup & nationwide delivery options</span>
            </div>
          </div>
        </div>
      </div>
      {/* These four category cards stay fixed when products or inventory change. */}
      <section className="section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE ASCEND COLLECTION</p>
            <h2>THE WORK. THE WEAR.</h2>
          </div>
          <Link className="text-link" href="/shop">
            Explore the shop <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="category-grid home-categories">
          <Link className="category-card" href="/shop?category=compression-shirts">
            <span className="category-number">01 / PERFORMANCE</span>
            <Shirt className="category-symbol" />
            <h3>Compression & tops</h3>
            <p>Find your fit. Focus on your next rep.</p>
            <ArrowUpRight className="card-arrow" size={22} />
          </Link>
          <Link className="category-card" href="/shop?category=shorts">
            <span className="category-number">02 / MOVEMENT</span>
            <Footprints className="category-symbol" />
            <h3>Shorts & joggers</h3>
            <p>From the warmup to the final set.</p>
            <ArrowUpRight className="card-arrow" size={22} />
          </Link>
          <Link className="category-card" href="/shop?category=gym-accessories">
            <span className="category-number">03 / THE DETAILS</span>
            <Dumbbell className="category-symbol" />
            <h3>Gym accessories</h3>
            <p>The details that go the distance.</p>
            <ArrowUpRight className="card-arrow" size={22} />
          </Link>
          <Link className="category-card" href="/shop?category=supplements">
            <span className="category-number">04 / NUTRITION</span>
            <PillBottle className="category-symbol" />
            <h3>Supplements</h3>
            <p>Explore supplements for your routine.</p>
            <ArrowUpRight className="card-arrow" size={22} />
          </Link>
        </div>
        <div className="catalog-note">
          <Package size={17} />
          <span>Explore the shop for current prices, sizes and availability.</span>
        </div>
        {catalog.collections.length > 0 && (
          <div className="button-row">
            <Link href="/collections" className="text-link">
              See the latest drops <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>
      {/* Coaching introduction uses the published coach content when it is available. */}
      <section className="split-editorial">
        <div className="editorial-image">
          <img
            src={bio?.image_path || '/images/gym-editorial.jpg'}
            alt={bio?.image_path ? 'ASCEND coaching' : 'Editorial gym training space'}
            loading="lazy"
          />
          <span className="image-label">DISCIPLINE. DIRECTION. PROGRESS.</span>
          {!bio?.image_path && (
            <span className="photo-credit">Editorial photography · Unsplash</span>
          )}
        </div>
        <div className="editorial-copy">
          <p className="eyebrow">PERSONAL TRAINING</p>
          <h2>
            YOUR GOALS.
            <br />
            OUR COMMITMENT.
          </h2>
          <p>
            {bio?.body ||
              'Make the next step count. Explore personal training that gives your effort a direction, whether you’re in the gym or training online.'}
          </p>
          <div className="coaching-options">
            <div>
              <MapPin size={20} />
              <strong>Physical coaching</strong>
              <p>In-person guidance and focused sessions.</p>
            </div>
            <div>
              <Monitor size={20} />
              <strong>Online coaching</strong>
              <p>Support that meets you where you are.</p>
            </div>
          </div>
          <Link href="/coaching" className="button">
            Find your training <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      {/* Community quotes are shown only when each testimonial has explicit approval. */}
      {Array.isArray(testimonials) && testimonials.some((t: any) => t.approved === true) && (
        <section className="section container">
          <p className="eyebrow">THE ASCEND COMMUNITY</p>
          <h2>REAL WORK. REAL WORDS.</h2>
          <div className="category-grid">
            {testimonials
              .filter((t: any) => t.approved === true)
              .map((t: any, i: number) => (
                <blockquote className="panel" key={i}>
                  <p>“{t.quote}”</p>
                  <footer>{t.name}</footer>
                </blockquote>
              ))}
          </div>
        </section>
      )}
      {/* The brand manifesto links to the full ASCEND story. */}
      <section className="manifesto container">
        <div className="small-monogram">
          <BrandLogo variant="monogram" />
        </div>
        <p className="eyebrow">MORE THAN A FINISH LINE</p>
        <h2>
          YOU DON’T FIND YOUR LIMIT.
          <br />
          YOU <span className="gold">MOVE IT.</span>
        </h2>
        <p>
          ASCEND is a commitment to showing up. To putting in the work. To taking the next step, and
          the one after that.
        </p>
        <Link className="text-link" href="/about">
          The ASCEND mindset <ArrowUpRight size={16} />
        </Link>
      </section>
      {/* Newsletter signup asks for separate marketing consent. */}
      <Newsletter />
    </>
  );
}
