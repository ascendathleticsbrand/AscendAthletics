/** Shared TypeScript descriptions of products, coaching packages, checkout inputs and public storefront data. */
export type StaffRole = 'owner' | 'assistant';
export type PaymentStatus =
  'pending' | 'evidence_submitted' | 'partially_paid' | 'paid' | 'rejected' | 'refunded';
export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price_ngn: number | null;
  stock_on_hand: number;
  reserved_quantity: number;
  available_quantity: number;
  opening_stock_confirmed: boolean;
  low_stock_threshold: number;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_ngn: number;
  price: number;
  image_urls: string[];
  category_id: string | null;
  collection_id: string | null;
  images: string[];
  featured: boolean;
  status: string;
  size_guide: string | null;
  variants: ProductVariant[];
};
export type CoachingPackage = {
  id: string;
  name: string;
  slug: string;
  mode: 'physical' | 'online';
  description: string;
  price_ngn: number;
  price: number;
  billing_model: string;
  duration_months: number | null;
  duration_days: number | null;
  session_count: number | null;
  features: string[];
  active: boolean;
};
export type PublicSettings = {
  business_name?: string;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  payment_instructions?: string;
  pickup_location?: string;
  pickup_instructions?: string;
  pickup_phone?: string;
  pickup_hours?: string;
  contact_email?: string;
  contact_phone?: string;
  whatsapp_number?: string;
  instagram_url?: string;
  timezone?: string;
  [key: string]: unknown;
};
export type PublicCatalog = {
  products: Product[];
  categories: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  setupRequired: boolean;
  error?: string;
};
export type CheckoutInput = {
  customer: { name: string; email: string; phone: string };
  items: { variant_id: string; quantity: number }[];
  fulfillment_method: 'pickup' | 'delivery';
  delivery_address?: {
    recipient_name: string;
    phone: string;
    state: string;
    city: string;
    area: string;
    address: string;
    landmark?: string;
  };
  source?: 'website' | 'whatsapp' | 'instagram' | 'in_person' | 'other';
};
