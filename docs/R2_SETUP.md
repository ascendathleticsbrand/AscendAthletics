# Cloudflare R2 setup for ASCEND product images

Updated: 16 October 2026.

This guide connects a Cloudflare R2 bucket to ASCEND's existing **Upload photograph** action. A bucket is a container for image files. You create it in your own Cloudflare account, then add its connection details privately in VS Code.

R2 will hold new public product photos. Supabase continues to handle accounts, permissions, customer records, orders and private payment proofs. Existing Supabase product photos continue to display; this setup does not move or delete them.

## 1. Open R2

1. Sign in or create an account at the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Select your account, then **Storage & databases → R2 → Overview**.
3. If Cloudflare asks you to activate an R2 subscription, review its checkout and billing details yourself. You do not need to purchase a domain to test this setup. R2 includes a free monthly allowance, with charges for usage beyond the allowance. [Cloudflare getting started](https://developers.cloudflare.com/r2/get-started/), [current pricing](https://developers.cloudflare.com/r2/pricing/).

You do not need to install a VS Code extension or move the ASCEND website to Cloudflare.

## 2. Create the image bucket

1. On R2 Overview, choose **Create bucket**.
2. Enter **ascend-images** as the bucket name.
3. Use the automatic/default location. Leave jurisdiction restrictions unset for this connection.
4. Select **Standard** as the storage class.
5. Choose **Create bucket**. [Cloudflare bucket setup](https://developers.cloudflare.com/r2/get-started/s3/).

Use this bucket for merchandise photos customers may see. Do not upload payment receipts, identity documents or other private customer files here: the next step makes objects publicly readable.

## 3. Enable the temporary public image URL

Because you do not own a domain yet, use Cloudflare's development URL while testing.

1. Open **ascend-images → Settings**.
2. Find **Public Development URL** and select **Enable**.
3. In the confirmation, type **allow**, then choose **Allow**.
4. Copy the generated public bucket URL. It will resemble **https://pub-example.r2.dev**. Use your real generated URL, not this example.

The **r2.dev** address is rate-limited and intended for development. Before launching a public shop with R2 images, connect a custom domain. [Cloudflare public bucket instructions](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Opening the base URL alone may not show a page or list of images. Test an actual uploaded image URL instead.

## 4. Copy the Account ID

1. In the Cloudflare dashboard, press **Ctrl + K** to open Search.
2. Search for **Copy account ID**.
3. Select the result to copy your Account ID. [Cloudflare Account ID instructions](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

Use the **Account ID**, not a Zone ID. You do not need a domain or Zone ID for this connection.

## 5. Create a bucket-scoped upload key

1. Return to **R2 → Overview**.
2. Under **Account Details**, find **API Tokens** and choose **Manage**.
3. Choose **Create Account API token**, or **Create User API token** if that is the option available to your account.
4. Give it a recognizable name, such as **ASCEND product images**.
5. Choose **Object Read & Write**.
6. Choose **Apply to specific buckets only**, then select **ascend-images**.
7. Create the token.
8. Save the resulting **Access Key ID** and **Secret Access Key** privately. Cloudflare shows the secret only once. These are the two S3 credentials the app needs, not a Global API Key or a general Cloudflare API token. [Cloudflare R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

Do not paste either credential into chat, screenshots, source code or GitHub.

## 6. Add the details privately in VS Code

Open **.env.local** in the ASCEND project. Update the prepared R2 fields; do not create duplicate entries:

~~~dotenv
IMAGE_STORAGE_PROVIDER=supabase
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_BUCKET_NAME=ascend-images
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_PUBLIC_BASE_URL=https://pub-your-real-id.r2.dev
~~~

The values above are placeholders. Replace them with your own details. Leave **IMAGE_STORAGE_PROVIDER=supabase** until all R2 fields are filled in, then change it to:

~~~dotenv
IMAGE_STORAGE_PROVIDER=r2
~~~

Use these values as follows:

| Field | What belongs here |
| --- | --- |
| R2_ACCOUNT_ID | The Account ID copied in step 4. |
| R2_BUCKET_NAME | The exact bucket name you created. |
| R2_ACCESS_KEY_ID | Access Key ID from the R2 credential confirmation. |
| R2_SECRET_ACCESS_KEY | Secret Access Key from the same confirmation. |
| R2_PUBLIC_BASE_URL | The public development URL from the bucket's Settings. |

**R2_PUBLIC_BASE_URL must be the public image URL.** The S3 API endpoint, **https://ACCOUNT_ID.r2.cloudflarestorage.com**, is for authenticated server operations and is a different address. [Cloudflare S3 connection details](https://developers.cloudflare.com/r2/get-started/s3/).

Keep the keys in **.env.local**, which this project ignores in Git. The shared **.env.example** is only a blank template. Do not add **NEXT_PUBLIC_** to either credential name. If you deploy later, set the same server environment variables privately in your hosting dashboard.

## Check the connection before switching

Once the five R2 fields are saved, run `npm run check:r2` in the project terminal. It checks authenticated access to the named bucket without printing credentials or changing any objects.

For a complete storage check, run `npm run check:r2 -- --upload-test`. This uploads a temporary copy of an existing public merchandise photo, verifies that the public URL returns the identical image, then deletes only that temporary object. It does not create product/customer/order records or alter existing photos. After this passes, set `IMAGE_STORAGE_PROVIDER=r2`.

## 7. Restart and try one photo

1. Save **.env.local**.
2. In the VS Code terminal running the site, press **Ctrl + C**, then run:

~~~powershell
npm run dev
~~~

3. Open the localhost address printed in the terminal.
4. Sign in to **/admin** as an owner or authorized assistant.
5. Open **Products** and choose **Upload photograph**.
6. Select a saved product, choose a JPEG, PNG or WebP image smaller than 5 MB, add an image description, and submit.
7. Open that product in the shop. Confirm the photograph appears.
8. In Cloudflare, open **ascend-images** and confirm the new object appears. Open its public image URL in a signed-out window to confirm customers can view it.

The app uploads through its authenticated server endpoint. This flow does not require a bucket CORS policy. Direct browser-to-R2 uploads would need different setup. [Cloudflare CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/).

After saving the private values, you can tell me **"R2 details added"** so I can help check the connection. You may share the bucket name and public image URL; keep the access credentials private.

## What happens to existing photos?

Switching the provider affects new uploads. Photos already stored in Supabase remain there and continue to work. Existing images are not automatically migrated to R2.

Removing an image from a product's gallery removes its catalog attachment; this integration does not purge old objects from either storage provider. Keep storage cleanup separate from editing a product.

To use Supabase for new uploads again, set **IMAGE_STORAGE_PROVIDER=supabase** and restart the local server. Keep any existing R2 images publicly accessible if products still reference them.

## Before using R2 images on the live shop

When you own a domain and have added it to the same Cloudflare account, open **ascend-images → Settings → Custom Domains → Add** and connect an image subdomain, for example **images.yourdomain.com**. Use the active custom-domain URL for **R2_PUBLIC_BASE_URL** and restart or redeploy. Keep the old public address working until existing image references have been checked and updated. [Cloudflare custom domain setup](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Do not create a CNAME pointing directly to the development URL; use R2's Custom Domains feature.

## If the connection does not work

| Symptom | What to check |
| --- | --- |
| Upload says R2 is not configured | All five R2 fields are filled in, the provider is r2, and the server restarted. |
| Upload is denied | The key has Object Read & Write access to the exact bucket in the same account. |
| Upload works but the shop image fails | Public URL access is enabled and R2_PUBLIC_BASE_URL is the public image address. |
| Base public URL shows no image list | Open a full image URL including its object key; the root is not a gallery. |
| Existing photos still have Supabase addresses | Expected: switching the upload provider does not migrate existing files. |
| Secret Access Key is lost | Create a replacement scoped key and update .env.local; the old secret cannot be displayed again. |

The connection is not complete until your own bucket, public URL and private credentials are configured and a real upload has passed.
