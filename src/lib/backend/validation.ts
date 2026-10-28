/** Shared input schemas reject incomplete or invalid checkout, product, customer and coaching requests. */
import { z } from 'zod';
const uuid = z.string().uuid();
const text = z.string().trim();
export const addressSchema = z.object({
  recipient_name: text.min(2, "Enter the customer's full name.").max(120),
  phone: text.min(7).max(30),
  state: text.min(2).max(80),
  city: text.min(2).max(100),
  area: text.min(2).max(150),
  address: text.min(5).max(600),
  landmark: text.max(200).optional(),
});
// Website checkout requires customer email; delivery requests must include an address.
export const checkoutSchema = z
  .object({
    customer: z.object({
      name: text.min(2, "Enter the customer's full name.").max(120),
      email: z.email().max(254),
      phone: text.min(7).max(30),
    }),
    items: z
      .array(z.object({ variant_id: uuid, quantity: z.coerce.number().int().min(1).max(100) }))
      .min(1)
      .max(40),
    fulfillment_method: z.enum(['pickup', 'delivery']),
    delivery_details: addressSchema.optional(),
    delivery_address: addressSchema.optional(),
    source: z.enum(['website', 'whatsapp', 'instagram', 'in_person', 'other']).optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.fulfillment_method === 'delivery' &&
      !input.delivery_details &&
      !input.delivery_address
    )
      ctx.addIssue({
        code: 'custom',
        path: ['delivery_details'],
        message: 'Enter the delivery address.',
      });
    if (new Set(input.items.map((i) => i.variant_id)).size !== input.items.length)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Combine duplicate variants before checkout.',
      });
  });
// Evidence records what the customer says they transferred; it does not confirm a bank receipt.
export const evidenceSchema = z.object({
  amount: z.coerce.number().positive().max(100000000),
  transfer_reference: text.min(3).max(160),
  bank_name: text.max(100).optional(),
  transferred_at: z.iso.datetime({ offset: true }).optional(),
  proof_path: z
    .string()
    .regex(/^proofs\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/)
    .optional(),
});
export const idSchema = uuid;
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
export const productSchema = z.object({
  id: uuid.optional(),
  name: text.min(2).max(180),
  slug: text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: text.max(10000).default(''),
  category_id: uuid.nullish(),
  price: z.coerce.number().positive().max(100000000),
  cost_price: z.coerce.number().nonnegative().nullish(),
  status: z.enum(['draft', 'coming_soon', 'active', 'unavailable']).default('draft'),
  featured: z.boolean().default(false),
  size_guide: text.max(4000).nullish(),
  image_urls: z.array(z.string().max(1000)).max(12).optional(),
});
export const packageSchema = z
  .object({
    id: uuid.optional(),
    name: text.min(2).max(150),
    mode: z.enum(['physical', 'online']),
    description: text.max(10000).default(''),
    price: z.coerce.number().positive().max(100000000),
    billing_model: z
      .enum(['monthly', 'per_session', 'session_bundle', 'fixed_duration'])
      .default('monthly'),
    duration_months: z.coerce.number().int().min(1).max(36).default(1),
    duration_days: z.coerce.number().int().positive().max(1095).nullish(),
    session_count: z.coerce.number().int().positive().max(1000).nullish(),
    features: z.array(text.max(300)).max(30).default([]),
    active: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (
      (p.billing_model === 'per_session' || p.billing_model === 'session_bundle') &&
      !p.session_count
    )
      ctx.addIssue({
        code: 'custom',
        path: ['session_count'],
        message: 'Enter the number of paid sessions.',
      });
    if (p.billing_model === 'fixed_duration' && !p.duration_days)
      ctx.addIssue({
        code: 'custom',
        path: ['duration_days'],
        message: 'Enter the program duration in days.',
      });
  });
export const subscriberSchema = z.object({
  email: z.email().max(254),
  name: text.max(120).optional(),
  consent: z.literal(true),
});

// Staff can record an offline order with name and phone while leaving email optional.
export const manualCheckoutSchema = z
  .object({
    customer: z.object({
      name: text.min(2).max(120),
      email: z.email().max(254).optional(),
      phone: text.min(7).max(30),
      customer_id: uuid.optional(),
    }),
    items: checkoutSchema.shape.items,
    fulfillment_method: checkoutSchema.shape.fulfillment_method,
    delivery_details: addressSchema.optional(),
    delivery_address: addressSchema.optional(),
    source: checkoutSchema.shape.source,
  })
  .superRefine((input, ctx) => {
    if (
      input.fulfillment_method === 'delivery' &&
      !input.delivery_details &&
      !input.delivery_address
    )
      ctx.addIssue({
        code: 'custom',
        path: ['delivery_details'],
        message: 'Enter the delivery address.',
      });
    if (new Set(input.items.map((i) => i.variant_id)).size !== input.items.length)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Combine duplicate variants before checkout.',
      });
  });

// Offline contact entry does not create or link an authentication account.
export const customerSchema = z.object({
  id: uuid.optional(),
  name: text.min(2, "Enter the customer's full name.").max(120),
  phone: text
    .min(7, 'Enter a valid phone number.')
    .max(30)
    .refine(
      (value) => /^\+?[\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 7,
      'Enter one valid phone number, including the country code when needed.',
    ),
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || null : value),
    z.email().max(254).nullish(),
  ),
});
