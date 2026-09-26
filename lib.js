// Shared helpers — zero dependencies.
const crypto = require('node:crypto');

// XSS-safe HTML escaping for text AND attribute values.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'storefront';
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---- admin sessions (in-memory) ----
const sessions = new Map(); // sessionId -> createdAt ms
const SESSION_COOKIE = 'sf_admin';
function createSession() {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now());
  return id;
}
function validSession(id) { return !!id && sessions.has(id); }
function destroySession(id) { sessions.delete(id); }
function sessionCookieHeader(id) {
  return `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;
}
function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// ---- request body ----
function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body || '')) out[k] = v;
  return out;
}

// ---- phones ----
function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }
function validPhone(s) { return digitsOnly(s).length >= 7; }
function telHref(phone) {
  const d = digitsOnly(phone);
  if (d.length === 10) return 'tel:+1' + d;
  if (d.length === 11 && d[0] === '1') return 'tel:+' + d;
  return 'tel:' + d;
}
function smsHref(phone) {
  const d = digitsOnly(phone);
  if (d.length === 10) return 'sms:+1' + d;
  if (d.length === 11 && d[0] === '1') return 'sms:+' + d;
  return 'sms:' + d;
}

// ---- twilio ----
function twilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}
async function sendSms({ to, from, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: 'Twilio credentials not set' };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.json()).message || ''; } catch { /* ignore */ }
      return { ok: false, error: `Twilio HTTP ${r.status}${detail ? ' — ' + detail : ''}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- misc ----
function reviewUrl(placeId) {
  return 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(placeId);
}
function missedCallText(businessName) {
  return `Sorry we missed your call — this is ${businessName}. Reply with what you need and we'll get right back to you.`;
}
function reviewRequestText(businessName, url) {
  return `Thanks for choosing ${businessName}! If you had a great experience, a Google review would mean a lot to us: ${url}`;
}
function smsAutoReplyText(businessName, slug) {
  return `Thanks for texting ${businessName}! Get a free quote here: /s/${slug}#quote`;
}
function postWebhook(url, payload) {
  // Best-effort: never throws, never blocks the response.
  (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch (e) {
      console.error('Outbound webhook failed:', e.message);
    }
  })();
}

function sendHtml(res, html, status = 200) {
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}
function sendXml(res, xml, status = 200) {
  const buf = Buffer.from(xml, 'utf8');
  res.writeHead(status, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}
function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location });
  res.end();
}

module.exports = {
  esc, slugify, parseCookies, createSession, validSession, destroySession,
  sessionCookieHeader, clearSessionCookieHeader, SESSION_COOKIE, timingSafeEq,
  readBody, parseForm, digitsOnly, validPhone, telHref, smsHref,
  twilioConfigured, sendSms, reviewUrl, missedCallText, reviewRequestText,
  smsAutoReplyText, postWebhook, sendHtml, sendXml, redirect,
};
