// SQLite storage layer — @libsql/client.
// Local dev: file: URL under DATA_DIR. Production: libsql:// Turso when
// TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set (free hosts wipe local disk
// on restart, which would destroy the lead inbox).
const { createClient } = require('@libsql/client');
const fs = require('node:fs');
const path = require('node:path');

let client = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS storefronts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    trade TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    tagline TEXT DEFAULT '',
    about TEXT DEFAULT '',
    services TEXT DEFAULT '[]',
    service_area TEXT DEFAULT '',
    hours TEXT DEFAULT '',
    theme_color TEXT DEFAULT '#1d4ed8',
    google_place_id TEXT DEFAULT '',
    twilio_number TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storefront_id INTEGER NOT NULL REFERENCES storefronts(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT DEFAULT '',
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storefront_id INTEGER NOT NULL REFERENCES storefronts(id),
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    status TEXT DEFAULT '',
    sent_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_storefront ON leads(storefront_id)`,
  `CREATE INDEX IF NOT EXISTS idx_review_log_storefront ON review_log(storefront_id)`,
];

async function init(dataDir) {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (tursoUrl && tursoToken) {
    client = createClient({ url: tursoUrl, authToken: tursoToken });
    console.log('Storefront DB: Turso');
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(path.resolve(dataDir), 'storefront.db');
    client = createClient({ url: 'file:' + file });
    console.log('Storefront DB: local file ' + file);
  }
  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }
  await seed();
  return client;
}

function numId(v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

async function seed() {
  const row = await get('SELECT COUNT(*) AS c FROM storefronts');
  if (row && row.c > 0) return;

  const services = JSON.stringify([
    'Land Clearing',
    'Driveway Grading',
    'Brush & Tree Removal',
    'Site Cleanup',
    'Septic & Drainage Prep',
  ]);

  const r = await client.execute({
    sql: `INSERT INTO storefronts
      (slug, business_name, trade, phone, email, tagline, about, services, service_area, hours, theme_color, google_place_id, twilio_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'blue-ridge-excavating',
      'Blue Ridge Excavating',
      'Excavation & Land Clearing',
      '(555) 010-2030',
      'demo@example.com',
      'East Tennessee land work, done right the first time.',
      'Family-run excavation crew serving the Cumberland Plateau. We clear lots, grade driveways, and prep sites for builds — with honest per-job quotes and no surprises.',
      services,
      'Oakdale, Harriman, Kingston, Rockwood & surrounding areas',
      'Mon–Sat: 7:00 AM – 6:00 PM',
      '#1d4ed8',
      '',
      '',
    ],
  });
  const sfId = numId(r.lastInsertRowid);

  const leads = [
    [sfId, 'Marcus Webb', '(555) 014-7788', 'Driveway Grading',
      'Gravel driveway is washing out after every rain. About 300 ft long — can you take a look this week?',
      'new', '2026-09-25 14:02:11'],
    [sfId, 'Dana Whitfield', '(555) 019-3342', 'Land Clearing',
      'Need about 2 acres cleared for a home site near Wartburg. Some marketable timber, rest is brush.',
      'contacted', '2026-09-24 09:41:37'],
    [sfId, 'Tom Ellison', '(555) 011-9905', 'Brush & Tree Removal',
      'Storm took down three pines behind the barn. Need them cut and hauled off.',
      'won', '2026-09-22 17:15:03'],
  ];
  for (const l of leads) {
    await client.execute({
      sql: `INSERT INTO leads (storefront_id, name, phone, service, message, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: l,
    });
  }
  console.log('Seeded demo storefront: Blue Ridge Excavating (/s/blue-ridge-excavating) with 3 sample leads.');
}

async function rows(sql, args = []) {
  const r = await client.execute({ sql, args, rowMode: 'object' });
  return r.rows;
}
async function get(sql, args = []) {
  const r = await rows(sql, args);
  return r[0] || null;
}

// ---- storefronts ----
async function allStorefronts() {
  return rows('SELECT * FROM storefronts ORDER BY business_name');
}
async function getStorefront(id) {
  return get('SELECT * FROM storefronts WHERE id = ?', [id]);
}
async function getStorefrontBySlug(slug) {
  return get('SELECT * FROM storefronts WHERE slug = ?', [slug]);
}
async function slugTaken(slug, excludeId) {
  const row = await get('SELECT id FROM storefronts WHERE slug = ?', [slug]);
  return !!row && row.id !== excludeId;
}
async function createStorefront(f) {
  const r = await client.execute({
    sql: `INSERT INTO storefronts
      (slug, business_name, trade, phone, email, tagline, about, services, service_area, hours, theme_color, google_place_id, twilio_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [f.slug, f.business_name, f.trade, f.phone, f.email, f.tagline, f.about,
      f.services, f.service_area, f.hours, f.theme_color, f.google_place_id, f.twilio_number],
  });
  return numId(r.lastInsertRowid);
}
async function updateStorefront(id, f) {
  await client.execute({
    sql: `UPDATE storefronts SET slug=?, business_name=?, trade=?, phone=?, email=?,
      tagline=?, about=?, services=?, service_area=?, hours=?, theme_color=?, google_place_id=?, twilio_number=?
      WHERE id=?`,
    args: [f.slug, f.business_name, f.trade, f.phone, f.email, f.tagline, f.about,
      f.services, f.service_area, f.hours, f.theme_color, f.google_place_id, f.twilio_number, id],
  });
}
async function leadCounts(storefrontId) {
  const rs = await rows(
    'SELECT status, COUNT(*) AS c FROM leads WHERE storefront_id = ? GROUP BY status', [storefrontId]);
  const out = { new: 0, contacted: 0, won: 0, lost: 0, total: 0 };
  for (const r of rs) { if (r.status in out) out[r.status] = Number(r.c); out.total += Number(r.c); }
  return out;
}

// ---- leads ----
async function recentLeads(limit) {
  return rows(`SELECT l.*, s.business_name FROM leads l
    JOIN storefronts s ON s.id = l.storefront_id
    ORDER BY l.id DESC LIMIT ?`, [limit]);
}
async function leadsFor(storefrontId) {
  if (storefrontId === 'all' || !storefrontId) {
    return rows(`SELECT l.*, s.business_name FROM leads l
      JOIN storefronts s ON s.id = l.storefront_id ORDER BY l.id DESC`);
  }
  return rows(`SELECT l.*, s.business_name FROM leads l
    JOIN storefronts s ON s.id = l.storefront_id
    WHERE l.storefront_id = ? ORDER BY l.id DESC`, [Number(storefrontId)]);
}
async function getLead(id) {
  return get(`SELECT l.*, s.business_name, s.slug FROM leads l
    JOIN storefronts s ON s.id = l.storefront_id WHERE l.id = ?`, [id]);
}
async function createLead(storefrontId, { name, phone, service, message }) {
  const r = await client.execute({
    sql: `INSERT INTO leads (storefront_id, name, phone, service, message, status)
      VALUES (?, ?, ?, ?, ?, 'new')`,
    args: [storefrontId, name, phone, service || '', message || ''],
  });
  return numId(r.lastInsertRowid);
}
const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'];
async function setLeadStatus(id, status) {
  if (!LEAD_STATUSES.includes(status)) throw new Error('bad status');
  await client.execute('UPDATE leads SET status = ? WHERE id = ?', [status, id]);
}

// ---- review log ----
async function logReview(storefrontId, customerName, customerPhone, status) {
  await client.execute(
    'INSERT INTO review_log (storefront_id, customer_name, customer_phone, status) VALUES (?, ?, ?, ?)',
    [storefrontId, customerName, customerPhone, status]);
}
async function reviewsFor(storefrontId) {
  return rows('SELECT * FROM review_log WHERE storefront_id = ? ORDER BY id DESC LIMIT 50', [storefrontId]);
}

// ---- twilio lookup ----
function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }
async function findStorefrontByTwilioNumber(to) {
  const needle = digitsOnly(to).slice(-10);
  if (!needle) return null;
  const all = await rows("SELECT * FROM storefronts WHERE twilio_number != ''");
  for (const sf of all) {
    if (digitsOnly(sf.twilio_number).slice(-10) === needle) return sf;
  }
  return null;
}

module.exports = {
  init, allStorefronts, getStorefront, getStorefrontBySlug, slugTaken,
  createStorefront, updateStorefront, leadCounts,
  recentLeads, leadsFor, getLead, createLead, setLeadStatus, LEAD_STATUSES,
  logReview, reviewsFor, findStorefrontByTwilioNumber, digitsOnly,
};
