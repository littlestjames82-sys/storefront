// Storefront MVP — one-page websites for trades businesses, by Ghost Developer Studio.
// Deps: @libsql/client (local SQLite file, or Turso when TURSO_* env set). Boot: npm start
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('./db');
const T = require('./templates');
const {
  esc, slugify, parseCookies, createSession, validSession, destroySession, setSessionSecret,
  sessionCookieHeader, clearSessionCookieHeader, SESSION_COOKIE, timingSafeEq,
  readBody, parseForm, validPhone, twilioConfigured, sendSms, reviewUrl,
  missedCallText, reviewRequestText, smsAutoReplyText, postWebhook,
  sendHtml, sendXml, redirect,
} = require('./lib');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
// Serverless filesystems (e.g. Netlify Functions) are read-only: never crash on mkdir.
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* Turso mode doesn't need it */ }

// ---- admin token ----
let ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  const tokenFile = path.join(DATA_DIR, '.admin_token');
  if (fs.existsSync(tokenFile)) {
    ADMIN_TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
  } else {
    ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenFile, ADMIN_TOKEN, { mode: 0o600 });
  }
  console.log(`ADMIN_TOKEN was not set. Generated token (also saved to ${tokenFile}):\n${ADMIN_TOKEN}\n`);
}
setSessionSecret(ADMIN_TOKEN);

function requireAdmin(req, res) {
  const cookies = parseCookies(req);
  if (validSession(cookies[SESSION_COOKIE])) return true;
  redirect(res, '/admin/login');
  return false;
}

// Absolute public base URL, proxy-aware (Netlify Functions sit behind a CDN).
function publicBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

