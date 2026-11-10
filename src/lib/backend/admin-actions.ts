import 'server-only';
import { randomUUID } from 'node:crypto';
/** Validates dashboard actions, checks staff permissions and delegates stock, payment and coaching changes to database functions. */
import { productImageReference } from '../storage/image-urls';
import { deleteProductImageObjects } from '../storage/product-images';
import { z } from 'zod';
import { requireStaff } from '../auth';
import { createAdminClient } from '../supabase/admin';
import { AppError, databaseError } from './errors';
import {
  checkoutSchema,
  manualCheckoutSchema,
  evidenceSchema,
  productSchema,
  packageSchema,
  customerSchema,
} from './validation';
import { validateProof } from './uploads';
const uuid = z.string().uuid();
const text = z.string().trim();
const money = z.coerce.number().nonnegative().max(100000000);
const ownerActions = new Set([
  'resolveOrderStock',
  'removeStock',
  'deleteProduct',
  'verifyPayment',
  'rejectPayment',
  'refundPayment',
  'activateEnrollment',
  'authorizePayLater',
  'saveSettings',
  'setStaffRole',
  'revokeStaffAccess',
  'saveExpense',
  'approveCampaign',
  'sendCampaign',
]);
type Json = Record<string, any>;
export async function adminAction(action: string, raw: Json) {
  const { db, user, role, permissions } = await requireStaff();
  // Some assistants may receive specific operational permissions; financial approvals remain owner-only.
  const delegated: Record<string, string> = {
    savePackage: 'manage_packages',
    saveDeliveryRate: 'manage_delivery_rates',
  };
  if (delegated[action] && role !== 'owner' && permissions?.[delegated[action]] !== true)
    throw new AppError('The owner has not granted this operational permission.', 403, 'forbidden');
  if (ownerActions.has(action) && role !== 'owner')
    throw new AppError('Only the owner may approve this action.', 403, 'forbidden');
  const admin = createAdminClient();
  // Business RPCs receive the verified actor so PostgreSQL can enforce permissions and record audit history.
  async function rpc(name: string, args: Json) {
    const { data, error } = await admin.rpc(name, { ...args, p_actor: user.id });
    databaseError(error);
    return data;
  }
  async function save(table: string, input: Json, conflict = 'id'): Promise<Json> {
    const fields =
      table === 'products'
        ? 'id,category_id,name,slug,description,price,status,featured,size_guide,created_at,updated_at'
        : table === 'product_variants'
          ? 'id,product_id,sku,size,color,stock_available,stock_confirmed_at,low_stock_threshold,created_at'
          : '*';
    const { id, ...changes } = input;
    // Existing records must use UPDATE: an upsert reads EXCLUDED columns, including
    // owner-supplied purchasing costs intentionally excluded from authenticated SELECT.
    const mutation = id
      ? db.from(table).update(changes).eq('id', id)
      : conflict !== 'id'
        ? db.from(table).upsert(input, { onConflict: conflict })
        : db.from(table).insert(input);
    const { data, error } = await mutation.select(fields).single();
    databaseError(error);
    if (!data) throw new AppError('The record could not be saved.');
    return data as unknown as Json;
  }
  async function assertProductPublishable(productId: string) {
    const { data, error } = await db
      .from('products')
      .select('id,product_images(id),product_variants(stock_available,stock_confirmed_at)')
      .eq('id', productId)
      .maybeSingle();
    databaseError(error);
    if (!data) throw new AppError('Product not found.', 404);
    if (!Array.isArray(data.product_images) || !data.product_images.length)
      throw new AppError('Add at least one product photograph before publishing.');
    if (
      !Array.isArray(data.product_variants) ||
      !data.product_variants.some(
        (variant: Json) => variant.stock_confirmed_at && Number(variant.stock_available) > 0,
      )
    )
      throw new AppError('Confirm at least one available unit before publishing.');
  }
  switch (action) {
    case 'saveProduct': {
      const setup = raw.id
        ? null
        : z
            .object({
              opening_size: text.min(1).max(50).default('One Size'),
              opening_color: text.min(1).max(60).default('Default'),
              opening_quantity: z.coerce.number().int().min(0).max(100000),
              publish_to_store: z.boolean().default(false),
              additional_variants: z.array(text.max(200)).max(20).default([]),
            })
            .parse(raw);
      const additionalVariants = (setup?.additional_variants || []).map((line, index) => {
        const [size, color, quantity, ...extra] = line.split('|').map((part) => part.trim());
        if (extra.length || !size || !color || !/^\d+$/.test(quantity || ''))
          throw new AppError(
            `Variant line ${index + 1} must use: Size | Colour | whole stock count.`,
          );
        return {
          size: text.min(1).max(50).parse(size),
          color: text.min(1).max(60).parse(color),
          quantity: z.coerce.number().int().min(0).max(100000).parse(quantity),
        };
      });
      if (setup?.publish_to_store && setup.opening_quantity < 1)
        throw new AppError(
          'Count at least one unit before publishing. Save as a draft if stock is not ready.',
        );
      const { image_urls, ...input } = productSchema.parse(raw);
      if (role !== 'owner' && input.cost_price != null)
        throw new AppError('Only the owner may change purchasing costs.', 403);
      if (input.id && input.status === 'active') await assertProductPublishable(input.id);
      const product = setup
        ? await rpc('setup_product', {
            p_product: input,
            p_size: setup.opening_size,
            p_color: setup.opening_color,
            p_quantity: setup.opening_quantity,
            // The browser publishes only after variants and photographs have been saved.
            p_publish: false,
          })
        : await save('products', input);
      if (setup && additionalVariants.length) {
        for (const [index, variant] of additionalVariants.entries()) {
          try {
            const createdVariant = await save('product_variants', {
              product_id: product.product.id,
              sku: `ASC-${String(product.product.id).replaceAll('-', '').toUpperCase()}-${index + 2}`,
              size: variant.size,
              color: variant.color,
              low_stock_threshold: 5,
            });
            await rpc('record_stock', {
              p_variant_id: createdVariant.id,
              p_kind: 'opening',
              p_quantity: variant.quantity,
              p_note: 'Opening stock counted during product setup',
              p_resellable: false,
            });
          } catch {
            throw new AppError(
              `The product draft was saved, but size/colour option ${index + 2} could not be completed. Find the draft in Products and finish that option there; do not submit the form again.`,
            );
          }
        }
      }
      // Omitted image_urls leaves the gallery alone; a supplied list replaces its saved attachments.
      if (image_urls) {
        const paths = image_urls.map((value) => {
          const reference = productImageReference(value, product.id);
          if (!reference)
            throw new AppError(
              'Use images uploaded for this product from its configured image storage.',
            );
          return reference;
        });
        const { error: de } = await db.from('product_images').delete().eq('product_id', product.id);
        databaseError(de);
        if (paths.length) {
          const { error: ie } = await db.from('product_images').insert(
            paths.map((storage_path, sort_order) => ({
              product_id: product.id,
              storage_path,
              sort_order,
              alt: input.name,
            })),
          );
          databaseError(ie);
        }
      }
      return product;
    }
    case 'publishProduct': {
      const { product_id } = z.object({ product_id: uuid }).parse(raw);
      await assertProductPublishable(product_id);
      const { data: product, error } = await db
        .from('products')
        .update({ status: 'active' })
        .eq('id', product_id)
        .select('id,status')
        .single();
      databaseError(error);
      if (!product) throw new AppError('Product could not be published.');
      return product;
    }
    case 'archiveProduct': {
      const { product_id } = z.object({ product_id: uuid }).parse(raw);
      const { data: product, error } = await db
        .from('products')
        .update({ status: 'unavailable' })
        .eq('id', product_id)
        .select('id,status')
        .single();
      databaseError(error);
      if (!product) throw new AppError('Product could not be archived.');
      return product;
    }
    case 'deleteProduct': {
      const input = z
        .object({
          product_id: uuid,
          confirm_name: text.min(1).max(180),
        })
        .parse(raw);
      const result = await rpc('delete_unused_product', {
        p_product_id: input.product_id,
        p_confirm_name: input.confirm_name,
      });
      try {
        await deleteProductImageObjects(input.product_id, result.image_paths || []);
      } catch {
        return { id: result.id, name: result.name, image_cleanup_pending: true };
      }
      return { id: result.id, name: result.name, deleted: true };
    }
    case 'deleteProductImage': {
      const { image_id } = z.object({ image_id: uuid }).parse(raw);
      const { data: image, error: ie } = await db
        .from('product_images')
        .select('id')
        .eq('id', image_id)
        .maybeSingle();
      databaseError(ie);
      if (!image) throw new AppError('Product image not found.', 404);
      const { error } = await db.from('product_images').delete().eq('id', image_id);
      databaseError(error);
      return { removed: true };
    }
    case 'saveVariant': {
      const variant = z
        .object({
          id: uuid.optional(),
          product_id: uuid,
          sku: z.preprocess(
            (value) => (value === '' ? undefined : value),
            text.min(2).max(80).optional(),
          ),
          size: text.max(50).nullish(),
          color: text.max(60).nullish(),
          low_stock_threshold: z.coerce.number().int().nonnegative().max(100000).default(5),
        })
        .parse(raw);
      return save('product_variants', {
        ...variant,
        sku: variant.sku || `ASC-${randomUUID().replaceAll('-', '').toUpperCase()}`,
      });
    }
    // Stock changes go through the audited database workflow rather than directly editing a stock counter.
    case 'stockMovement': {
      const i = z
        .object({
          variant_id: uuid,
          kind: z.enum(['opening', 'restock', 'adjustment', 'damaged', 'return', 'reconciliation']),
          quantity: z.coerce.number().int().min(-100000).max(100000),
          note: text.min(3).max(1000),
          resellable: z.boolean().default(false),
        })
        .parse(raw);
      return rpc('record_stock', {
        p_variant_id: i.variant_id,
        p_kind: i.kind,
        p_quantity: i.quantity,
        p_note: i.note,
        p_resellable: i.resellable,
      });
    }
    case 'removeStock': {
      const i = z
        .object({
          variant_id: uuid,
          quantity: z.coerce.number().int().min(1).max(100000),
          note: text.min(3).max(1000),
        })
        .parse(raw);
      return rpc('record_stock', {
        p_variant_id: i.variant_id,
        p_kind: 'adjustment',
        p_quantity: -i.quantity,
        p_note: i.note,
        p_resellable: false,
      });
    }
    case 'createManualOrder': {
      const i = manualCheckoutSchema.parse(raw);
      const checkout = await rpc('create_checkout', {
        p_items: i.items,
        p_customer: i.customer,
        p_fulfillment_method: i.fulfillment_method,
        p_delivery_details: i.delivery_details || i.delivery_address || {},
        p_source: i.source || 'other',
      });
      const { attachOrderNotificationLink } = await import('../notifications');
      return attachOrderNotificationLink(checkout);
    }
    case 'setFulfillment': {
      const i = z
        .object({
          order_id: uuid,
          status: z.enum(['processing', 'ready_for_pickup', 'shipped', 'delivered', 'picked_up']),
          courier_name: text.max(100).nullish(),
          tracking_reference: text.max(160).nullish(),
        })
        .parse(raw);
      return rpc('update_fulfillment', {
        p_order_id: i.order_id,
        p_status: i.status,
        p_courier_name: i.courier_name || null,
        p_tracking_reference: i.tracking_reference || null,
      });
    }
    case 'resolveOrderStock': {
      const i = z.object({ order_id: uuid, note: text.min(3).max(1000) }).parse(raw);
      return rpc('resolve_order_stock', { p_order_id: i.order_id, p_note: i.note });
    }
    case 'cancelOrder': {
      const i = z.object({ order_id: uuid, reason: text.min(3).max(1000) }).parse(raw);
      return rpc('cancel_order', { p_order_id: i.order_id, p_reason: i.reason });
    }
    case 'quoteDelivery': {
      const i = z
        .object({ order_id: uuid, fee: money.optional(), delivery_fee: money.optional() })
        .parse(raw);
      const fee = i.fee ?? i.delivery_fee;
      if (fee == null) throw new AppError('Enter the confirmed delivery fee.');
      return rpc('quote_delivery', { p_order_id: i.order_id, p_fee: fee });
    }
    case 'addOrderNote': {
      const i = z.object({ order_id: uuid, note: text.min(1).max(4000) }).parse(raw);
      return save('order_notes', { order_id: i.order_id, body: i.note, created_by: user.id });
    }
    case 'recordPayment': {
      const i = evidenceSchema.extend({ invoice_id: uuid }).parse(raw);
      if (i.proof_path) await validateProof(i.proof_path, i.invoice_id);
      return rpc('submit_payment', {
        p_invoice_id: i.invoice_id,
        p_amount: i.amount,
        p_transfer_reference: i.transfer_reference,
        p_bank_name: i.bank_name || null,
        p_transferred_at: i.transferred_at || null,
        p_proof_path: i.proof_path || null,
      });
    }
    // A transfer claim becomes a verified receipt only when the owner records the actual bank credit.
    case 'verifyPayment': {
      const i = z
        .object({
          payment_id: uuid,
          amount_received: money.refine((n) => n > 0, 'Enter the actual bank credit amount.'),
          bank_credit_reference: text.min(3).max(160),
          note: text.max(1000).optional(),
        })
        .parse(raw);
      return rpc('verify_payment', {
        p_payment_id: i.payment_id,
        p_amount_received: i.amount_received,
        p_bank_credit_reference: i.bank_credit_reference,
        p_note: i.note || null,
      });
    }
    case 'rejectPayment': {
      const i = z.object({ payment_id: uuid, note: text.min(3).max(1000) }).parse(raw);
      return rpc('reject_payment', { p_payment_id: i.payment_id, p_note: i.note });
    }
    case 'refundPayment': {
      const i = z
        .object({
          payment_id: uuid,
          amount: money.refine((n) => n > 0),
          reason: text.min(3).max(1000),
          external_reference: text.min(3).max(160),
        })
        .parse(raw);
      return rpc('record_refund', {
        p_payment_id: i.payment_id,
        p_amount: i.amount,
        p_reason: i.reason,
        p_external_reference: i.external_reference,
      });
    }
    case 'authorizePayLater': {
      const i = z.object({ invoice_id: uuid, note: text.min(3).max(1000) }).parse(raw);
      return rpc('authorize_pay_later', { p_invoice_id: i.invoice_id, p_note: i.note });
    }
    case 'saveCustomer':
      return save('customers', customerSchema.parse(raw));
    case 'savePackage':
      return save('coaching_packages', packageSchema.parse(raw));
    case 'enrollClient': {
      const i = z.object({ package_id: uuid, customer_id: uuid }).parse(raw);
      return rpc('request_enrollment', {
        p_package_id: i.package_id,
        p_customer_id: i.customer_id,
      });
    }
    // Coaching activation is a separate owner decision with a confirmed start date.
    case 'activateEnrollment': {
      const i = z.object({ enrollment_id: uuid, start_date: z.iso.date() }).parse(raw);
      return rpc('activate_enrollment', {
        p_enrollment_id: i.enrollment_id,
        p_start_date: i.start_date,
      });
    }
    case 'extendEnrollment':
    case 'renewEnrollment': {
      const i = z.object({ enrollment_id: uuid }).parse(raw);
      return rpc('renew_enrollment', { p_enrollment_id: i.enrollment_id });
    }
    case 'addClientNote': {
      const i = z.object({ enrollment_id: uuid, note: text.min(1).max(4000) }).parse(raw);
      return save('coaching_enrollment_notes', {
        enrollment_id: i.enrollment_id,
        body: i.note,
        created_by: user.id,
      });
    }
    case 'useSession': {
      const i = z
        .object({
          enrollment_id: uuid,
          session_date: z.iso.date(),
          note: text.max(1000).optional(),
        })
        .parse(raw);
      return rpc('record_coaching_session', {
        p_enrollment_id: i.enrollment_id,
        p_session_date: i.session_date,
        p_note: i.note || null,
      });
    }
    case 'saveExpense':
      return save('expenses', {
        ...z
          .object({
            category: text.min(2).max(100),
            description: text.min(2).max(1000),
            amount: money.refine((n) => n > 0),
            spent_on: z.iso.date(),
          })
          .parse(raw),
        created_by: user.id,
      });
    case 'saveCategory':
      return save(
        'categories',
        z
          .object({
            id: uuid.optional(),
            name: text.min(2).max(100),
            slug: text.regex(/^[a-z0-9-]+$/),
            sort_order: z.coerce.number().int().default(0),
            active: z.boolean().default(true),
          })
          .parse(raw),
      );
    case 'saveCollection': {
      const { product_ids, ...i } = z
        .object({
          id: uuid.optional(),
          name: text.min(2).max(150),
          slug: text.regex(/^[a-z0-9-]+$/),
          description: text.max(4000).default(''),
          banner_path: text.max(1000).nullish(),
          status: z.enum(['draft', 'published', 'upcoming']),
          launch_at: z.iso.datetime({ offset: true }).nullish(),
          product_ids: z.array(uuid).max(200).optional(),
        })
        .parse(raw);
      const collection = await save('collections', i);
      if (product_ids) {
        const { error } = await db
          .from('collection_products')
          .delete()
          .eq('collection_id', collection.id);
        databaseError(error);
        if (product_ids.length) {
          const { error: e } = await db
            .from('collection_products')
            .insert(
              product_ids.map((product_id) => ({ collection_id: collection.id, product_id })),
            );
          databaseError(e);
        }
      }
      return collection;
    }
    case 'saveContent':
      return save(
        'site_content',
        z
          .object({
            id: uuid.optional(),
            section: text.regex(/^[a-z0-9_-]+$/).max(80),
            title: text.max(250).default(''),
            body: text.max(20000).default(''),
            image_path: text.max(1000).nullish(),
            data: z.record(z.string(), z.unknown()).default({}),
            published: z.boolean().default(false),
          })
          .parse(raw),
        'section',
      );
    case 'saveDeliveryRate':
      return save(
        'delivery_rates',
        z
          .object({
            id: uuid.optional(),
            state: text.min(2).max(80),
            city: text.max(100).nullish(),
            area: text.max(150).nullish(),
            fee: money,
            active: z.boolean().default(true),
          })
          .parse(raw),
      );
    case 'saveSettings': {
      const input = raw.changes || raw;
      const i = z
        .object({
          bank_name: text.max(100).optional(),
          bank_account_number: text
            .regex(/^\d{10}$/)
            .or(z.literal(''))
            .optional(),
          bank_account_holder: text.max(120).optional(),
          payment_instructions: text.max(4000).optional(),
          pickup_location: text.max(1000).optional(),
          pickup_instructions: text.max(3000).optional(),
          pickup_contact: text.max(30).optional(),
          pickup_hours: text.max(200).optional(),
          contact_email: z.email().or(z.literal('')).optional(),
          whatsapp_number: text
            .regex(/^\d{7,15}$/)
            .or(z.literal(''))
            .optional(),
          instagram_url: z.url().or(z.literal('')).optional(),
          timezone: z
            .string()
            .refine((v) => {
              try {
                new Intl.DateTimeFormat('en', { timeZone: v });
                return true;
              } catch {
                return false;
              }
            })
            .optional(),
          reservation_minutes: z.coerce.number().int().min(15).max(10080).optional(),
          reminders_enabled: z.boolean().optional(),
          reminder_days: z.array(z.coerce.number().int().nonnegative().max(90)).max(10).optional(),
        })
        .parse(input);
      if (Object.keys(i).length === 0) throw new AppError('No settings changes were supplied.');
      return rpc('update_business_settings', { p_changes: i });
    }
    case 'setStaffRole': {
      const i = z
        .object({
          user_id: uuid,
          role: z.enum(['owner', 'assistant']),
          permissions: z
            .object({
              manage_packages: z.boolean().optional(),
              manage_delivery_rates: z.boolean().optional(),
            })
            .strict()
            .default({}),
        })
        .parse(raw);
      return rpc('set_staff_role', {
        p_user_id: i.user_id,
        p_role: i.role,
        p_permissions: i.permissions,
      });
    }
    case 'revokeStaffAccess': {
      // Remove only the existing staff assignment; identities, customers and financial history stay intact.
      const i = z.object({ user_id: uuid, note: text.min(3).max(1000) }).parse(raw);
      return rpc('revoke_staff_access', { p_user_id: i.user_id, p_note: i.note });
    }
    case 'addSubscriber': {
      const i = z
        .object({
          email: z.email(),
          name: text.max(120).optional(),
          consent: z.literal(true),
          source: text.min(3).max(120),
        })
        .parse(raw);
      const { data, error } = await admin.rpc('subscribe_newsletter', {
        p_email: i.email,
        p_name: i.name || null,
        p_source: i.source,
        p_policy_version: '1.0',
      });
      databaseError(error);
      return data;
    }
    // Recipient membership is saved for the draft; approval and sending happen through separate actions.
    case 'saveCampaign': {
      const { subscriber_ids, ...i } = z
        .object({
          id: uuid.optional(),
          name: text.min(2).max(150),
          subject: text.min(3).max(200),
          body_html: text.min(10).max(100000),
          subscriber_ids: z.array(uuid).max(10000).optional(),
        })
        .parse(raw);
      if (i.id) {
        const { data: campaign, error } = await db
          .from('campaigns')
          .select('status')
          .eq('id', i.id)
          .single();
        databaseError(error);
        if (!campaign || campaign.status !== 'draft')
          throw new AppError('Create a new draft to change an approved or sent campaign.');
      }
      const saved = await save('campaigns', { ...i, status: 'draft', created_by: user.id });
      let query = db.from('newsletter_subscribers').select('id').eq('status', 'subscribed');
      if (subscriber_ids?.length) query = query.in('id', subscriber_ids);
      const { data: subscribers, error: se } = await query;
      databaseError(se);
      const { error: de } = await db
        .from('campaign_recipients')
        .delete()
        .eq('campaign_id', saved.id);
      databaseError(de);
      if (subscribers?.length) {
        const { error: ie } = await db
          .from('campaign_recipients')
          .insert(subscribers.map((s) => ({ campaign_id: saved.id, subscriber_id: s.id })));
        databaseError(ie);
      }
      return { ...saved, recipient_count: subscribers?.length || 0 };
    }
    case 'approveCampaign': {
      const i = z.object({ campaign_id: uuid }).parse(raw);
      return rpc('approve_campaign', { p_campaign_id: i.campaign_id });
    }
    case 'sendCampaign': {
      const i = z.object({ campaign_id: uuid }).parse(raw);
      const { sendCampaign } = await import('../notifications');
      return sendCampaign(i.campaign_id, user.id);
    }
    default:
      throw new AppError('Unknown dashboard action.', 404);
  }
}
