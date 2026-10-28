# ASCEND backend API

All writes require a same-origin browser request and JSON, except product images which use multipart FormData. JSON routes return `{ok:true,data:...}` or `{ok:false,error,code?}`. Read responses use Cache-Control no-store. Missing Supabase configuration, unapplied RPC migrations, or disabled email sending fail closed with readable errors. Money is NGN naira, not kobo.

## Public and account workflows

- POST /api/checkout: customer {name,email,phone}, items [{variant_id,quantity}], fulfillment_method pickup|delivery, optional delivery_details {recipient_name,phone,state,city,area,address,landmark}. Server prices/stock/rates are authoritative. Returns {order,invoice,guest_token,notificationLinkSaved}; save the private token link. A configured server encryption secret lets the outbox retain an encrypted copy for the order email; a link-persistence failure does not undo a successful checkout. Website cannot supply a staff source or pay-later permission.
- GET /api/orders/[token]: private token only, never a sequential ID. Returns order,items,invoice,payments,bank_details. Delivery without a configured fee needs owner quote and customer approval; bank instructions are withheld until approval.
- POST /api/orders/[token]/delivery-approval: {}. Approves the final quoted delivery fee.
- POST /api/orders/[token]/evidence: amount,transfer_reference, optional bank_name,transferred_at (ISO with offset),proof_path. Evidence is a claim, not payment verification.
- POST /api/uploads: invoice_id, optional guest_token, mime image/jpeg|image/png|image/webp, size <=5242880. Requires secure guest token, linked authenticated client or staff. Returns path,token,signedUploadUrl. PUT file bytes to signedUploadUrl using the matching Content-Type; then submit proof_path. Private uploads are bound to invoice and verified by image signatures before evidence association.
- POST /api/auth: action signIn|signUp|signOut; email,password for sign-in, name and optional phone for signup. Optional next retains a local /account or /admin destination through sign-in, signup and the /auth/callback email confirmation callback. Unsafe external destinations resolve to /account. User metadata cannot grant staff access.
- GET /api/account: own linked customer, enrollments with invoices, payment history, bank_details.
- POST /api/account: {action:updateProfile,name,phone} or {action:linkGuest,guest_token}. Guest linking requires both the private order token and a verified matching account email. PATCH accepts full_name,phone.
- POST /api/coaching/enroll: package_id,name,phone, optional preferences {goal:strength|general_fitness|conditioning,schedule <=200 chars}. Existing profile contact can be reused. Returns requested enrollment and invoice; activation remains an owner action after verified credit.
- POST /api/coaching/[id]/evidence: evidence fields as above. Linked client only.
- POST /api/coaching/[id]/renew: {}. Creates a requested renewal and new invoice; linked client or staff.
- POST /api/newsletter: email, optional name, consent:true. Explicit consent is recorded; purchases never opt customers in.
- GET /api/newsletter/unsubscribe?token=...: signed preference confirmation page. POST same endpoint with token confirms opt-out; a GET alone does not unsubscribe.

## Staff workflows

GET /api/admin?section=overview|products|inventory|orders|customers|clients|packages|payments|finances|marketing|content|settings returns {records,summary,references,role,permissions,page,pageSize,totalRecords,totalPages,setupRequired,error?,reportingPeriod}. Primary records use database pagination and exact filtered counts. Query page (1-based), pageSize (1-100, default25), search (up to120 characters), filter, paymentFilter, stockFilter. Dashboard requests pageSize10; CSV export includes the current page. Status filters are section-specific, paymentFilter filters order invoices, and stockFilter accepts all|unconfirmed|low_stock|available. Search covers product name/slug/description; SKU/size/colour/product name; order reference/customer contact/source; customer contact; coaching package/mode/client contact; package name/description; transfer reference/bank; campaign name/subject; and CMS section/title/body. Migration14 adds the computed coaching/inventory search fields. Supporting selectors and linked-history panels remain capped at500 records (audit/movement lists100, expense/refund lists250). Financial reports and full settings are owner-only. Financial ranges: range=today|7days|month|custom, with from/to YYYY-MM-DD for custom. Figures include only actual verified credits and separately report refunds, expenses, balances and claims.

POST /api/admin with {action,...fields}, or POST /api/admin/actions/[action] with fields:

