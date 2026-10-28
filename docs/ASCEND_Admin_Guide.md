# ASCEND ATHLETICS
## ADMIN GUIDE
A practical handbook for the owner and assistants.

**Prepared: 16 October 2026 | RISE. PUSH. BECOME.**

> Everyday work happens inside your website's admin dashboard. You do not need to write SQL or open Supabase to add customers, manage stock or process orders.

### Start here
1. Open your ASCEND website and go to **/admin**. If asked to sign in, use your verified account and existing password.
2. Your owner account is **akgreat62@gmail.com**. There is no separate default admin password.
3. For local access, run **npm run dev** in the project terminal, keep it open and visit **http://localhost:3000/admin**. If the terminal's **Local** address uses another port, use that address plus **/admin**. After publishing, use your live website address plus **/admin**.
4. Check for **Connected workspace** at the top, then choose a section from the sidebar.

### Find a task
| Page | What you want to do |
| --- | --- |
| 2 | Understand the dashboard and its controls |
| 3 | Add products, photos and supplements |
| 4 | Count opening stock and record restocks |
| 5 | Process website, WhatsApp and offline orders |
| 6 | Verify payments, refunds and expenses |
| 7 | Save and update customer details |
| 8 | Set up training packages and coaching |
| 9 | Send WhatsApp reminders and prepare email |
| 10 | Manage website content and marketing |
| 11 | Change business settings and add staff |
| 12 | Follow a daily routine and solve common issues |

**Keep this guide for staff use.** Examples explain the controls; always enter the actual amounts and physical counts for your business.

---

# 01 / Find your way around
Use the sidebar on a computer. On a phone, open the admin menu first.

| Section | Use it for |
| --- | --- |
| Overview | Receipts, outstanding balances, orders and active clients |
| Products | Product details, prices, photos and size/colour variants |
| Inventory | Opening counts, restocks, reservations and stock history |
| Orders | Website orders, manual sales, delivery and handover |
| Customers | Names, phone numbers and linked customer history |
| Coaching Clients | Enrollments, start dates, renewals and sessions |
| Training Packages | Physical/online packages, prices and terms |
| Payments | Transfer claims, actual bank-credit verification and refunds |
| Finances | Collected receipts, unpaid balances and expenses |
| Marketing | Consenting subscribers, email campaigns and drops |
| Website Content | Supported website copy, images and collections |
| Settings | Bank, pickup, delivery, reminders and staff access |

### Controls you will use often
- **Row arrow:** click the small diagonal arrow at the far right of a record to open its details and available actions.
- **Save changes:** finishes most forms. If the form asks for confirmation, tick it after reviewing the details. Payment verification uses **Confirm bank credit** instead.
- **Circular arrow:** refreshes the dashboard records. Use it if another staff member has made changes.
- **Search and filters:** narrow the records. **Clear filters** restores the list; the arrows below the table change pages.
- **Download icon:** exports the current page of filtered records as CSV. It is not a complete database backup.
- **View storefront:** opens the customer-facing website so you can check your changes.
- **Account icon:** opens your account page. Choose **Sign out** there when finished on a shared computer.

> When editing an existing record, an action can still be labelled **Add product** or **Add customer**. Open it from that record's details; the form title identifies the edit. Review the selected record before saving.

---

# 02 / Add a product
**Open: Products.** Start a new product as a draft, then prepare its photos and physical stock before making it active.

