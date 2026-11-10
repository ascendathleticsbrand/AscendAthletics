import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  createAdmin: vi.fn(),
  privilegedFrom: vi.fn(),
  privilegedRpc: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock('../auth', () => ({ requireStaff: mocks.staff }));
vi.mock('../supabase/admin', () => ({ createAdminClient: mocks.createAdmin }));

import { adminAction } from './admin-actions';
import { AppError } from './errors';

const productId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const product = {
  id: productId,
  name: 'Training gloves',
  slug: 'training-gloves',
  description: 'Training gloves for the gym.',
  price: 17000,
  cost_price: 10000,
  status: 'active',
  featured: false,
};
const savedProduct = {
  id: productId,
  name: product.name,
  slug: product.slug,
  price: product.price,
  status: 'active',
};
const query = {
  insert: mocks.insert,
  update: mocks.update,
  upsert: mocks.upsert,
  eq: mocks.eq,
  select: mocks.select,
  single: mocks.single,
  maybeSingle: mocks.maybeSingle,
};
const db = { from: mocks.from };

function expectNoPrivilegedWrite() {
  expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  expect(mocks.privilegedRpc).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.staff.mockResolvedValue({ db, user: { id: ownerId }, role: 'owner', permissions: {} });
  mocks.createAdmin.mockReturnValue({ from: mocks.privilegedFrom, rpc: mocks.privilegedRpc });
  mocks.from.mockReturnValue(query);
  for (const method of [mocks.insert, mocks.update, mocks.upsert, mocks.eq, mocks.select])
    method.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: savedProduct, error: null });
  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: productId,
      product_images: [{ id: 'image-1' }],
      product_variants: [{ stock_available: 2, stock_confirmed_at: '2026-01-01T00:00:00Z' }],
    },
    error: null,
  });
});

describe('admin product publishing under staff database permissions', () => {
  it('publishes an existing owner product with purchasing cost through its authenticated update', async () => {
    const saved = await adminAction('saveProduct', product);
    expect(saved).toEqual(savedProduct);
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenNthCalledWith(1, 'products');
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'products');
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: 17000,
      cost_price: 10000,
      status: 'active',
      featured: false,
    });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('id');
    expect(mocks.eq).toHaveBeenCalledTimes(2);
    // Cost is owner-writeable but deliberately excluded from authenticated SELECT grants.
    const projection = mocks.select.mock.calls[1][0] as string;
    expect(projection.split(',')).toContain('status');
    expect(projection.split(',')).not.toContain('cost_price');
    expect(projection).not.toContain('*');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('creates a draft with opening stock through the restricted product setup RPC', async () => {
    const { id: unusedId, ...newProduct } = product;
    mocks.privilegedRpc.mockResolvedValueOnce({
      data: { product: { id: productId, status: 'draft' }, variant: { id: variantId } },
      error: null,
    });
    const saved = await adminAction('saveProduct', {
      ...newProduct,
      opening_quantity: 3,
      opening_size: 'One Size',
      opening_color: 'Default',
      publish_to_store: false,
    });
    expect(saved.product.id).toBe(productId);
    expect(mocks.privilegedRpc).toHaveBeenCalledExactlyOnceWith('setup_product', {
      p_product: expect.objectContaining({ name: newProduct.name, price: newProduct.price }),
      p_size: 'One Size',
      p_color: 'Default',
      p_quantity: 3,
      p_publish: false,
      p_actor: ownerId,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalled();
    expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  });

  it('creates a unique SKU automatically when staff add a size and colour', async () => {
    await adminAction('saveVariant', {
      product_id: productId,
      sku: '',
      size: 'Large',
      color: 'Black',
      low_stock_threshold: 5,
    });
    const inserted = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.sku).toMatch(/^ASC-[A-F0-9]{32}$/);
    expect(inserted).toMatchObject({ product_id: productId, size: 'Large', color: 'Black' });
  });

  it('rejects malformed additional variant lines before creating a product', async () => {
    await expect(
      adminAction('saveProduct', {
        name: 'Training gloves',
        slug: 'training-gloves',
        description: '',
        price: 17000,
        opening_quantity: 3,
        opening_size: 'One Size',
        opening_color: 'Default',
        additional_variants: ['Large / Black / 2'],
      }),
    ).rejects.toMatchObject({
      message: 'Variant line 1 must use: Size | Colour | whole stock count.',
    });
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects an assistant attempting to change purchasing cost before any database mutation', async () => {
    mocks.staff.mockResolvedValueOnce({
      db,
      user: { id: ownerId },
      role: 'assistant',
      permissions: {},
    });
    await expect(adminAction('saveProduct', product)).rejects.toMatchObject({
      message: 'Only the owner may change purchasing costs.',
      status: 403,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('allows an assistant to edit permitted product details without a purchasing cost', async () => {
    mocks.staff.mockResolvedValueOnce({
      db,
      user: { id: ownerId },
      role: 'assistant',
      permissions: {},
    });
    const { cost_price: unusedCost, ...assistantProduct } = product;
    await expect(adminAction('saveProduct', assistantProduct)).resolves.toEqual(savedProduct);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('cost_price');
    expect(mocks.eq).toHaveBeenCalledTimes(2);
    expectNoPrivilegedWrite();
  });

  it('requires a signed-in staff account before constructing a privileged client or accessing products', async () => {
    mocks.staff.mockRejectedValueOnce(new AppError('Sign in first.', 401, 'unauthorized'));
    await expect(adminAction('saveProduct', product)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not create a replacement product when the existing product is absent or hidden by RLS', async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: null });
    await expect(adminAction('saveProduct', product)).rejects.toMatchObject({
      message: 'The record could not be saved.',
      status: 400,
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledTimes(2);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('preserves an RLS permission denial instead of retrying with service-role privileges', async () => {
    mocks.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table products', code: '42501' },
    });
    await expect(adminAction('saveProduct', product)).rejects.toMatchObject({
      message: 'You do not have permission to perform this action.',
      status: 403,
      code: 'forbidden',
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('continues to save content by its unique section when no record ID is supplied', async () => {
    const content = {
      section: 'home_hero',
      title: 'Train with purpose',
      body: 'Welcome to ASCEND.',
      published: true,
    };
    mocks.single.mockResolvedValueOnce({
      data: { id: productId, ...content, data: {} },
      error: null,
    });
    await adminAction('saveContent', content);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('site_content');
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(
      { ...content, data: {} },
      { onConflict: 'section' },
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('updates only the selected existing size and colour option without resubmitting its ID as data', async () => {
    const variant = {
      id: variantId,
      product_id: productId,
      sku: 'ASC-GLOVES-BLACK-L',
      size: 'L',
      color: 'Black',
      low_stock_threshold: 3,
    };
    mocks.single.mockResolvedValueOnce({ data: variant, error: null });
    await expect(adminAction('saveVariant', variant)).resolves.toEqual(variant);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('product_variants');
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      product_id: productId,
      sku: variant.sku,
      size: 'L',
      color: 'Black',
      low_stock_threshold: 3,
    });
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', variantId);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });
});