- saveProduct: id? plus name,slug,description,category_id?,price,cost_price?(owner),status,featured,size_guide?; optional image_urls must point to images uploaded for this product.
- saveVariant: id?,product_id,sku,size?,color?,low_stock_threshold. New variants have no invented stock.
- stockMovement: variant_id,kind opening|restock|adjustment|damaged|return|reconciliation,quantity,note,resellable. Opening/reconciliation are absolute counts. Returns require inspection and resellable=true. Restricted adjustments are enforced by SQL.
- createManualOrder: same checkout input plus source whatsapp|instagram|in_person|other. Email is optional for an offline sale; customer.customer_id may select an existing permanent customer record.
- setFulfillment: order_id,status,courier_name?,tracking_reference?.
- cancelOrder: order_id,reason.
- resolveOrderStock (owner): order_id,note. Explicitly checks available physical stock and resolves an expired-reservation payment conflict transactionally before fulfillment; insufficient stock stays flagged.
- quoteDelivery: order_id,fee.
- addOrderNote: order_id,note.
- recordPayment: invoice_id plus evidence fields.
- verifyPayment (owner): payment_id,amount_received,bank_credit_reference,note?. Actual bank-credit reference is unique; repeated verification never doubles receipts.
- rejectPayment (owner): payment_id,note.
- refundPayment (owner): payment_id,amount,reason,external_reference. Does not erase verified history or silently restore merchandise stock.
- authorizePayLater (owner): invoice_id,note.
- saveCustomer: id?,name,phone,email? (blank email becomes null). Name and formatted phone are validated; account-link and privilege fields are excluded. Offline contacts do not create auth accounts or automatically subscribe to marketing.
- savePackage (owner or assistant with manage_packages=true): id?,name,mode,description,price,billing_model,duration_months,duration_days?,session_count?,features[],active.
- enrollClient: package_id,customer_id.
- activateEnrollment (owner): enrollment_id,start_date. Monthly expiry clamps the confirmed start day to the next calendar month.
- extendEnrollment/renewEnrollment: enrollment_id. Creates a new requested renewal invoice.
- useSession: enrollment_id,session_date,note?.
- addClientNote: enrollment_id,note. Administrative notes are staff-only, immutable and audited.
- saveExpense (owner): category,description,amount,spent_on.
- saveCategory: id?,name,slug,sort_order,active.
- saveCollection: id?,name,slug,description,banner_path?,status,launch_at?,product_ids[].
- saveContent: id?,section,title,body,image_path?,data{},published.
- saveDeliveryRate (owner or assistant with manage_delivery_rates=true): id?,state,city?,area?,fee,active.
- saveSettings (owner): changes object or flat business_settings safe fields. Bank/account changes have an audit record.
- setStaffRole (owner): user_id,role owner|assistant,permissions {manage_packages?:boolean,manage_delivery_rates?:boolean}. Delegated permissions grant only those bounded operational writes; bank settings, payments, refunds, activation and staff roles remain owner authority.
- revokeStaffAccess (owner): user_id,note. Removes the current staff assignment and records the reason; keeps identities, customer and financial history. SQL prevents removing the last owner.
- addSubscriber: email,name?,consent:true,source. A staff-added subscriber requires actual opt-in consent.
- saveCampaign: id?,name,subject,body_html,subscriber_ids[]. Empty or omitted recipient list selects all currently subscribed contacts. Edits and recipient changes are allowed only in draft.
- approveCampaign (owner): campaign_id.
- sendCampaign (owner): campaign_id. Requires approval and configured/tested email provider; batches 30 recipients with persistent send records, idempotency and retry claims. Sending again processes the next batch. Unsubscribed contacts are skipped immediately.

POST /api/admin/upload: multipart file + product_id. JPEG/PNG/WebP only, max5MB; saves product image association. deleteProductImage {image_id} removes the catalog association with audit and retains its storage object. GET /api/admin/evidence/[id] returns a signed proof URL valid120 seconds.

## Scheduled jobs and email activation

GET /api/cron requires Authorization: Bearer CRON_SECRET (secret >=24 chars). It expires reservations and enrollments, processes a durable transactional outbox for order_created, enrollment_requested, payment_verified and enrollment_activated, and handles renewal reminders. Transactional events are enqueued within their database transactions. Reminder enqueue/sending respects reminders_enabled; transactional sending runs independently when email delivery is configured. Each invocation processes up to40 due notification records, with persisted claims, provider message IDs and errors. Missing-email records are excluded; attempted records older than23 hours require provider reconciliation and do not block later queue entries.

Required for email activation: RESEND_API_KEY, RESEND_FROM_EMAIL (verified sender), NEXT_PUBLIC_SITE_URL, EMAIL_ENABLED=true, EMAIL_PROVIDER_TESTED=true, NOTIFICATION_LINK_SECRET >=32 characters. Migration14 supplies first_attempt_at for notifications and campaign recipients and must be applied before email activation. Marketing also requires NEWSLETTER_TOKEN_SECRET >=32 characters. Configure the real Resend sender, test a controlled transactional email, then explicitly set the tested flag. No actual messages were sent during development.

Delivery attempts use durable DB claims plus provider idempotency keys. An attempted record older than23 hours is retained for manual provider reconciliation instead of risking another send beyond the provider's idempotency window. Provider acceptance is tracked separately from end-recipient delivery. No automatic WhatsApp sending exists.

## Server boundaries

Service-role secrets appear only in server modules. Staff mutations obtain the authenticated identity through Supabase getUser; financial/inventory RPCs independently verify actor roles in PostgreSQL. RLS restricts clients to their linked customer records. Public catalog/CMS/settings reads use an anonymous client so signed-in staff still receive public visibility rules. The public_catalog view excludes costs and unconfirmed variants. The Next.js 16 proxy verifies claims and propagates refreshed tokens to both request and response cookies; protected routes independently obtain the current user and staff assignment. Public bank details are not read from public settings. Rate limits persist in PostgreSQL; they never fall back to a process-local counter.

