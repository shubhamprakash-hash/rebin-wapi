# RebinChat
**A multi-tenant WhatsApp Business SaaS platform, built for Rebin Infotech** — in the spirit of WapiChat / MSG91 / Interakt, based on your internal blueprint.

It's a real, working Node.js application: multi-tenant login, shared team inbox with live updates, contacts/CRM, broadcast campaigns, template sync, keyword chatbot automation, and the Meta webhook + Embedded Signup wiring described in the blueprint.

---

## What's included

| Blueprint section | Built as |
|---|---|
| Customer onboarding flow | Signup/login screen, JWT auth, per-company (tenant) data isolation |
| WhatsApp Embedded Signup | `Settings → Connect with Facebook` button (Meta JS SDK flow) **+** a manual "paste your token" fallback that works with zero Meta App Review |
| Webhook (Step 6–7) | `/api/webhook` — verifies Meta's challenge, verifies `X-Hub-Signature-256`, stores incoming messages/statuses, routes them to the right customer by `phone_number_id` |
| Shared Inbox | Real-time conversation list + thread view (Socket.IO) |
| CRM | Contacts list, manual add, CSV bulk import |
| Campaign Manager | Pick an approved template, target all contacts or a tag, sends with built-in throttling |
| Template Manager | One-click sync of approved/pending templates from Meta |
| Chatbot Builder | Keyword → auto-reply rules |
| Analytics | Dashboard counts (contacts, conversations, messages, campaigns) |
| Multi-tenant data isolation | Every table is scoped by `tenant_id` |

**Not included yet** (flagged in the blueprint's own roadmap as later-stage / optional): Redis-backed job queue for very high broadcast volume, Stripe/Razorpay billing integration, becoming a WhatsApp BSP. The app is architected so these can be added without a rewrite — see "Scaling up" below.

---

## Bare-minimum setup (5 steps)

You need **Node.js 18+** installed. Everything else (database, frontend) is self-contained — there's no separate frontend build step and no Postgres/Redis to install for launch.

```bash
cd RebinChat
npm install
cp .env.example .env
# open .env and at minimum set JWT_SECRET to any random string
npm start
```

Open **http://localhost:4000** and log in with the default account that's created automatically on first run:

```
Email:    admin@rebininfotech.com
Password: RebinChat@123
```

**Change this password** (or better, set your own via environment variables before deploying — see below) since it's a known default.

You can also just click **"Create company"** to make a separate account instead of using the seeded one.

### Why there's a default login at all

Free hosting tiers (like Render's free plan) wipe the database file on every restart/sleep, since there's no persistent disk. Rather than ship a database file that would just get erased again, RebinChat re-creates this one default admin account automatically **every time the server starts**, if no accounts exist yet. That means you always have a working login even after a restart — but it also means anything else you added (contacts, conversations, other team members) is lost on restart until you attach real persistent storage (see "Scaling up" below).

To set your own default credentials instead of the built-in ones, add these environment variables (in `.env` locally, or in Render's Environment tab):

```
SEED_COMPANY_NAME=Rebin Infotech
SEED_ADMIN_NAME=Your Name
SEED_ADMIN_EMAIL=you@yourcompany.com
SEED_ADMIN_PASSWORD=a-strong-password
```

That's it — the dashboard, inbox, contacts, campaigns, chatbot and templates screens all work immediately. The only thing left is connecting a real WhatsApp number, which takes one more step:

### Connect a WhatsApp number (fastest path — no Meta App Review needed)

1. Go to [developers.facebook.com](https://developers.facebook.com) → create a Business-type App → add the **WhatsApp** product.
2. In the WhatsApp → API Setup screen, Meta gives you a **test phone number**, a **WhatsApp Business Account ID (WABA ID)**, a **Phone Number ID**, and a **temporary access token** (or generate a permanent one via System Users → Add Asset → WhatsApp Accounts → generate token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions).
3. In RebinChat, go to **Settings → WhatsApp connection → Option A (Manual connect)** and paste those three values in.
4. Set up the webhook in the Meta dashboard so incoming messages reach you:
   - Callback URL: `https://<your-public-domain>/api/webhook` (use [ngrok](https://ngrok.com) for a quick public URL while testing locally: `ngrok http 4000`)
   - Verify token: whatever you set as `META_WEBHOOK_VERIFY_TOKEN` in `.env`
   - Subscribe to the `messages` field (and `message_template_status_update` if you want template approval events).
5. Send yourself a WhatsApp message from the test number's allowed testers list — it will appear in the **Inbox** tab in real time.

This is exactly Section 2 of your blueprint, minus the parts (Facebook Login product config, full Embedded Signup, App Review) that only matter once you're onboarding *external* customers rather than testing internally.

### Going live with real customers (Embedded Signup)

Once you're ready to onboard customers who aren't test users, follow the rest of Section 2 of the blueprint:
1. Configure **Facebook Login** and **WhatsApp Embedded Signup** on your Meta App, and create an Embedded Signup **Configuration ID**.
2. Put your `META_APP_ID`, `META_APP_SECRET`, and `META_CONFIG_ID` into `.env` and restart the app.
3. The **"Connect with Facebook"** button on the Settings page will now be active — this is the real Embedded Signup flow, and lets any customer connect their own WABA from inside your product.
4. Submit for **Meta App Review / Advanced Access** (Section 2.8) before onboarding real external customers — this is a Meta requirement, not something any code can skip.

---

## Project structure

```
RebinChat/
├── server/
│   ├── index.js              # Express app, wiring, static file serving
│   ├── db.js                 # SQLite schema + connection
│   ├── socket.js              # Real-time inbox updates
│   ├── middleware/auth.js     # JWT auth guard
│   ├── services/whatsapp.js   # All Meta Graph API calls
│   └── routes/                # auth, whatsapp, webhook, inbox, contacts,
│                               # templates, campaigns, chatbot, analytics
├── public/                    # Dashboard frontend (plain HTML/CSS/JS — no build step)
├── data/rebinchat.db          # SQLite database (created automatically on first run)
└── .env                       # Your config (copy from .env.example)
```

## How multi-tenancy works

Every signup creates one **tenant** (the client company) and one admin **user**. All data — contacts, conversations, messages, campaigns, templates, chatbot rules — is scoped by `tenant_id`, and every API route checks the JWT's `tenantId` before reading or writing. You (Rebin Infotech) run one instance of this app; each client that signs up gets their own isolated workspace and connects their own WhatsApp number to it, exactly as described in the blueprint's architecture diagram.

## Scaling up later

The blueprint's own roadmap treats these as later-stage upgrades, and the code is structured so they drop in without a rewrite:

- **Postgres instead of SQLite**: swap `server/db.js` for a `pg` connection pool; the SQL is close to standard already.
- **Redis + BullMQ for broadcast queueing**: replace the in-process `setTimeout` loop in `routes/campaigns.js` with a BullMQ queue + worker.
- **Billing**: add a Stripe/Razorpay subscription webhook that flips `tenants.plan`; the pricing tiers table from the blueprint maps directly to plan values already stored per tenant.
- **Becoming a WhatsApp BSP**: only needed if you move to message-level billing — not required for the SaaS-subscription model this app implements.

## Security notes

- Access tokens are stored in the tenant's row in the database. For production, encrypt this column at rest (e.g. AES-256 with a KMS-managed key) before storing real customer tokens, per Section 7 of the blueprint.
- The webhook verifies Meta's `X-Hub-Signature-256` header once `META_APP_SECRET` is set — don't skip setting this in production.
- Put the app behind HTTPS in production (e.g. via a reverse proxy like Caddy/Nginx, or your hosting provider's managed TLS).