1. Click **Add product**. Enter **Product name**, **Shop URL slug**, **Category**, **Selling price (NGN)** and **Description**. A slug is the short address, such as **black-training-shorts**: use lowercase letters, numbers and hyphens.
2. Add a useful **Size guide** if needed. The owner may enter **Unit cost (NGN)** for cost reporting. Choose **Draft** for **Product visibility**, then **Save changes**.
3. Open the saved product's row arrow and choose **Upload photograph**. Select the image, write an accurate **Image description**, set **Display order** if needed and save. Use JPEG, PNG or WebP files under 5 MB; order **0** is the first photo.
4. Choose **Add size / colour**. Give each physical size/colour combination a **Unique SKU**, **Size**, **Colour** and **Low-stock alert threshold**, then save. A SKU identifies one exact variation, for example **ASC-SHORT-BLACK-L**.
5. Open **Inventory** and record the physical **Opening** count for every variant. See page 4.
6. Return to the product details and choose **Add product** to open **Edit product**. Set **Product visibility** to **Active**, then **Save changes**.
7. Choose **View storefront** and check the shop, category, photograph, price, sizes and availability.

| Visibility | Meaning |
| --- | --- |
| Draft | Still being prepared; not a live shop product |
| Coming Soon | Not currently purchasable |
| Active | Published; purchases depend on available confirmed stock |
| Unavailable | Withdrawn from the live catalog |

### Add supplements in the same way
Choose **Supplements** as the category. Enter the real name, description, selling unit, price and photograph for the item you actually sell. Give each pack size or flavour its own SKU where needed. Use accurate labels for the selling unit; do not assume a clothing size applies. Confirm its real stock before publishing.

### Update an existing product
Find it in **Products**, open the row arrow, choose its edit action and change the required fields. To remove a photo, use **Remove photograph** below that image and confirm.

> The four homepage category cards stay fixed. New products and stock update the shop. The existing **Feature on homepage** checkbox does not replace those cards.

---

# 03 / Count and manage stock
**Open: Inventory.** Count the items you physically hold before saving a stock change.

### Read the numbers
| Column | Meaning |
| --- | --- |
| Physical | Unsold units physically held, including reserved units |
| Reserved | Units temporarily held for existing orders |
| Available | Physical minus Reserved: units that can be ordered |
| Sold | Units already recorded as sold by the order workflow |
| Opening count | Whether the first physical count has been confirmed |

### Record a count or change
1. Open the SKU's row arrow and choose **Record stock**. Alternatively use the top **Record stock** button and select the correct SKU.
2. Choose **Movement type**. Enter **Count or quantity changed** using the rules below.
3. Explain **Reason / count notes**. Review the SKU and quantity, tick the physical-check confirmation and click **Save changes**.
4. Check the updated Physical, Reserved and Available numbers.

| Movement | What to enter | Example |
| --- | --- | --- |
| Opening | First TOTAL physical count; once only | You have 3: enter 3 |
| Restock | Number of new units ADDED | You have 3 and receive 5: enter 5; total becomes 8 |
| Reconciliation* | TOTAL physically counted now | Screen says 8; count is 7: enter 7 |
| Adjustment* | Signed correction | Remove one unit: enter -1 |
| Damaged* | Negative number of damaged units | One damaged unit: enter -1 |
| Return | Positive resellable units actually received | One returned unit: enter 1 and confirm inspection |

**\* Owner action.** Reconciliation and Opening take totals; Restock takes only the addition. For **Damaged**, use a negative quantity even though the current form's helper text only mentions negative adjustments.

### Useful habits
- Use **Count needed**, **Low stock** or **Available stock** filters to find the right SKUs.
- Opening count cannot be confirmed twice. Use the appropriate later movement instead.
- A refund does not automatically return stock. Inspect the returned item before recording **Return**, and tick **Returned item inspected and confirmed resellable**.
- Ordinary sales are handled by the order workflow. Do not deduct the same sale again as a stock adjustment.
- If a count conflicts with reservations, review the affected orders. Do not add imaginary stock to get past the warning.

---

# 04 / Manage orders
**Open: Orders.** Website checkouts appear automatically. Use a manual order for WhatsApp, Instagram or in-person sales.

