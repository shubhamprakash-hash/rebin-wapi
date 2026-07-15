# RebinChat — Setup Guide to Receive WhatsApp Messages

## Your Meta Credentials (already known)

```
App ID:              1016662534582893
Phone Number ID:     1130246380181590
WABA ID:             1544029470522565
Test Number:         +1 (555) 170-4301
```

---

## STEP 1 — Add Missing Values to .env

Open `.env` in VS Code and fill in `META_APP_SECRET`:

1. Go to: https://developers.facebook.com/apps/1016662534582893/settings/basic/
2. Scroll down to find **"App Secret"** → click **Show** → copy it
3. Paste it in `.env`:
   ```
   META_APP_SECRET=paste_your_secret_here
   ```
4. Save the file

---

## STEP 2 — Install & Run Locally

Open VS Code Terminal (Ctrl + ~):

```bash
npm install
npm start
```

You should see:
```
RebinChat is running at http://localhost:4000
```

Open browser → http://localhost:4000

Login:
- Email: admin@rebininfotech.com
- Password: RebinChat@123

---

## STEP 3 — Connect WhatsApp in the Dashboard

1. Click **Settings** in the left sidebar
2. Scroll to **WhatsApp Connection**
3. Fill in:
   - **WABA ID:** `1544029470522565`
   - **Phone Number ID:** `1130246380181590`
   - **Access Token:** paste the `EAAOcpj...` token from Meta
4. Click **Connect**
5. It should show: **Status: Connected ✅**

---

## STEP 4 — Expose Localhost with Ngrok (for webhook)

Open a **second terminal** in VS Code (click + button):

```bash
npx ngrok http 4000
```

You'll see something like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:4000
```

Copy that `https://abc123.ngrok-free.app` URL.

---

## STEP 5 — Set Webhook in Meta

1. Go to: https://developers.facebook.com/apps/1016662534582893/whatsapp-business/wa-settings/
2. Scroll down to **Webhook** section
3. Click **Edit**
4. Fill in:
   - **Callback URL:** `https://abc123.ngrok-free.app/api/webhook`
   - **Verify Token:** `rebinchat_verify_2024`
5. Click **Verify and Save** → should say Verified ✅
6. Click **Manage** next to Webhook Fields
7. Subscribe to:
   - ✅ messages
   - ✅ message_deliveries
   - ✅ message_reads
8. Click Done

---

## STEP 6 — Test It

1. On your WhatsApp phone, send a message to the Meta test number: **+1 (555) 170-4301**
2. Go to your dashboard → click **Inbox**
3. The message should appear instantly ✅
4. Click the conversation → type a reply → press Send
5. Check your WhatsApp phone — the reply should arrive ✅

---

## STEP 7 — Deploy to Render (Permanent)

Once local testing works:

1. Push code to GitHub (without .env — it's in .gitignore)
2. Go to render.com → New Web Service → connect your repo
3. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add Environment Variables in Render dashboard:
   ```
   PORT=4000
   JWT_SECRET=rebin_super_secret_jwt_key_change_in_production_2024
   META_APP_ID=1016662534582893
   META_APP_SECRET=your_secret
   META_WEBHOOK_VERIFY_TOKEN=rebinchat_verify_2024
   META_GRAPH_VERSION=v20.0
   SEED_ADMIN_EMAIL=admin@rebininfotech.com
   SEED_ADMIN_PASSWORD=RebinChat@123
   SEED_COMPANY_NAME=Rebin Infotech
   SEED_ADMIN_NAME=Admin
   ```
5. Deploy → after it's live, update Meta webhook URL to:
   ```
   https://your-app.onrender.com/api/webhook
   ```
6. Done — messages will now arrive permanently without ngrok ✅

---

## Troubleshooting

**Messages not appearing in Inbox:**
- Check ngrok is running in second terminal
- Check webhook is verified in Meta (green tick)
- Check you subscribed to `messages` event in webhook fields

**"Connect a WhatsApp number first" error when sending:**
- Go to Settings → connect WhatsApp with your credentials

**Webhook verification failed:**
- Make sure `npm start` is running on port 4000
- Make sure ngrok is pointing to port 4000
- Make sure Verify Token in Meta matches: `rebinchat_verify_2024`
