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
});

describe('admin product publishing under staff database permissions', () => {
  it('publishes an existing owner product with purchasing cost through its authenticated update', async () => {
    const saved = await adminAction('saveProduct', product);
    expect(saved).toEqual(savedProduct);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('products');
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
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', productId);
    // Cost is owner-writeable but deliberately excluded from authenticated SELECT grants.
    const projection = mocks.select.mock.calls[0][0] as string;
    expect(projection.split(',')).toContain('status');
    expect(projection.split(',')).not.toContain('cost_price');
    expect(projection).not.toContain('*');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
  });

  it('creates a new product with INSERT and keeps its purchasing cost out of returned fields', async () => {
    const { id: unusedId, ...newProduct } = product;
    const saved = await adminAction('saveProduct', newProduct);
    expect(saved.id).toBe(productId);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(newProduct);
    expect(mocks.select.mock.calls[0][0]).not.toMatch(/cost_price|\*/);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalled();
    expectNoPrivilegedWrite();
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
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', productId);
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
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', productId);
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