### Record a manual sale
1. Click **Record manual order**. Select an existing customer if available, or enter **Customer name**, **Phone number** and optional **Email address**.
2. Choose **Order source** and **Fulfillment method**: **Pickup** or **Delivery**. Delivery requires the recipient, state, city, area and full address. Pickup requires a real pickup location in Settings.
3. In **Order items**, choose **Variant / SKU** and **Quantity**. Use **Add another item** for a different variant. Increase quantity for more of the same SKU.
4. Click **Save changes**. The system uses the current catalog price and checks available stock.
5. In the success panel, use **Copy secure link**, **Open customer view** or **Prepare WhatsApp link**. Keep the secure link while this session's success panel is available. Share it only with that customer.
6. Record and verify the payment through **Payments**. Creating an order does not confirm payment.

### Delivery with an unconfirmed fee
Open the order and choose **Quote delivery fee**. Enter the actual fee and save. The customer must approve that quote through their secure order view before the final total becomes payable. A staff quote is not customer approval.

### Fulfil the order
After full verified payment, open the order and choose **Update fulfillment**. Select the stage that actually applies, then **Save changes**.

| Status | Use it when |
| --- | --- |
| Processing | You are preparing the paid order |
| Ready For Pickup | It is packed and ready for collection |
| Shipped | You handed it to the courier; add tracking if available |
| Delivered | Delivery has actually been completed |
| Picked Up | The customer collected the order |

### Other actions
- **Add order note:** internal operational notes for staff.
- **Cancel order:** give a reason and confirm. Active reservations are released. A paid cancellation needs owner access. Cancellation does not send a refund or automatically return sold stock.
- **Authorize pay later:** owner-only exception. The unpaid amount remains outstanding.
- **Resolve stock availability:** owner action if payment arrived after a reservation expired and stock is no longer available. Check or restock real items first, then resolve with a note. If the order cannot be supplied, handle cancellation and any actual refund separately.

---

# 05 / Payments and finances
**A receipt is a claim. Confirm a payment only after checking the actual business bank account.**

### Record and verify a transfer
1. Open **Payments > Record transfer claim** if the claim is not already listed. Select the **Invoice** and enter the claimed amount, customer reference and transfer date/time. Save it once.
2. Open the claim's row arrow. Use **View proof 1** if evidence was attached. A proof image alone does not show that your bank received the money.
3. The owner checks the actual bank credit, then chooses **Verify bank credit**.
4. Enter **Actual bank credit received (NGN)** and its **Unique bank credit reference**, plus a note if needed. Use the bank's credit identifier, not just the customer's typed reference.
5. Tick the confirmation and click **Confirm bank credit**. Check the invoice balance and order or coaching status afterwards.

> Example only: an invoice totals **NGN 50,000**, but the bank received **NGN 20,000**. Verify 20,000. The remaining balance is 30,000. A later receipt needs a separate claim and its own unique bank-credit reference.

### Corrections and refunds
- **Reject transfer claim:** owner explains why an unverified claim cannot be accepted. A rejected submission needs a new claim if the customer tries again.
- Verified payments cannot be silently edited. Do not verify the same bank credit twice; duplicate references are rejected.
- **Record refund:** first send the actual money outside this app. Then select the verified payment, enter **Refund paid (NGN)**, the actual refund bank reference and reason, confirm and save. The app records the refund; it does not transfer money. Handle any returned goods separately in Inventory.

### Review Finances - owner
Choose **Today**, **Last 7 days**, **This month** or **Custom range**, then click **Apply**. The reporting timezone normally remains **Africa/Lagos**.

| Figure | How to read it |
| --- | --- |
| Merchandise / Coaching receipts | Verified collected money |
| Outstanding balance | Unpaid invoice amounts |
| Recorded expenses | Costs entered separately from receipts |
| Recorded refunds | Refunds actually paid and recorded |

Choose **Record expense**, enter its real category, amount, date and description, then **Save changes**. Collected receipts are not net profit; product gross profit also depends on recorded unit costs.

---

# 06 / Save customer details
**Open: Customers or Coaching Clients.** Name and phone number are enough for a basic contact record.