async function collectStorefrontForm(f, excludeId) {
  const services = String(f.services || '').split('\n').map((s) => s.trim()).filter(Boolean);
  let color = String(f.theme_color || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#1d4ed8';
  let slug = slugify(String(f.slug || '').trim() || String(f.business_name || ''));
  let n = 2;
  const base = slug;
  while (await db.slugTaken(slug, excludeId)) slug = `${base}-${n++}`;
  return {
    slug,
    business_name: String(f.business_name || '').trim(),
    trade: String(f.trade || '').trim(),
    phone: String(f.phone || '').trim(),
    email: String(f.email || '').trim(),
    tagline: String(f.tagline || '').trim(),
    about: String(f.about || '').trim(),
    services: JSON.stringify(services),
    service_area: String(f.service_area || '').trim(),
    hours: String(f.hours || '').trim(),
    theme_color: color,
    google_place_id: String(f.google_place_id || '').trim(),
    twilio_number: String(f.twilio_number || '').trim(),
  };
}

function formErrorPage(message, backHref) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:80vh;align-items:center;justify-content:center;margin:0;padding:20px;background:#f3f4f6}
.card{background:#fff;border-radius:12px;padding:28px;max-width:420px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.btn{display:inline-block;background:#1d4ed8;color:#fff;border-radius:8px;padding:10px 20px;font-weight:700;text-decoration:none;margin-top:12px}</style></head>
<body><div class="card"><h2>Something's off</h2><p>${esc(message)}</p>
<a class="btn" href="${esc(backHref)}">← Go back</a></div></body></html>`;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  // ---------- public ----------
  if (p === '/' && method === 'GET') return sendHtml(res, T.splashPage());

  let m;
  if ((m = p.match(/^\/s\/([A-Za-z0-9-]+)$/)) && method === 'GET') {
    const sf = await db.getStorefrontBySlug(m[1]);
    if (!sf) return sendHtml(res, formErrorPage('That page does not exist.', '/'), 404);
    return sendHtml(res, T.publicPage(sf));
  }
  if ((m = p.match(/^\/s\/([A-Za-z0-9-]+)\/quote$/)) && method === 'POST') {
    const sf = await db.getStorefrontBySlug(m[1]);
    if (!sf) return sendHtml(res, formErrorPage('That page does not exist.', '/'), 404);
    const f = parseForm(await readBody(req));
    const name = String(f.name || '').trim();
    const phone = String(f.phone || '').trim();
    if (!name) return sendHtml(res, formErrorPage('Please enter your name.', `/s/${sf.slug}#quote`), 400);
    if (!validPhone(phone)) return sendHtml(res, formErrorPage('Please enter a valid phone number.', `/s/${sf.slug}#quote`), 400);
    let service = String(f.service || '').trim();
    try {
      const valid = JSON.parse(sf.services || '[]');
      if (!valid.includes(service)) service = '';
    } catch { service = ''; }
    const message = String(f.message || '').trim().slice(0, 2000);
    const leadId = await db.createLead(sf.id, { name, phone, service, message });
    const hook = process.env.OUTBOUND_WEBHOOK_URL;
    if (hook) {
      postWebhook(hook, {
        event: 'new_lead',
        storefront: sf.slug,
        business: sf.business_name,
        lead: { id: leadId, name, phone, service, message, created_at: new Date().toISOString() },
      });
    }
    return sendHtml(res, T.quoteThanksPage(sf, name.split(' ')[0]));
  }
  if ((m = p.match(/^\/s\/([A-Za-z0-9-]+)\/review$/)) && method === 'GET') {
    const sf = await db.getStorefrontBySlug(m[1]);
    if (!sf || !sf.google_place_id)
      return sendHtml(res, formErrorPage('That page does not exist.', '/'), 404);
    return sendHtml(res, T.reviewLandingPage(sf));
  }

  // ---------- public API: sales-page signup -> GDS lead inbox (CORS-enabled) ----------
  function sendJson(res, obj, status = 200) {
    const buf = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': buf.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(buf);
  }

  async function ensureGdsStorefront() {
    let sf = await db.getStorefrontBySlug('ghost-developer-studio');
    if (sf) return sf;
    const id = await db.createStorefront({
      slug: 'ghost-developer-studio',
      business_name: 'Ghost Developer Studio',
      trade: 'Software studio',
      phone: '(423) 408-2150',
      email: 'gdev6145@gmail.com',
      tagline: 'One-page websites for local trades.',
      about: 'Ghost Developer Studio builds the Storefront product. Signups from the sales page land here as leads.',
      services: JSON.stringify(['Storefront setup']),
      service_area: 'East Tennessee',
      hours: '',
      theme_color: '#1d4ed8',
      google_place_id: '',
      twilio_number: '',
    });
    return await db.getStorefront(id);
  }

  if (p === '/api/signup' && method === 'OPTIONS') {
    return sendJson(res, {}, 204);
  }
  if (p === '/api/signup' && method === 'POST') {
    const ct = String(req.headers['content-type'] || '');
    const raw = await readBody(req);
    let f;
    if (ct.includes('application/json')) {
      try { f = JSON.parse(raw); } catch { return sendJson(res, { ok: false, error: 'Invalid JSON.' }, 400); }
    } else {
      f = parseForm(raw);
    }
    const business = String(f.business_name || '').trim();
    const name = String(f.contact_name || f.name || '').trim();
    const phone = String(f.phone || '').trim();
    const email = String(f.email || '').trim();
    const trade = String(f.trade || '').trim();
    const serviceArea = String(f.service_area || '').trim();
    const notes = String(f.notes || '').trim();
    const reviewBooster = [f.review_booster, f['Review Booster']].some((v) => v === true || v === 'true' || v === 'on' || v === 'yes');
    const ghostChat = [f.ghost_chat, f['GhostChat'], f['GhostChat Inbox']].some((v) => v === true || v === 'true' || v === 'on' || v === 'yes');
    if (!business) return sendJson(res, { ok: false, error: 'Please enter your business name.' }, 400);
    if (!name) return sendJson(res, { ok: false, error: 'Please enter your name.' }, 400);
    if (!validPhone(phone)) return sendJson(res, { ok: false, error: 'Please enter a valid phone number.' }, 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return sendJson(res, { ok: false, error: 'Please enter a valid email address.' }, 400);
    const sf = await ensureGdsStorefront();
    const message = [
      `Business: ${business}`,
      trade && `Trade: ${trade}`,
      serviceArea && `Service area: ${serviceArea}`,
      email && `Email: ${email}`,
      notes && `Notes: ${notes}`,
      reviewBooster && 'Review Booster: YES — $19/month add-on selected',
      ghostChat && 'GhostChat Inbox: YES — $29/month add-on selected',
      'Source: sales page',
    ].filter(Boolean).join('\n');
    const leadId = await db.createLead(sf.id, {
      name, phone, service: 'Storefront signup', message: message.slice(0, 2000),
    });
    const hook = process.env.OUTBOUND_WEBHOOK_URL;
    if (hook) {
      postWebhook(hook, {
        event: 'sales_signup',
        storefront: sf.slug,
        business: sf.business_name,
        lead: { id: leadId, name, phone, business_name: business, trade, email, review_booster: reviewBooster, ghost_chat: ghostChat, created_at: new Date().toISOString() },
      });
    }
    return sendJson(res, { ok: true });
  }

  // ---------- twilio webhooks (graceful without creds) ----------
  if (p === '/webhooks/twilio/voice' && method === 'POST') {
    try {
      const f = parseForm(await readBody(req));
      const sf = await db.findStorefrontByTwilioNumber(f.To);
      if (sf && twilioConfigured() && sf.twilio_number && f.From) {
        // Missed-call text-back. Fire and forget — never break the webhook.
        sendSms({ to: String(f.From), from: sf.twilio_number, body: missedCallText(sf.business_name) })
          .then((r) => { if (!r.ok) console.error('missed-call text-back failed:', r.error); });
      }
    } catch (e) { console.error('voice webhook error:', e.message); }
    return sendXml(res, '<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }
  if (p === '/webhooks/twilio/sms' && method === 'POST') {
    try {
      const f = parseForm(await readBody(req));
      const sf = await db.findStorefrontByTwilioNumber(f.To);
      if (sf) {
        const reply = smsAutoReplyText(sf.business_name, sf.slug);
        return sendXml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(reply)}</Message></Response>`);
      }
    } catch (e) { console.error('sms webhook error:', e.message); }
    return sendXml(res, '<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }

  // ---------- admin auth ----------
  if (p === '/admin/login' && method === 'GET') return sendHtml(res, T.loginPage(''));
  if (p === '/admin/login' && method === 'POST') {
    const f = parseForm(await readBody(req));
    if (timingSafeEq(f.token || '', ADMIN_TOKEN)) {
      const sid = createSession();
      res.writeHead(303, { Location: '/admin', 'Set-Cookie': sessionCookieHeader(sid) });
      return res.end();
    }
    return sendHtml(res, T.loginPage('Wrong token — try again.'), 401);
  }
  if (p === '/admin/logout') {
    const cookies = parseCookies(req);
    destroySession(cookies[SESSION_COOKIE]);
    res.writeHead(303, { Location: '/admin/login', 'Set-Cookie': clearSessionCookieHeader() });
    return res.end();
  }

  // ---------- admin (protected) ----------
  if (p === '/admin' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const sfs = await db.allStorefronts();
    const counts = {};
    for (const s of sfs) counts[s.id] = await db.leadCounts(s.id);
    return sendHtml(res, T.dashboardPage(sfs, counts, await db.recentLeads(10)));
  }
  if (p === '/admin/storefronts/new' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return sendHtml(res, T.storefrontFormPage(null, ''));
  }
  if (p === '/admin/storefronts' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const f = parseForm(await readBody(req));
    if (!String(f.business_name || '').trim())
      return sendHtml(res, T.storefrontFormPage(null, 'Business name is required.'), 400);
    if (!validPhone(f.phone || ''))
      return sendHtml(res, T.storefrontFormPage(null, 'Enter a valid phone number.'), 400);
    const id = await db.createStorefront(await collectStorefrontForm(f, null));
    return redirect(res, `/admin/storefronts/${id}/edit`);
  }
  if ((m = p.match(/^\/admin\/storefronts\/(\d+)\/edit$/)) && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const sf = await db.getStorefront(Number(m[1]));
    if (!sf) return sendHtml(res, 'Not found', 404);
    return sendHtml(res, T.storefrontFormPage(sf, ''));
  }
  if ((m = p.match(/^\/admin\/storefronts\/(\d+)$/)) && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const sf = await db.getStorefront(Number(m[1]));
    if (!sf) return sendHtml(res, 'Not found', 404);
    const f = parseForm(await readBody(req));
    if (!String(f.business_name || '').trim())
      return sendHtml(res, T.storefrontFormPage(sf, 'Business name is required.'), 400);
    if (!validPhone(f.phone || ''))
      return sendHtml(res, T.storefrontFormPage(sf, 'Enter a valid phone number.'), 400);
    await db.updateStorefront(sf.id, await collectStorefrontForm(f, sf.id));
    return redirect(res, '/admin');
  }
  if ((m = p.match(/^\/admin\/storefronts\/(\d+)\/reviews$/)) && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const sf = await db.getStorefront(Number(m[1]));
    if (!sf) return sendHtml(res, 'Not found', 404);
    const reviewPageUrl = publicBase(req) + `/s/${sf.slug}/review`;
    const preview = sf.google_place_id
      ? reviewRequestText(sf.business_name, reviewPageUrl)
      : 'Add a Google Place ID to preview the review message.';
    return sendHtml(res, T.reviewToolsPage(sf, twilioConfigured(), null, await db.reviewsFor(sf.id), preview, reviewPageUrl));
  }
  if ((m = p.match(/^\/admin\/storefronts\/(\d+)\/review-request$/)) && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const sf = await db.getStorefront(Number(m[1]));
    if (!sf || !sf.google_place_id) return sendHtml(res, 'Not found', 404);
    const f = parseForm(await readBody(req));
    const name = String(f.customer_name || '').trim();
    const phone = String(f.customer_phone || '').trim();
    const reviewPageUrl = publicBase(req) + `/s/${sf.slug}/review`;
    const text = reviewRequestText(sf.business_name, reviewPageUrl);
    let result;
    if (!name || !validPhone(phone)) {
      return sendHtml(res, T.reviewToolsPage(sf, twilioConfigured(),
        { mode: 'sent', ok: false, to: phone, error: 'Enter a valid name and phone number.' },
        await db.reviewsFor(sf.id), text, reviewPageUrl), 400);
    }
    if (twilioConfigured() && sf.twilio_number) {
      const r = await sendSms({ to: phone, from: sf.twilio_number, body: text });
      await db.logReview(sf.id, name, phone, r.ok ? 'sent' : 'failed: ' + r.error);
      result = { mode: 'sent', ok: r.ok, to: phone, error: r.error };
    } else {
      await db.logReview(sf.id, name, phone, 'manual');
      result = { mode: 'manual', text, to: phone };
    }
    return sendHtml(res, T.reviewToolsPage(sf, twilioConfigured(), result, await db.reviewsFor(sf.id), text, reviewPageUrl));
  }
  if (p === '/admin/leads' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const sel = url.searchParams.get('storefront') || 'all';
    return sendHtml(res, T.leadsPage(await db.allStorefronts(), sel, await db.leadsFor(sel)));
  }
  if ((m = p.match(/^\/admin\/leads\/(\d+)$/)) && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const lead = await db.getLead(Number(m[1]));
    if (!lead) return sendHtml(res, 'Not found', 404);
    const back = url.searchParams.get('back') || '/admin/leads';
    return sendHtml(res, T.leadDetailPage(lead, back.startsWith('/admin') ? back : '/admin/leads', db.LEAD_STATUSES));
  }
  if ((m = p.match(/^\/admin\/leads\/(\d+)\/status$/)) && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const lead = await db.getLead(Number(m[1]));
    if (!lead) return sendHtml(res, 'Not found', 404);
    const f = parseForm(await readBody(req));
    try {
      await db.setLeadStatus(lead.id, String(f.status || ''));
    } catch { return sendHtml(res, 'Bad status', 400); }
    const back = String(f.back || '/admin/leads');
    return redirect(res, back.startsWith('/admin') ? back : '/admin/leads');
  }

  return sendHtml(res, formErrorPage('Page not found.', '/'), 404);
}

function handler(req, res) {
  route(req, res).catch((e) => {
    console.error('request error:', e);
    try { sendHtml(res, formErrorPage('Something went wrong on our end.', '/'), 500); }
    catch { try { res.end(); } catch { /* noop */ } }
  });
}

const server = http.createServer(handler);

async function main() {
  await db.init(DATA_DIR);
  server.listen(PORT, () => {
    console.log(`Storefront running at http://localhost:${PORT}`);
    console.log(`Demo storefront: http://localhost:${PORT}/s/blue-ridge-excavating`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}

// Exported for serverless (Netlify Functions): require() must not start listening.
module.exports = { handler, initDb: () => db.init(DATA_DIR) };

if (require.main === module) {
  main().catch((e) => { console.error('failed to start:', e); process.exit(1); });
}
