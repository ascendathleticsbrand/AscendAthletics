// Declarative admin screen definitions: labels, fields, table columns and available actions.
// Server validation and permissions remain authoritative; these definitions build the interface.
export type AdminRecord = Record<string, unknown>;
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  help?: string;
  options?: string[];
  reference?: string;
  min?: number;
  step?: string;
  placeholder?: string;
  default?: string | number | boolean;
  full?: boolean;
};
export type Action = {
  key: string;
  label: string;
  description: string;
  fields: Field[];
  owner?: boolean;
  permission?: 'manage_packages' | 'manage_delivery_rates';
  confirm?: string;
  recordKey?: string;
  special?: 'order' | 'upload' | 'preview';
};
export type Section = {
  title: string;
  eyebrow: string;
  description: string;
  singular: string;
  columns: { key: string; label: string; type?: string }[];
  actions: string[];
  rowActions: string[];
  filter?: string;
};
// Field helpers keep repeated input rules and presentation settings in one place.
const f = (
  key: string,
  label: string,
  type = 'text',
  required = false,
  extra: Partial<Field> = {},
): Field => ({ key, label, type, required, ...extra });
const ref = (key: string, label: string, reference: string, required = true): Field =>
  f(key, label, 'reference', required, { reference });
const money = (key: string, label: string, required = true): Field =>
  f(key, label, 'number', required, {
    min: key === 'fee' || key === 'cost_price' ? 0 : 0.01,
    step: '0.01',
  });
const choice = (key: string, label: string, options: string[], required = true): Field =>
  f(key, label, 'select', required, { options });
const date = (key: string, label: string, required = true): Field =>
  f(key, label, 'date', required);
