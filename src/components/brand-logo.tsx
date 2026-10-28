/**
 * Official ASCEND artwork shared by the storefront and admin interface.
 * A fixed image element selects the horizontal wordmark, monogram or icon without changing server/client markup.
 */
type BrandLogoProps = {
  className?: string;
  variant?: 'horizontal' | 'monogram' | 'icon';
};

const artwork = {
  horizontal: {
    src: '/brand/ascend-wordmark.svg',
    width: 546,
    height: 145,
    alt: 'ASCEND ATHLETICS',
  },
  monogram: {
    src: '/brand/ascend-monogram.svg',
    width: 300,
    height: 300,
    alt: 'Official ASCEND monogram',
  },
  icon: { src: '/brand/ascend-icon.svg', width: 260, height: 260, alt: 'ASCEND ATHLETICS icon' },
};

// Keep the hydrated element identical on the server and client. The static SVG
// embeds the supplied PNG artwork and its display treatment, with no React IDs.
export function BrandLogo({ className, variant = 'horizontal' }: BrandLogoProps) {
  return <img className={className} {...artwork[variant]} />;
}