### Quickly add a customer
1. Search for the person first so you do not add the same contact twice.
2. In **Quick add customer**, enter **Full name** and **Phone number**. Use a reachable number; international format such as **+234...** is useful for WhatsApp.
3. If they have an email, expand **Add email (optional)** and enter it. You can also add it later.
4. Click **Save customer** once and wait for the saved confirmation. The form clears so you can enter the next person.
5. If they are starting coaching, choose **Assign training package** beside that saved confirmation. Their customer record is already selected.

### Edit or find a saved contact
Use search, then open the row arrow. Review their contact details and linked orders, coaching, invoices and transfer history. Choose the customer edit action to update the existing record and **Save changes**.

If you see a message that the customer saved but the list could not refresh, refresh or search first. Do not immediately add them again.

### Which customers are saved automatically?
| Situation | What happens |
| --- | --- |
| Customer registers an account | A linked profile/customer record is created; verification is still needed for secure access |
| Customer completes a successful checkout | Their checkout contact details are saved with the order |
| Staff records a manual order | The selected or entered customer is linked to the sale |
| Person only browses the site or opens WhatsApp | Browsing alone does not create a saved customer |

### Contact record, login and consent are different
- **Quick add customer** creates a contact; it does not create a password or give the person admin access.
- A person who needs a login uses the website's **Create account** flow and verifies their email.
- Saving a customer does not subscribe them to marketing. Newsletter consent is separate.
- Guests can use their secure order link. Do not assume records automatically merge because the name, phone or email looks the same.
- Save only details needed for orders or training. Keep administrative notes brief and avoid unnecessary sensitive information.

---

# 07 / Training packages and clients
The usual sequence is **Package > Customer > Pending enrollment > Verified payment > Owner activation**.

### Create a package
1. Open **Training Packages > Add training package**. The owner can do this; an assistant needs the specific package-management permission.
2. Enter the actual name, **Training mode** (**Physical** or **Online**), price, description and benefits.
3. Choose **Billing model** and complete the matching terms. Monthly packages use **Calendar months**. Fixed programs use **Fixed program duration (days)**. Session products need the correct **Included sessions**.
4. Tick **Available for enrollment** only when you are ready to accept clients, then **Save changes**. Open an existing package's row arrow to edit it later.

### Enroll and activate a client
1. Save or find the customer, then choose **Assign training package**. Select the real package and save. This creates a pending enrollment and invoice; training is not active yet.
2. In **Payments**, record the transfer claim if needed. The owner checks the bank and uses **Verify bank credit > Confirm bank credit**.
3. Return to **Coaching Clients** and open the enrollment. Choose **Activate training**.
4. Enter the **Confirmed start date**, review the payment status, tick the confirmation and **Save changes**. The system calculates the expiry date from the package terms.
5. Confirm the client now shows **Active**, with the correct dates or session balance. Full payment is required unless the owner explicitly authorizes pay later.

### Renew a package
Open the enrollment and choose **Renew training**, confirm and save. This creates a new pending enrollment and invoice. Verify its payment and activate it with the correct new start date. The old enrollment remains in the history.

### Record sessions and notes
- Use **Record completed session** for one session actually completed on a paid, active session package. Enter its date and save. Session history is permanent.
- Use **Add client note** for a brief administrative note, such as a scheduling update.
- Review remaining sessions and expiry before promising another session. Calendar-month packages follow calendar dates, rather than a fixed assumption of 30 days.

> Assigning a package, verifying a payment and activating training are separate actions. An assistant can prepare the enrollment; the owner confirms the bank credit and activation.

---

# 08 / Reminders and messages
Your chosen WhatsApp method prepares a message for you to review and send yourself.

