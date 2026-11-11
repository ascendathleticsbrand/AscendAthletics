# Paystack test setup

ASCEND now offers hosted Paystack checkout on merchandise order pages when a valid server key is configured. Bank transfer remains available. Online coaching invoices continue to use the existing bank-transfer flow.

## 1. Add test credentials locally

In the Paystack Dashboard, turn on **Test Mode** and open **Settings → Developers / API Configuration**. Copy the test secret key (`sk_test_…`). If Paystack also gives you a webhook signing secret (`whsec_…`), copy it too. Keep both private; never paste them into chat or commit them to GitHub. The webhook signing secret is optional for this setup while the test API secret key is active.

Add them to the ignored `.env.local` file in the project root:

```dotenv
PAYSTACK_SECRET_KEY=sk_test_your_test_secret_key
# Optional when Paystack provides a separate webhook signing secret.
PAYSTACK_WEBHOOK_SECRET=whsec_your_test_webhook_signing_secret
```

Restart the local Next.js server after editing environment variables. The integration uses hosted checkout, so it does not need the public key in the browser.

## 2. Configure a Vercel Preview deployment

In Vercel, open **Project → Settings → Environment Variables**. Add both variables above to the **Preview** environment only. Do not add test keys to Production. Redeploy a Preview deployment so it receives the new values.

## 3. Configure the Paystack test webhook

In Paystack Test Mode, add this webhook URL, replacing the host with the exact deployed Vercel Preview URL:

```text
https://YOUR-PREVIEW-HOST/api/paystack/webhook
```

The checkout callback is generated automatically for the domain where the customer starts checkout. The webhook endpoint validates Paystack’s signature and then verifies each successful charge with Paystack before updating the invoice.

## 4. Make a test purchase

Open the Preview site, add an in-stock product, and place an order using an email address. On the private order page choose **Pay with Paystack**. Complete a test transaction using Paystack’s current [test payment details](https://paystack.com/docs/payments/test-payments/). Return to the order page and refresh if needed; its payment status should show as paid. Paystack test transactions do not charge a real card.

If the Paystack button is missing, confirm both environment variables are set for Preview and redeploy. The database migration for Paystack has already been applied to the connected ASCEND Supabase project.

## 5. Switch to live payments later

After successful end-to-end testing and Paystack business activation, set the live secret key and live webhook signing secret under Vercel’s **Production** environment, then redeploy. Add the Production webhook URL in Paystack Live Mode:

```text
https://ascendathletics.com.ng/api/paystack/webhook
```

Do not replace the Preview test keys until testing is complete. Store only the matching environment’s test or live keys in each Vercel environment.