// Action keys are sent to /api/admin and matched by backend/admin-actions.ts.
// A row action can prefill an existing record; a top-level action starts a new form.
export const actions: Record<string, Action> = {
  saveProduct: {
    key: 'saveProduct',
    label: 'Add product',
    description:
      'Create a draft, add real product photographs, then count every SKU before publishing.',
    fields: [
      f('name', 'Product name', 'text', true),
      f('slug', 'Shop URL slug', 'text', true, { help: 'Lowercase letters, numbers and hyphens.' }),
      ref('category_id', 'Category', 'categories', false),
      money('price', 'Selling price (NGN)'),
      money('cost_price', 'Unit cost (NGN)', false),
      choice('status', 'Product visibility', ['draft', 'coming_soon', 'active', 'unavailable']),
      f('description', 'Description', 'textarea', true, { full: true }),
      f('size_guide', 'Size guide', 'textarea', false, { full: true }),
      f('featured', 'Feature on homepage', 'checkbox'),
    ],
  },
  uploadProductImage: {
    key: 'uploadProductImage',
    label: 'Upload photograph',
    description:
      'Upload an official product photograph to the catalog. Keep the image accurate and add descriptive alternative text.',
    recordKey: 'product_id',
    special: 'upload',
    fields: [
      ref('product_id', 'Product', 'products'),
      f('file', 'Product image', 'file', true),
      f('alt', 'Image description', 'text', true),
      f('sort_order', 'Display order', 'number', false, { min: 0, default: 0 }),
    ],
  },
  deleteProductImage: {
    key: 'deleteProductImage',
    label: 'Remove photograph',
    description:
      'Remove this photograph from the public product gallery. Use only approved official imagery in the catalog.',
    recordKey: 'image_id',
    fields: [ref('image_id', 'Product photograph', 'images')],
    confirm: 'Remove this selected photograph from the product gallery.',
  },
  saveVariant: {
    key: 'saveVariant',
    label: 'Add size / colour',
    description:
      'Each physical size and colour combination needs a unique SKU. Stock remains unconfirmed until a physical opening count is recorded.',
    fields: [
      ref('product_id', 'Product', 'products'),
      f('sku', 'Unique SKU', 'text', true),
      f('size', 'Size', 'text', true),
      f('color', 'Colour', 'text', true),
      f('low_stock_threshold', 'Low-stock alert threshold', 'number', true, { min: 0, default: 5 }),
    ],
  },
  // Inventory operations record a counted total or a movement, depending on the selected kind.
  stockMovement: {
    key: 'stockMovement',
    label: 'Record stock',
    description:
      'Opening stock and reconciliation use the total physically counted units. Restocks, adjustments, damage and resellable returns use the quantity changed. Every change is recorded in the stock audit trail.',
    recordKey: 'variant_id',
    fields: [
      ref('variant_id', 'SKU / variant', 'variants'),
      choice('kind', 'Movement type', [
        'opening',
        'restock',
        'adjustment',
        'damaged',
        'reconciliation',
        'return',
      ]),
      f('quantity', 'Count or quantity changed', 'number', true, {
        step: '1',
        help: 'Use a negative quantity only for an authorized negative adjustment.',
      }),
      f('note', 'Reason / count notes', 'textarea', true, { full: true }),
      f('resellable', 'Returned item inspected and confirmed resellable', 'checkbox'),
    ],
    confirm:
      'I have physically checked this quantity and understand that this stock movement is permanently recorded.',
  },
  // Manual sales follow the same server stock and invoice rules as storefront checkout.
  createManualOrder: {
    key: 'createManualOrder',
    label: 'Record manual order',
    description:
      'Record an existing WhatsApp, Instagram or in-person sale. Prices and available stock are checked by the server. A recorded order does not verify payment.',
    special: 'order',
    fields: [
      ref('customer_id', 'Existing customer (optional)', 'customers', false),
      f('name', 'Customer name', 'text', true),
      f('phone', 'Phone number', 'tel', true),
      f('email', 'Email address (optional)', 'email', false),
      choice('source', 'Order source', ['whatsapp', 'instagram', 'in_person', 'other']),
      choice('fulfillment_method', 'Fulfillment method', ['pickup', 'delivery']),
      f('recipient_name', 'Delivery recipient'),
      f('state', 'State'),
      f('city', 'City'),
      f('area', 'Delivery area'),
      f('address', 'Full delivery address', 'textarea', false, { full: true }),
      f('landmark', 'Landmark (optional)'),
    ],
  },
  setFulfillment: {
    key: 'setFulfillment',
    label: 'Update fulfillment',
    description:
      'Full verified payment and accepted delivery fees are required before fulfillment, unless the owner has explicitly authorized a pay-later exception.',
    recordKey: 'order_id',
    fields: [
      ref('order_id', 'Order', 'orders'),
      choice('status', 'Fulfillment status', [
        'processing',
        'ready_for_pickup',
        'shipped',
        'delivered',
        'picked_up',
      ]),
      f('courier_name', 'Courier (delivery only)'),
      f('tracking_reference', 'Tracking reference'),
    ],
  },
  quoteDelivery: {
    key: 'quoteDelivery',
    label: 'Quote delivery fee',
    description:
      'The customer must approve the final delivery fee before making payment. An unapproved quote does not become a payable total.',
    recordKey: 'order_id',
    fields: [ref('order_id', 'Order', 'orders'), money('fee', 'Delivery fee (NGN)')],
  },
  addOrderNote: {
    key: 'addOrderNote',
    label: 'Add order note',
    description:
      'Add an internal operational note. These notes are visible to authorized staff only.',
    recordKey: 'order_id',
    fields: [
      ref('order_id', 'Order', 'orders'),
      f('note', 'Staff note', 'textarea', true, { full: true }),
    ],
  },
  resolveOrderStock: {
    key: 'resolveOrderStock',
    label: 'Resolve stock availability',
    description:
      'First check or restock actual physical inventory, or release a conflicting reservation through cancellation. The server then reacquires and consumes the required stock atomically. This cannot oversell or count the sale twice.',
    owner: true,
    recordKey: 'order_id',
    fields: [
      ref('order_id', 'Paid order requiring stock resolution', 'orders'),
      f('note', 'Resolution notes', 'textarea', true, { full: true }),
    ],
    confirm:
      'I have checked or restocked actual inventory and authorize these items for fulfillment.',
  },
  cancelOrder: {
    key: 'cancelOrder',
    label: 'Cancel order',
    description:
      'Cancellation releases active reservations. Existing verified financial records are retained; refunds must be recorded separately.',
    recordKey: 'order_id',
    fields: [
      ref('order_id', 'Order', 'orders'),
      f('reason', 'Cancellation reason', 'textarea', true, { full: true }),
    ],
    confirm: 'Cancel this order and release its remaining active stock reservations.',
  },
  authorizePayLater: {
    key: 'authorizePayLater',
    label: 'Authorize pay later',
    description:
      'Owner approval grants an explicit exception to the full-payment rule. The outstanding amount remains visible and this decision is audited.',
    owner: true,
    recordKey: 'invoice_id',
    fields: [
      ref('invoice_id', 'Invoice', 'invoices'),
      f('note', 'Approval reason', 'textarea', true, { full: true }),
    ],
    confirm:
      'I authorize fulfillment or coaching activation with an outstanding balance on this invoice.',
  },
  recordPayment: {
    key: 'recordPayment',
    label: 'Record transfer claim',
    description:
      'Record a transfer reference or receipt as evidence. This remains unverified until the owner confirms an actual bank credit.',
    fields: [
      ref('invoice_id', 'Invoice', 'invoices'),
      money('amount', 'Claimed transfer amount (NGN)'),
      f('transfer_reference', 'Customer transfer reference', 'text', true),
      f('bank_name', 'Sending bank (optional)'),
      f('transferred_at', 'Transfer date and time', 'datetime-local', true),
    ],
  },
  verifyPayment: {
    key: 'verifyPayment',
    label: 'Verify bank credit',
    description:
      'Check the actual bank account first. Only the amount received counts as collected revenue. Repeated bank-credit references are rejected.',
    owner: true,
    recordKey: 'payment_id',
    fields: [
      ref('payment_id', 'Transfer claim', 'payments'),
      money('amount_received', 'Actual bank credit received (NGN)'),
      f('bank_credit_reference', 'Unique bank credit reference', 'text', true),
      f('note', 'Verification notes', 'textarea', false, { full: true }),
    ],
    confirm:
      'I have confirmed this credit in the business bank account. A receipt or customer reference alone is not confirmation.',
  },
  rejectPayment: {
    key: 'rejectPayment',
    label: 'Reject transfer claim',
    description:
      'Explain why the claim could not be verified. The original submission remains in the transaction history.',
    owner: true,
    recordKey: 'payment_id',
    fields: [
      ref('payment_id', 'Transfer claim', 'payments'),
      f('note', 'Reason for rejection', 'textarea', true, { full: true }),
    ],
    confirm: 'Reject this unverified transfer claim.',
  },
  refundPayment: {
    key: 'refundPayment',
    label: 'Record refund',
    description:
      'Record a refund already paid to the customer. This app does not send money. Verified payments and refund history are retained.',
    owner: true,
    recordKey: 'payment_id',
    fields: [
      ref('payment_id', 'Verified payment', 'payments'),
      money('amount', 'Refund paid (NGN)'),
      f('external_reference', 'Actual refund bank reference', 'text', true),
      f('reason', 'Refund reason', 'textarea', true, { full: true }),
    ],
    confirm: 'I have completed this refund outside the platform and checked its bank reference.',
  },
  saveCustomer: {
    key: 'saveCustomer',
    label: 'Add customer',
    description:
      'Create a customer record for an offline client or existing buyer. Collect only the contact details needed to manage their orders and training.',
    fields: [
      f('name', 'Full name', 'text', true),
      f('email', 'Email (optional for offline records)', 'email', false),
      f('phone', 'Phone', 'tel', true),
    ],
  },
  enrollClient: {
    key: 'enrollClient',
    label: 'Assign training package',
    recordKey: 'customer_id',
    description:
      'Create a pending enrollment and invoice. Training begins only after verified payment and owner activation.',
    fields: [
      ref('customer_id', 'Client', 'customers'),
      ref('package_id', 'Training package', 'packages'),
    ],
  },
  activateEnrollment: {
    key: 'activateEnrollment',
    label: 'Activate training',
    description:
      "Confirm the actual start date. Expiry is calculated using the enrollment's calendar-month or fixed-duration terms. Full verified payment is required unless the owner approves an exception.",
    owner: true,
    recordKey: 'enrollment_id',
    fields: [
      ref('enrollment_id', 'Enrollment', 'enrollments'),
      date('start_date', 'Confirmed start date'),
    ],
    confirm: 'I confirm this client is ready to start and have reviewed the payment status.',
  },
  extendEnrollment: {
    key: 'extendEnrollment',
    label: 'Renew training',
    description:
      'Create a new enrollment and renewal invoice using this package. The renewal requires payment verification and a confirmed start date before activation.',
    recordKey: 'enrollment_id',
    fields: [ref('enrollment_id', 'Enrollment to renew', 'enrollments')],
    confirm: 'Create a new pending enrollment and invoice for this renewal.',
  },
  useSession: {
    key: 'useSession',
    label: 'Record completed session',
    description:
      'Record one completed session against a paid active session package. The session history cannot be erased.',
    recordKey: 'enrollment_id',
    fields: [
      ref('enrollment_id', 'Active enrollment', 'enrollments'),
      date('session_date', 'Session date'),
      f('note', 'Session administrative note', 'textarea', false, { full: true }),
    ],
  },
  addClientNote: {
    key: 'addClientNote',
    label: 'Add client note',
    description:
      'Record a basic administrative note for this enrollment. Avoid unnecessary health or other sensitive information.',
    recordKey: 'enrollment_id',
    fields: [
      ref('enrollment_id', 'Enrollment', 'enrollments'),
      f('note', 'Administrative note', 'textarea', true, { full: true }),
    ],
  },
  savePackage: {
    key: 'savePackage',
    label: 'Add training package',
    description:
      'Define real package terms and prices. Monthly renewal is the default; session bundles and fixed-duration programs use their own duration rules.',
    owner: true,
    permission: 'manage_packages',
    fields: [
      f('name', 'Package name', 'text', true),
      choice('mode', 'Training mode', ['physical', 'online']),
      money('price', 'Package price (NGN)'),
      choice('billing_model', 'Billing model', [
        'monthly',
        'per_session',
        'session_bundle',
        'fixed_duration',
      ]),
      f('duration_months', 'Calendar months', 'number', false, { min: 1, default: 1 }),
      f('duration_days', 'Fixed program duration (days)', 'number', false, { min: 1 }),
      f('session_count', 'Included sessions', 'number', false, { min: 1 }),
      f('description', 'Description', 'textarea', true, { full: true }),
      f('features', 'Benefits / features', 'lines', false, {
        full: true,
        help: 'One feature per line.',
      }),
      f('active', 'Available for enrollment', 'checkbox', false, { default: true }),
    ],
  },
  saveExpense: {
    key: 'saveExpense',
    label: 'Record expense',
    description:
      'Record an actual business expense. Expenses are reported separately from collected receipts and revenue.',
    owner: true,
    fields: [
      choice('category', 'Category', [
        'merchandise',
        'packaging',
        'delivery',
        'marketing',
        'other',
      ]),
      money('amount', 'Amount spent (NGN)'),
      date('spent_on', 'Expense date'),
      f('description', 'Expense details', 'textarea', true, { full: true }),
    ],
  },
  saveCategory: {
    key: 'saveCategory',
    label: 'Add category',
    description: 'Organize merchandise into a clear category in the public shop.',
    fields: [
      f('name', 'Category name', 'text', true),
      f('slug', 'Category slug', 'text', true),
      f('sort_order', 'Display order', 'number', false, { min: 0, default: 0 }),
      f('active', 'Visible category', 'checkbox', false, { default: true }),
    ],
  },
  saveCollection: {
    key: 'saveCollection',
    label: 'Create collection',
    description:
      'Prepare an upcoming drop or publish a real collection. Scheduled launch dates are enforced on the public site.',
    fields: [
      f('name', 'Collection name', 'text', true),
      f('slug', 'Shareable URL slug', 'text', true),
      f('description', 'Description', 'textarea', false, { full: true }),
      choice('status', 'Visibility', ['draft', 'upcoming', 'published']),
      f('launch_at', 'Launch date and time', 'datetime-local'),
      f('banner_path', 'Banner image URL'),
      f('product_ids', 'Collection products', 'multi-reference', false, {
        reference: 'products',
        full: true,
      }),
    ],
  },
  saveContent: {
    key: 'saveContent',
    label: 'Edit website content',
    description:
      "Update approved business content while preserving the website's brand and layout. Publish testimonials only with the customer's approval.",
    fields: [
      choice('section', 'Website section', [
        'hero',
        'coach',
        'coaching',
        'contact',
        'faq',
        'testimonials',
        'promotion',
      ]),
      f('title', 'Title', 'text', true),
      f('body', 'Content', 'textarea', false, { full: true }),
      f('image_path', 'Owned image URL'),
      f('data', 'Additional content (JSON)', 'json', false, {
        full: true,
        help: 'Optional structured FAQ, testimonial or link data. Valid JSON only.',
      }),
      f('published', 'Publish to website', 'checkbox'),
    ],
  },
  addSubscriber: {
    key: 'addSubscriber',
    label: 'Add consenting subscriber',
    description:
      'Only add a person who has explicitly agreed to marketing. An order or coaching registration does not provide newsletter consent.',
    fields: [
      f('email', 'Email address', 'email', true),
      f('name', 'Subscriber name'),
      f('source', 'Where consent was obtained', 'text', true, {
        placeholder: 'e.g. signed signup form',
      }),
      f('consent', 'This person explicitly opted in to marketing email', 'checkbox', true),
    ],
    confirm: "I have a valid record of this subscriber's explicit marketing consent.",
  },
  // Marketing configuration is separate from customer records and transactional notifications.
  saveCampaign: {
    key: 'saveCampaign',
    label: 'Draft campaign',
    description:
      'Prepare an email for opted-in subscribers. Owner approval and a configured, verified sending provider are required before sending.',
    fields: [
      f('name', 'Internal campaign name', 'text', true),
      f('subject', 'Email subject', 'text', true),
      f('body_html', 'Email content (HTML)', 'textarea', true, {
        full: true,
        help: 'Keep content accessible. The service adds secure unsubscribe links.',
      }),
      f(
        'subscriber_ids',
        'Recipients (leave blank for all subscribed contacts)',
        'multi-reference',
        false,
        { reference: 'subscribers', full: true },
      ),
    ],
  },
  previewCampaign: {
    key: 'previewCampaign',
    label: 'Preview email',
    description: 'Review the subject and email content before requesting owner approval.',
    special: 'preview',
    fields: [],
  },
  approveCampaign: {
    key: 'approveCampaign',
    label: 'Approve campaign',
    description:
      'Review recipients, consent and the preview before approving this campaign. Approval is recorded in the audit history.',
    owner: true,
    recordKey: 'campaign_id',
    fields: [ref('campaign_id', 'Campaign', 'campaigns')],
    confirm: 'I have reviewed and approved the subject, content and consenting recipient list.',
  },
  sendCampaign: {
    key: 'sendCampaign',
    label: 'Send approved campaign',
    description:
      'Send only to selected contacts who are currently subscribed. Provider setup and sender verification are checked before sending.',
    owner: true,
    recordKey: 'campaign_id',
    fields: [ref('campaign_id', 'Approved campaign', 'campaigns')],
    confirm: 'Send this approved campaign to its consenting recipients now.',
  },
  // These settings control real business details; sensitive approvals remain owner actions.
  saveSettings: {
    key: 'saveSettings',
    label: 'Edit business settings',
    description:
      'Configure verified bank, contact and pickup details. Do not enter a placeholder bank account or physical location. Changes are audited.',
    owner: true,
    fields: [
      f('bank_name', 'Bank name'),
      f('bank_account_number', 'Bank account number'),
      f('bank_account_holder', 'Account holder'),
      f('payment_instructions', 'Bank transfer instructions', 'textarea', false, { full: true }),
      f('pickup_location', 'Actual pickup location', 'textarea', false, { full: true }),
      f('pickup_contact', 'Pickup contact number', 'tel'),
      f('pickup_hours', 'Pickup hours'),
      f('pickup_instructions', 'Collection instructions', 'textarea', false, { full: true }),
      f('contact_email', 'Business contact email', 'email'),
      f('whatsapp_number', 'WhatsApp number (international format)', 'tel'),
      f('instagram_url', 'Instagram URL', 'url'),
      f('timezone', 'Reporting timezone', 'text', true, { default: 'Africa/Lagos' }),
      f('reservation_minutes', 'Stock reservation duration (minutes)', 'number', true, {
        min: 15,
        default: 60,
      }),
      f('reminders_enabled', 'Enable coaching expiry reminders', 'checkbox'),
      f('reminder_days', 'Reminder days before expiry (JSON array)', 'json', true, {
        default: '[7,2,0]',
        help: 'Email delivery also needs a verified sender and scheduled-job credentials.',
      }),
    ],
  },
  saveDeliveryRate: {
    key: 'saveDeliveryRate',
    label: 'Add delivery rate',
    description:
      'Use a confirmed delivery fee for a supported location. Locations without a configured fee require a quote and customer approval.',
    owner: true,
    permission: 'manage_delivery_rates',
    fields: [
      f('state', 'State', 'text', true),
      f('city', 'City (optional)'),
      f('area', 'Area (optional)'),
      money('fee', 'Delivery fee (NGN)'),
      f('active', 'Rate enabled', 'checkbox', false, { default: true }),
    ],
  },
  revokeStaffAccess: {
    key: 'revokeStaffAccess',
    label: 'Revoke staff access',
    description:
      "Remove this user's owner or assistant role and operational permissions. Their customer account and audit history remain available. The final owner cannot be removed.",
    owner: true,
    recordKey: 'user_id',
    fields: [
      ref('user_id', 'Staff member', 'profiles'),
      f('note', 'Reason for revoking access', 'textarea', true, { full: true }),
    ],
    confirm: "I authorize removal of this user's staff access.",
  },
  setStaffRole: {
    key: 'setStaffRole',
    label: 'Manage staff access',
    description:
      'Assign access only to an existing verified user. Assistants cannot grant roles or change their own permissions.',
    owner: true,
    fields: [
      ref('user_id', 'Existing user', 'profiles'),
      choice('role', 'Staff role', ['assistant', 'owner']),
      f('permission_manage_packages', 'May manage training packages', 'checkbox', false, {
        help: 'Allows this assistant to create and edit packages.',
      }),
      f('permission_manage_delivery_rates', 'May manage delivery rates', 'checkbox', false, {
        help: 'Allows this assistant to create and edit location fees.',
      }),
    ],
    confirm: "I have checked this person's identity and authorize their access to business data.",
  },
};
// Each route selects one definition for its heading, table and permitted action buttons.
export const sections: Record<string, Section> = {
  overview: {
    title: 'Your business, in focus.',
    eyebrow: 'BUSINESS OVERVIEW',
    description: 'A clear view of merchandise, coaching and the work that needs your attention.',
    singular: 'record',
    columns: [
      { key: 'order_number', label: 'Order', type: 'order' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'payment_status', label: 'Payment', type: 'status' },
      { key: 'total_amount', label: 'Total', type: 'money' },
    ],
    actions: ['createManualOrder'],
    rowActions: [],
  },
  products: {
    title: 'Built to move.',
    eyebrow: 'MERCHANDISE',
    description: 'Manage your catalog, official product images and the details customers see.',
    singular: 'product',
    columns: [
      { key: 'name', label: 'Product', type: 'product' },
      { key: 'category', label: 'Category' },
      { key: 'price', label: 'Price', type: 'money' },
      { key: 'status', label: 'Visibility', type: 'status' },
    ],
    actions: ['saveProduct', 'saveCategory', 'saveVariant'],
    rowActions: ['saveProduct', 'saveVariant', 'uploadProductImage'],
    filter: 'status',
  },
  inventory: {
    title: 'Every unit accounted for.',
    eyebrow: 'INVENTORY CONTROL',
    description:
      'Count physical stock, manage reservations and maintain a permanent movement history.',
    singular: 'SKU',
    columns: [
      { key: 'sku', label: 'SKU / variant', type: 'variant' },
      { key: 'stock_on_hand', label: 'Physical' },
      { key: 'stock_reserved', label: 'Reserved' },
      { key: 'stock_available', label: 'Available' },
      { key: 'stock_sold', label: 'Sold' },
      { key: 'stock_confirmed_at', label: 'Opening count', type: 'confirmed' },
    ],
    actions: ['stockMovement', 'saveVariant'],
    rowActions: ['stockMovement', 'saveVariant'],
  },
  orders: {
    title: 'From order to handover.',
    eyebrow: 'ORDER MANAGEMENT',
    description:
      'Website and manual sales in one place. Keep payment and fulfillment status separate.',
    singular: 'order',
    columns: [
      { key: 'order_number', label: 'Order', type: 'order' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'total_amount', label: 'Total', type: 'money' },
      { key: 'payment_status', label: 'Payment', type: 'status' },
      { key: 'fulfillment_status', label: 'Fulfillment', type: 'status' },
      { key: 'source', label: 'Source', type: 'label' },
    ],
    actions: ['createManualOrder'],
    rowActions: [
      'setFulfillment',
      'resolveOrderStock',
      'quoteDelivery',
      'addOrderNote',
      'cancelOrder',
      'authorizePayLater',
    ],
    filter: 'fulfillment_status',
  },
  customers: {
    title: 'People behind the progress.',
    eyebrow: 'CUSTOMER RECORDS',
    description: 'One customer record links merchandise purchases and coaching enrollment history.',
    singular: 'customer',
    columns: [
      { key: 'name', label: 'Customer', type: 'person' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'created_at', label: 'Added', type: 'date' },
    ],
    actions: ['saveCustomer'],
    rowActions: ['saveCustomer', 'enrollClient'],
  },
  clients: {
    title: 'Support every next step.',
    eyebrow: 'COACHING CLIENTS',
    description:
      'Manage enrollment, verified payments, renewal dates and paid sessions without collecting unnecessary health data.',
    singular: 'enrollment',
    columns: [
      { key: 'customer', label: 'Client', type: 'person' },
      { key: 'package_name', label: 'Package' },
      { key: 'mode', label: 'Mode', type: 'label' },
      { key: 'status', label: 'Enrollment', type: 'status' },
      { key: 'expiry_date', label: 'Renewal', type: 'date' },
      { key: 'sessions_remaining', label: 'Sessions left' },
    ],
    actions: ['saveCustomer', 'enrollClient'],
    rowActions: [
      'activateEnrollment',
      'extendEnrollment',
      'useSession',
      'addClientNote',
      'authorizePayLater',
    ],
    filter: 'status',
  },
  packages: {
    title: 'A plan for every ambition.',
    eyebrow: 'TRAINING PACKAGES',
    description:
      'Configure physical and online training, calendar-month renewals and session-based packages.',
    singular: 'package',
    columns: [
      { key: 'name', label: 'Package' },
      { key: 'mode', label: 'Training mode', type: 'label' },
      { key: 'price', label: 'Price', type: 'money' },
      { key: 'billing_model', label: 'Billing model', type: 'label' },
      { key: 'active', label: 'Availability', type: 'active' },
    ],
    actions: ['savePackage'],
    rowActions: ['savePackage'],
    filter: 'mode',
  },
  payments: {
    title: 'Verify. Then confirm.',
    eyebrow: 'MANUAL BANK TRANSFERS',
    description:
      'Receipts and transfer references are claims. Verify actual bank credits before confirming any payment.',
    singular: 'transfer',
    columns: [
      { key: 'transfer_reference', label: 'Transfer reference' },
      { key: 'submitted_amount', label: 'Claimed', type: 'money' },
      { key: 'amount_received', label: 'Verified received', type: 'money' },
      { key: 'status', label: 'Verification', type: 'status' },
      { key: 'created_at', label: 'Submitted', type: 'date' },
    ],
    actions: ['recordPayment'],
    rowActions: ['verifyPayment', 'rejectPayment', 'refundPayment'],
    filter: 'status',
  },
  finances: {
    title: 'Know what is collected.',
    eyebrow: 'FINANCIAL REPORTING',
    description:
      'Verified receipts, outstanding invoices, refunds and expenses shown separately. Revenue is not net profit.',
    singular: 'transaction',
    columns: [
      { key: 'transfer_reference', label: 'Transfer reference' },
      { key: 'submitted_amount', label: 'Claimed', type: 'money' },
      { key: 'amount_received', label: 'Verified received', type: 'money' },
      { key: 'status', label: 'Verification', type: 'status' },
      { key: 'created_at', label: 'Submitted', type: 'date' },
    ],
    actions: ['saveExpense'],
    rowActions: [],
  },
  marketing: {
    title: 'Make your next move known.',
    eyebrow: 'MARKETING & PRODUCT DROPS',
    description:
      'Prepare campaigns and collections. Send email only with valid consent and owner approval.',
    singular: 'campaign',
    columns: [
      { key: 'name', label: 'Campaign' },
      { key: 'subject', label: 'Subject' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'created_at', label: 'Created', type: 'date' },
    ],
    actions: ['saveCampaign', 'addSubscriber', 'saveCollection'],
    rowActions: ['saveCampaign', 'previewCampaign', 'approveCampaign', 'sendCampaign'],
    filter: 'status',
  },
  content: {
    title: 'Keep the brand moving.',
    eyebrow: 'WEBSITE CONTENT',
    description:
      'Publish real business content, approved testimonials, categories and upcoming collections.',
    singular: 'content section',
    columns: [
      { key: 'section', label: 'Website section', type: 'label' },
      { key: 'title', label: 'Title' },
      { key: 'published', label: 'Visibility', type: 'active' },
      { key: 'updated_at', label: 'Updated', type: 'date' },
    ],
    actions: ['saveContent', 'saveCollection', 'saveCategory'],
    rowActions: ['saveContent'],
  },
  settings: {
    title: 'Set up for the real world.',
    eyebrow: 'WORKSPACE SETTINGS',
    description:
      'Manage bank instructions, pickup details, delivery fees, reminders and staff access with an audit trail.',
    singular: 'setting',
    columns: [
      { key: 'bank_name', label: 'Bank name' },
      { key: 'bank_account_holder', label: 'Account holder' },
      { key: 'pickup_location', label: 'Pickup location' },
      { key: 'timezone', label: 'Reporting timezone' },
    ],
    actions: ['saveSettings', 'saveDeliveryRate', 'setStaffRole'],
    rowActions: [],
  },
};