### Send a prepared WhatsApp reminder
1. Open **Coaching Clients**, then the client's row arrow.
2. Check the saved phone number and package expiry date.
3. Click **Prepare WhatsApp message**. WhatsApp opens for that recipient with prepared text.
4. Review the recipient, name, renewal date and wording.
5. Press **Send in WhatsApp** when you are ready. The admin dashboard does not send the message automatically.

The same prepared-message control can also appear on customer details. Without a suitable expiry date it may be a general contact message, rather than a dated renewal reminder.

### Email reminders need separate setup
As of this guide's preparation, automatic email sending and reminders have not been enabled for customer delivery. A domain and verified sender, provider test and hosted schedule are still needed. The **Enable coaching expiry reminders** checkbox alone does not complete that setup.

When the sending setup is ready:
1. Save each recipient's real email address and confirm their enrollment has the right expiry date.
2. The owner opens **Settings > Edit business settings**.
3. Review **Enable coaching expiry reminders** and **Reminder days before expiry (JSON array)**. The current intended schedule is **[7,2,0]**: seven days before, two days before and on expiry.
4. Keep **Reporting timezone** as **Africa/Lagos** unless the business genuinely uses another timezone.
5. Complete a controlled email test and scheduled-run check before enabling customer delivery.

### Email and WhatsApp are separate
| Channel | Who finishes sending? | What is needed? |
| --- | --- | --- |
| Prepared WhatsApp | You press Send in WhatsApp | Reachable saved phone number; correct message |
| Automated email reminders | Configured website service | Saved email, qualifying expiry, verified sender and hosted schedule |
| Signup confirmation email | Account authentication service | Its own working email delivery configuration |

Detailed technical setup is in **docs/REMINDERS_SETUP.md** in the project. Ask for setup help rather than pasting private API keys into chat or entering them as customer information.

---

# 09 / Website content and marketing
### Keep the original homepage layout
The homepage has four fixed category cards: **Compression & tops**, **Shorts & joggers**, **Gym accessories** and **Supplements**. Adding stock or publishing a product updates the shop without replacing these cards. The form's existing **Feature on homepage** checkbox does not control this fixed layout.

### Edit supported website content
1. Open **Website Content > Edit website content** or open an existing content row's arrow.
2. Select the correct **Website section**, review its existing values, then update the supported copy or owned image URL.
3. Tick **Publish to website** when the content is ready and **Save changes**.
4. Use **View storefront** to verify the result.

The main **RISE. PUSH. BECOME.** heading and page layout are fixed. Content editing does not make every title or layout editable. Structured FAQ and testimonial content needs valid data; get help with **Additional content (JSON)** if unsure. Publish testimonials only with the customer's approval.

### Categories and collections
- **Add category** creates a shop category: enter name, a lowercase hyphenated slug, display order and **Visible category**, then save. A new category does not automatically create another homepage card.
- **Supplements** already exists. Choose it when adding supplement products; do not create a duplicate.
- **Create collection** groups selected real products for a drop. Set its name, slug, description, product selection, launch date/time if needed and visibility (**Draft**, **Upcoming** or **Published**), then save. Check the customer view and scheduled timing.

### Newsletter campaigns
1. Add only contacts who explicitly agreed to marketing using **Add consenting subscriber**. Record where consent was obtained.
2. Choose **Draft campaign**, prepare the subject and content and review its recipients. **Preview email** before approval. Get help if you are unsure about HTML content.
3. The owner uses **Approve campaign** after reviewing both content and consent.
4. Once email delivery is configured and tested, the owner chooses **Send approved campaign**. The final button is **Send approved email**.

> Campaign sending contacts real recipients. An order, phone number or coaching registration alone is not newsletter consent. Email campaigns also need the configured sending provider; drafting does not mean delivery is ready.

---

# 10 / Settings and extra staff
### Update business settings - owner
Open **Settings > Edit business settings**, enter the real details and **Save changes**. Check the storefront or checkout after changing customer-facing information.

