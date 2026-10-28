# Checkout and WhatsApp invoices

Checkout offers two selectable fulfillment cards: Pickup and Nationwide delivery. The customer explicitly chooses one. Switching between them keeps an entered delivery address. Inactive delivery fields are hidden and disabled so their required inputs do not block a pickup submission.

## Pickup setup

The business must save an actual pickup location in Admin > Settings > Edit business settings. If none is saved, customers may select Pickup to see why it is not ready, but cannot create a pickup order yet. The checkout shows an Arrange pickup on WhatsApp link and offers delivery as an alternative. The server's existing pickup-location guard is preserved; no address has been invented.

## After an order is saved

1. The server creates the pending order, invoice and stock reservation using authoritative prices.
2. Checkout clears the bag and opens the secure order page with a one-time WhatsApp handoff marker.
3. The secure page loads the saved order, invoice and line items. Its invoice message uses these database snapshots, rather than the old bag prices.
4. The marker is removed before opening WhatsApp, so browser Back returns to the order without repeating the handoff.
5. WhatsApp opens for the configured business number (ASCEND fallback: +234 913 060 7719) with the order number, invoice ID, customer details, item totals, fulfillment details, subtotal and complete invoice link.
6. The customer reviews the text and presses Send in WhatsApp. The website prepares the message; it does not automatically send a chat message.

The order page keeps Send invoice on WhatsApp and Copy secure order link controls in case the handoff is blocked or the customer wants to return later. Large carts include a bounded item summary plus the full private invoice link. An unknown delivery fee or unapproved quote is explicitly marked pending; it is not represented as a zero fee or paid invoice.

The complete order link is private and is intended only for the customer and ASCEND. A localhost link opens only on the computer serving that local address. Use the deployed HTTPS site for links that customers/admin can open on other devices. The invoice text itself still includes the saved order details during local tests.

## Verification

The checkout and handoff regression suites use mocked API responses and a DOM test environment. They check selectable fulfillment, preserved delivery input, missing pickup setup, failed submissions, once-only order creation, saved invoice amounts, unknown delivery fees, a single automatic navigation and fallback controls. They do not create customer records, reserve real stock, verify payments or send WhatsApp messages.

Run npm test and npm run typecheck. For an actual end-to-end check, use a separate test database or an intentional business order and verify the saved order in Admin > Orders before pressing Send in WhatsApp.
