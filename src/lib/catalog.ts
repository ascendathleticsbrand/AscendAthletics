import 'server-only';
/** Reads the public storefront catalog and converts database records into the shapes used by shop components. */
import { publicImageUrl as imageUrl } from './storage/image-urls';
import { createPublicClient } from './supabase/public';
import { hasSupabaseConfig, setupMessage } from './env';
import type { Product, CoachingPackage, PublicCatalog, PublicSettings } from './backend/types';
export type {
  Product,
  ProductVariant,
  CoachingPackage,
  PublicCatalog,
  PublicSettings,
} from './backend/types';
type Row = Record<string, any>;
// Adapt database field names and numeric values once so storefront components share one product shape.
export function normalizeProduct(row: Row): Product {
  const images = (row.images || []).map((i: Row) => imageUrl(i.storage_path));
  const variants = (row.variants || []).map((v: Row) => ({
    ...v,
    product_id: row.id,
    price_ngn: null,
    available_quantity: Number(v.stock_available),
    opening_stock_confirmed: true,
  }));
  return {
    ...row,
    price: Number(row.price),
    price_ngn: Number(row.price),
    images,
    image_urls: images,
    variants,
    collection_id: null,
  } as Product;
}
export async function getPublicCatalog(): Promise<PublicCatalog> {
  if (!hasSupabaseConfig())
    return {
      products: [],
      categories: [],
      collections: [],
      setupRequired: true,
      error: setupMessage,
    };
  // Anonymous reads keep the public catalog subject to public visibility rules even for staff visitors.
  const db = createPublicClient();
  const [products, categories, collections] = await Promise.all([
    db.from('public_catalog').select('*'),
    db.from('categories').select('*').eq('active', true).order('sort_order'),
    db
      .from('collections')
      .select('*,collection_products(product_id)')
      .order('launch_at', { ascending: false }),
  ]);
  const error = products.error || categories.error || collections.error;
  if (error)
    return {
      products: [],
      categories: [],
      collections: [],
      setupRequired: true,
      error: 'The catalog is unavailable. Check the database migration and public access policies.',
    };
  return {
    products: (products.data || []).map(normalizeProduct),
    categories: categories.data || [],
    collections: (collections.data || []).map((c) => ({
      ...c,
      banner_path: c.banner_path ? imageUrl(c.banner_path) : null,
    })),
    setupRequired: false,
  };
}
export async function getPublicProduct(slug: string): Promise<Product | null> {
  if (!hasSupabaseConfig()) return null;
  const { data, error } = await createPublicClient()
    .from('public_catalog')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return error || !data ? null : normalizeProduct(data);
}
export async function getCoachingPackages(): Promise<CoachingPackage[]> {
  if (!hasSupabaseConfig()) return [];
  const { data, error } = await createPublicClient()
    .from('coaching_packages')
    .select('*')
    .eq('active', true)
    .order('price');
  if (error) return [];
  return (data || []).map((p) => ({
    ...p,
    price: Number(p.price),
    price_ngn: Number(p.price),
    slug: p.id,
    features: Array.isArray(p.features) ? p.features : [],
  }));
}
export async function getPublicContent(): Promise<Record<string, Row>> {
  if (!hasSupabaseConfig()) return {};
  const { data, error } = await createPublicClient()
    .from('site_content')
    .select('*')
    .eq('published', true);
  if (error) return {};
  return Object.fromEntries(
    (data || []).map((row) => [
      row.section,
      { ...row, image_path: row.image_path ? imageUrl(row.image_path) : null },
    ]),
  );
}
export async function getBusinessSettings(): Promise<PublicSettings> {
  const fallback = { whatsapp_number: '2349130607719', contact_phone: '+234 913 060 7719' };
  if (!hasSupabaseConfig()) return fallback;
  const { data, error } = await createPublicClient()
    .from('public_business_settings')
    .select('*')
    .maybeSingle();
  if (error || !data) return fallback;
  return { ...fallback, ...data, pickup_phone: data.pickup_contact };
}
