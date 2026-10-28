# Brand, product and editorial asset notes

The original root files remain untouched. Copies:

| Public asset | Supplied original |
| --- | --- |
| ascend-horizontal.png | WhatsApp Image 2026-07-06 at 11.43.47 AM.png |
| ascend-primary.png | WhatsApp_Image_2026-07-06_at_11.44.35_AM-removebg-preview.png |
| ascend-monogram.png | WhatsApp_Image_2026-07-06_at_11.45.13_AM-removebg-preview.png |
| ascend-icon.png | WhatsApp_Image_2026-07-06_at_11.45.14_AM-removebg-preview.png |

All four are copied byte-for-byte. Transparent horizontal image verified alpha=0 in the empty background. The primary/icon/monogram originals contain presentation labels and margins. The self-contained ascend-wordmark.svg, ascend-icon.svg and ascend-monogram.svg display assets embed the unchanged supplied PNG bytes and use view boxes to remove presentation margins. The horizontal SVG includes a subtle dilation for heavier lettering. The shared BrandLogo component renders a plain image element so server and client markup stays identical; original colours and proportions are preserved. Regenerate these wrappers with node scripts/build-brand-logos.mjs after replacing approved source artwork. Higher-resolution transparent standalone logo exports would improve sharpness and favicon/social previews.

Current requested logo placements:

| Placement | Display asset | Supplied artwork |
| --- | --- | --- |
| Header, far left | ascend-icon.svg | 11.45.14 AM remove-background PNG |
| Homepage, prominent logo above BUILT FOR YOUR NEXT LEVEL | ascend-wordmark.svg | 11.43.47 AM PNG |
| Browser favicon | ascend-monogram.svg, with the original PNG fallback | 11.45.13 AM remove-background PNG |

Temporary editorial photography:

- gym-editorial.jpg: https://images.unsplash.com/photo-1534438327276-14e5300c3a48
- training-editorial.jpg: https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e

These are gym/athlete editorial images, not ASCEND products, facilities or staff. The UI identifies them as editorial; no athlete is presented as the business coach. Replace with approved ASCEND photography using homepage/coach content controls. [Unsplash license](https://unsplash.com/license).

Merchandise photographs supplied on 14 October 2026:

| Category | Local product photograph | Supplied original |
| --- | --- | --- |
| Compression Shirts | `public/products/compression-shirts/black-red-graphic-compression-shirt.jpg` | WhatsApp Image 2026-10-14 at 1.45.21 PM (1).jpeg |
| Compression Shirts | `public/products/compression-shirts/black-white-graphic-compression-shirt.jpg` | WhatsApp Image 2026-10-14 at 1.45.21 PM (2).jpeg |
| Compression Shirts | `public/products/compression-shirts/black-cross-graphic-compression-shirt.jpg` | WhatsApp Image 2026-10-14 at 1.45.21 PM.jpeg |
| Shorts | `public/products/shorts/layered-training-shorts.jpg` | WhatsApp Image 2026-10-14 at 1.45.49 PM.jpeg |
| Gym Accessories | `public/products/gym-accessories/black-lever-lifting-belt.jpg` | WhatsApp Image 2026-10-14 at 1.46.14 PM.jpeg |

All five originals are preserved byte-for-byte locally and in the public `product-images` storage bucket. Product IDs, uploaded storage paths, and alt text are recorded in `docs/catalog/product-images-2026-10-14.json`.

Size labels, the shorts photograph's “3pieces” banner, and other supplier wording remain part of the supplied originals. These annotations are image references, not current ASCEND stock or package terms. The owner's confirmed shirt and shorts variants are Large; the belt is One Size. Shorts are sold per pair, with black, white, and blue as separate colour choices. Current prices and remaining availability come from the configured product and inventory records. These product photographs do not establish readiness of payment, delivery, coaching, or email setup.
