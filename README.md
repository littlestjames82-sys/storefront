# Storefront 👻

One-page websites for trades businesses — by **Ghost Developer Studio**.

**Live site:** https://storefront-ghost-dev.netlify.app

Storefront is the productized version of the "digital storefront bundle": a done-for-you
one-page website for trades businesses that have none, bundled with the three things that
make the phone ring:

1. **Click-to-call + quote-request form** — every quote lands in a leads inbox.
2. **Google review tools** — review link + printable QR code + one-tap review-request SMS.
3. **Missed-call text-back** — a Twilio number that auto-texts callers you couldn't pick up.

Zero npm dependencies. Node.js 24 only (`node:http` + built-in `node:sqlite`).

## Quick start

```bash
git clone https://github.com/littlestjames82-sys/storefront.git
cd storefront
node server.js
```

Then open:

- Demo storefront: http://localhost:3000/s/blue-ridge-excavating
- Admin: http://localhost:3000/admin

On first boot the server prints an **admin token** (it also saves it to
`DATA_DIR/.admin_token`). Enter it on the admin login page — it sets a cookie session.

First boot also seeds a demo storefront ("Blue Ridge Excavating", fictional) with
3 sample leads so the inbox isn't empty.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on (Render sets this automatically) |
| `DATA_DIR` | `./data` | Where `storefront.db` and `.admin_token` live |
| `ADMIN_TOKEN` | *(generated)* | Password for `/admin`. If unset, a random token is generated on first boot, saved to `DATA_DIR/.admin_token`, and printed to the console |
| `TWILIO_ACCOUNT_SID` | — | Enables real SMS (review requests, missed-call text-back) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token (pair with the SID above) |
| `OUTBOUND_WEBHOOK_URL` | — | If set, every new quote POSTs lead JSON here (best-effort; a failure never breaks the confirmation page) |

Without Twilio credentials everything still works: review requests show copy-paste
message text, and the voice/SMS webhooks answer gracefully without crashing.

## Pointing a Twilio number at Storefront

1. In the [Twilio Console](https://console.twilio.com), open your phone number.
2. Under **Voice Configuration**, set "A call comes in" to **Webhook**,
   `https://YOUR-DOMAIN/webhooks/twilio/voice`, HTTP POST.
3. Under **Messaging Configuration**, set "A message comes in" to **Webhook**,
   `https://YOUR-DOMAIN/webhooks/twilio/sms`, HTTP POST.
4. Set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` in the environment, and enter
   that same Twilio number on the storefront's edit page ("Twilio phone number").

What happens then:

- **Missed call** → Twilio hits `/webhooks/twilio/voice` → the caller gets
  "Sorry we missed your call — this is {business}…" by SMS.
- **Inbound text** → Twilio hits `/webhooks/twilio/sms` → the sender gets an
  auto-reply with the business's quote-form link.

Note: business texting needs A2P 10DLC registration with carriers — budget days,
not hours, for approval before sending at volume.

## Deploying to Render (free tier)

`render.yaml` is included. Push this folder to a repo, then in Render:

1. **New → Blueprint**, point it at the repo.
2. Render reads `render.yaml`, creates the free web service, and generates an
   `ADMIN_TOKEN` for you (visible under Environment after deploy).
3. Open `https://your-service.onrender.com/admin` and log in with that token.

⚠️ Render's free tier has an **ephemeral filesystem** — `storefront.db` resets on
redeploy/restart. Fine for demos; attach a persistent disk (paid) or back up the
DB before going to production.

## Status

Built and live: the demo storefront runs at
[storefront-ghost-dev.netlify.app](https://storefront-ghost-dev.netlify.app),
and this repo is the working implementation — the Node server (`server.js`),
the admin leads inbox, the Google review tools, and the Twilio voice/SMS
webhooks described above. Deployment configs for both Netlify (`netlify.toml`,
`netlify/`) and Render (`render.yaml`) are included.

## Roadmap

- **Stripe billing** — $29–39/mo subscriptions per storefront, self-serve signup.
- **Photo uploads** — hero/cover photos and job galleries per storefront.
- **Multi-user auth** — one login per business owner, not one shared admin token.
- **Real review-click tracking** — count QR scans and link clicks per storefront.
- **Persistent storage** — hosted Postgres/Turso instead of a local SQLite file.
- **Smarter missed-call handling** — only text back on no-answer/busy via Twilio
  `Dial` status callbacks instead of every inbound call.

## More from Ghost Developer Studio

Ghost Developer Studio builds developer tools, AI-agent safety software, apps,
and websites — and sells by showing working software.

- **Roadmap board** — where every studio product stands, on one page:
  https://github.com/littlestjames82-sys/ghost-roadmaps
- [Agent Seatbelt](https://github.com/littlestjames82-sys/agent-seatbelt) — deterministic guardrails for AI coding agents
- [GhostGuard](https://github.com/littlestjames82-sys/ghostguard) — record-first governance gateway for AI agents
- [Ghost Hands](https://github.com/littlestjames82-sys/ghost-hands) — governed, recorded, replayable agent hands
- [GhostBus](https://github.com/littlestjames82-sys/ghostbus) — agent-to-agent message bus, exposed as an MCP server
- [Ghost Bridge](https://github.com/littlestjames82-sys/ghost-bridge) — MCP bridge + relay for handing tasks between agents
- [GhostChat](https://github.com/littlestjames82-sys/ghostchat) — live chat & omnichannel inbox for small businesses
- [Decksmith](https://github.com/littlestjames82-sys/decksmith) — cyberdeck design & fabrication studio