| Setting | What to enter |
| --- | --- |
| Bank details | Actual bank name, account number, account holder and transfer instructions |
| Pickup | Real location, contact number, hours and collection instructions |
| WhatsApp number | International digits only: 2349130607719; no + or spaces in this settings field |
| Contact / Instagram | Actual business email and social address |
| Reporting timezone | Africa/Lagos for this business |
| Stock reservation duration | Intended holding time in minutes; minimum 15 |
| Reminders | Intended schedule; email setup is still required |

For supported locations, use **Add delivery rate** and enter the real state, optional city/area, fee and active setting. An assistant needs the separate delivery-rate permission. Other destinations follow the quote-and-customer-approval process.

### Add another staff member
1. Have the person create their own website account and verify their email.
2. As owner, open **Settings > Manage staff access**.
3. Choose the person under **Existing user** and select **Assistant** or **Owner**. Check the identity carefully.
4. For an assistant, enable **May manage training packages** and/or **May manage delivery rates** only if you want those permissions.
5. Tick the access confirmation and **Save changes**. Ask them to sign in with their own account and open **/admin**.

| Role | Main access |
| --- | --- |
| Assistant | Catalog, ordinary stock work, orders, contacts, pending enrollments, renewals, sessions and drafts; package/rate management only when granted |
| Owner | All assistant work, plus bank verification, refunds, activation, pay-later exceptions, stock-conflict resolution, finances, settings, staff and campaign approval/sending |

Owner-only stock corrections include **Adjustment**, **Damaged** and **Reconciliation**. Some controls are disabled for assistants by design.

### Change or remove access later
Use **Staff access** in Settings to edit a role or choose **Revoke staff access**. Give a reason and confirm. Customer records and history remain. The last owner cannot be removed. To transfer control, add and verify the new owner's access before removing the old owner's role. Each person should use their own password.

---

# 11 / Daily routine and quick fixes
### A simple daily checklist
1. Open **Overview**: review unpaid balances, orders needing attention and active clients.
2. Open **Payments**: compare pending claims with the business bank account. Verify only money actually received.
3. Open **Orders**: prepare paid orders, confirm delivery quotes were accepted, and update real handovers.
4. Open **Inventory**: check low-stock items and new deliveries. Use **Restock** only for units physically added.
5. Open **Coaching Clients**: check upcoming expiry dates, send appropriate WhatsApp reminders and record completed sessions.
6. Check **Finances**, enter actual expenses and sign out when finished on a shared device.

### If something looks wrong
| Problem | First checks |
| --- | --- |
| /admin returns to sign-in | Sign in with the correct verified staff account; a customer login alone has no admin role |
| Setup required / cannot load records | Refresh once and read the error; ask for connection help before retrying a payment or stock write |
| Product missing from shop | Check Active status, its photos/price and confirmed opening counts for every variant |
| Product shows sold out | Check Available stock and reservations; restock only real delivered units |
| Customer saved but not visible | Search and refresh; a successful save may only have missed the list refresh |
| Cannot verify payment | Owner access is required; the final delivery fee must be accepted; check unique bank credit reference |
| Cannot activate training | Check verified full payment or owner exception, selected enrollment and confirmed start date |
| Reminder email did not arrive | Check saved email, expiry and provider/scheduler setup; enabling a checkbox is not enough |
| A button is disabled | Check role/permission, setup state, required fields and any confirmation checkbox |
| Totals look incomplete | Clear filters, review the date range, click Apply and check other pages |

### Keep useful records
Share a private order link only with its customer. Review stock and payment history instead of deleting or repeating completed entries. CSV export covers only the displayed page and is not a full backup. Keep passwords and server/API credentials private.

### Project reference files
- **docs/OWNER_SETUP.md** - existing owner access and later staff changes.
- **docs/CUSTOMER_DETAILS.md** - quick contact entry.
- **docs/REMINDERS_SETUP.md** - email and WhatsApp setup.
- **docs/SUPABASE_BEGINNER_GUIDE.md** - optional database orientation.

