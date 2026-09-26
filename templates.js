// HTML templates — all user content escaped via esc(). Inline CSS only.
const { esc, telHref, smsHref, reviewUrl, SESSION_COOKIE } = require('./lib');

function svcList(sf) {
  try {
    const a = JSON.parse(sf.services || '[]');
    return Array.isArray(a) ? a.filter((s) => String(s).trim()) : [];
  } catch { return []; }
}

function statusBadge(status) {
  const colors = { new: '#b45309', contacted: '#1d4ed8', won: '#15803d', lost: '#6b7280' };
  const c = colors[status] || '#6b7280';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:${c}">${esc(status)}</span>`;
}

// ---------------- ADMIN ----------------

const ADMIN_CSS = `
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f3f4f6;color:#111827}
.topbar{background:#111827;color:#fff;padding:12px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.topbar a{color:#d1d5db;text-decoration:none;font-size:14px}
.topbar a.active{color:#fff;font-weight:700}
.topbar .brand{font-weight:800;color:#fff;margin-right:auto}
.wrap{max-width:1000px;margin:0 auto;padding:20px}
.card{background:#fff;border-radius:10px;padding:18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 12px}h2{font-size:18px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
th{color:#6b7280;font-weight:600;font-size:12px;text-transform:uppercase}
a{color:#1d4ed8}
.btn{display:inline-block;background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{background:#1e40af}.btn.gray{background:#6b7280}.btn.gray:hover{background:#4b5563}
.btn.small{padding:5px 10px;font-size:13px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px;color:#374151}
input[type=text],input[type=email],input[type=tel],input[type=password],textarea,select{width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit}
textarea{min-height:90px;resize:vertical}
input[type=color]{width:64px;height:40px;padding:2px;border:1px solid #d1d5db;border-radius:8px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.hint{font-size:12px;color:#6b7280;margin-top:3px}
.alert{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:14px}
.alert.err{background:#fee2e2;border-color:#ef4444}
.alert.ok{background:#dcfce7;border-color:#16a34a}
.muted{color:#6b7280;font-size:13px}
.copybox{background:#111827;color:#e5e7eb;border-radius:8px;padding:12px;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word}
.qrwrap{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}
`;

function adminShell(title, active, body) {
  const nav = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Storefront Admin</title><style>${ADMIN_CSS}</style></head>
<body><div class="topbar"><span class="brand">Storefront</span>
${nav('/admin', 'Dashboard', 'dash')}${nav('/admin/leads', 'Leads', 'leads')}
${nav('/admin/logout', 'Log out', '')}</div>
<div class="wrap">${body}</div></body></html>`;
}

function loginPage(error) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Log in · Storefront Admin</title><style>${ADMIN_CSS}</style></head>
<body><div class="wrap" style="max-width:420px;margin-top:60px">
<div class="card"><h1>Storefront Admin</h1>
${error ? `<div class="alert err">${esc(error)}</div>` : ''}
<form method="post" action="/admin/login">
<label for="token">Admin token</label>
<input type="password" id="token" name="token" autocomplete="current-password" required autofocus>
<div style="margin-top:14px"><button class="btn" type="submit">Log in</button></div>
</form></div></div></body></html>`;
}

function dashboardPage(storefronts, countsById, recent) {
  const cards = storefronts.map((sf) => {
    const c = countsById[sf.id] || { new: 0, total: 0 };
    return `<div class="card"><h2>${esc(sf.business_name)}</h2>
<div class="muted">${esc(sf.trade)} · <a href="/s/${esc(sf.slug)}" target="_blank">/s/${esc(sf.slug)}</a></div>
<div style="margin:10px 0">${c.new} new · ${c.total} total leads</div>
<div style="display:flex;gap:8px;flex-wrap:wrap">
<a class="btn small" href="/admin/storefronts/${sf.id}/edit">Edit</a>
<a class="btn small gray" href="/admin/storefronts/${sf.id}/reviews">Review tools</a>
<a class="btn small gray" href="/admin/leads?storefront=${sf.id}">Leads</a>
</div></div>`;
  }).join('') || '<div class="card"><p class="muted">No storefronts yet — create your first one.</p></div>';

  const leadRows = recent.map((l) => `<tr>
<td><a href="/admin/leads/${l.id}">${esc(l.name)}</a></td>
<td>${esc(l.business_name)}</td><td>${esc(l.service)}</td>
<td>${statusBadge(l.status)}</td><td class="muted">${esc(l.created_at)}</td></tr>`).join('');

  return adminShell('Dashboard', 'dash', `
<h1>Dashboard</h1>
<div style="margin-bottom:16px"><a class="btn" href="/admin/storefronts/new">+ New storefront</a></div>
${cards}
<div class="card"><h2>Recent leads</h2>
${recent.length ? `<table><thead><tr><th>Name</th><th>Business</th><th>Service</th><th>Status</th><th>Received</th></tr></thead><tbody>${leadRows}</tbody></table>`
: '<p class="muted">No leads yet.</p>'}</div>`);
}

function storefrontFormPage(sf, error) {
  const isNew = !sf;
  const v = (k) => esc(sf ? sf[k] : '');
  const servicesText = isNew ? '' : esc(svcList(sf).join('\n'));
  return adminShell(isNew ? 'New storefront' : 'Edit storefront', 'dash', `
<h1>${isNew ? 'New storefront' : 'Edit: ' + esc(sf.business_name)}</h1>
${error ? `<div class="alert err">${esc(error)}</div>` : ''}
<div class="card"><form method="post" action="${isNew ? '/admin/storefronts' : '/admin/storefronts/' + sf.id}">
<label for="business_name">Business name *</label>
<input type="text" id="business_name" name="business_name" value="${v('business_name')}" required>
<label for="slug">URL slug *</label>
<input type="text" id="slug" name="slug" value="${v('slug')}" required>
<div class="hint">Public page will live at /s/<span id="slugprev">${v('slug') || 'your-slug'}</span></div>
<div class="row2"><div>
<label for="trade">Trade</label>
<input type="text" id="trade" name="trade" value="${v('trade')}" placeholder="e.g. Excavation &amp; Land Clearing">
</div><div>
<label for="phone">Phone *</label>
<input type="tel" id="phone" name="phone" value="${v('phone')}" required>
</div></div>
<label for="email">Email</label>
<input type="email" id="email" name="email" value="${v('email')}">
<label for="tagline">Tagline</label>
<input type="text" id="tagline" name="tagline" value="${v('tagline')}" placeholder="One punchy sentence for the hero">
<label for="about">About</label>
<textarea id="about" name="about">${v('about')}</textarea>
<label for="services">Services (one per line)</label>
<textarea id="services" name="services">${servicesText}</textarea>
<div class="row2"><div>
<label for="service_area">Service area</label>
<input type="text" id="service_area" name="service_area" value="${v('service_area')}">
</div><div>
<label for="hours">Hours</label>
<input type="text" id="hours" name="hours" value="${v('hours')}" placeholder="e.g. Mon–Sat: 7 AM – 6 PM">
</div></div>
<div class="row2"><div>
<label for="theme_color">Theme color</label>
<input type="color" id="theme_color" name="theme_color" value="${esc(sf && sf.theme_color ? sf.theme_color : '#1d4ed8')}">
</div><div>
<label for="google_place_id">Google Place ID</label>
<input type="text" id="google_place_id" name="google_place_id" value="${v('google_place_id')}">
<div class="hint">Powers the "Review us on Google" button + QR. Find it via Google's Place ID finder.</div>
</div></div>
<label for="twilio_number">Twilio phone number</label>
<input type="tel" id="twilio_number" name="twilio_number" value="${v('twilio_number')}" placeholder="e.g. +15550102030">
<div class="hint">Enables missed-call text-back and review-request SMS for this storefront.</div>
<div style="margin-top:18px;display:flex;gap:10px">
<button class="btn" type="submit">${isNew ? 'Create storefront' : 'Save changes'}</button>
<a class="btn gray" href="/admin">Cancel</a></div>
</form></div>
<script>
(function(){
  var nameEl=document.getElementById('business_name'), slugEl=document.getElementById('slug'), prev=document.getElementById('slugprev'), touched=${isNew ? 'false' : 'true'};
  slugEl.addEventListener('input',function(){touched=true;prev.textContent=slugEl.value||'your-slug';});
  nameEl.addEventListener('input',function(){
    if(touched)return;
    var s=nameEl.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
    slugEl.value=s;prev.textContent=s||'your-slug';
  });
})();
</script>`);
}

function leadsPage(storefronts, selectedId, leads) {
  const opts = `<option value="all"${String(selectedId) === 'all' ? ' selected' : ''}>All storefronts</option>` +
    storefronts.map((s) => `<option value="${s.id}"${String(selectedId) === String(s.id) ? ' selected' : ''}>${esc(s.business_name)}</option>`).join('');
  const rows = leads.map((l) => `<tr>
<td><a href="/admin/leads/${l.id}?back=${encodeURIComponent('/admin/leads?storefront=' + selectedId)}">${esc(l.name)}</a></td>
<td><a href="tel:${esc(l.phone.replace(/\D/g, ''))}">${esc(l.phone)}</a></td>
<td>${esc(l.business_name)}</td><td>${esc(l.service)}</td>
<td>${statusBadge(l.status)}</td><td class="muted">${esc(l.created_at)}</td></tr>`).join('');
  return adminShell('Leads', 'leads', `
<h1>Leads inbox</h1>
<div class="card"><form method="get" action="/admin/leads" style="display:flex;gap:10px;align-items:end">
<div style="flex:1"><label for="storefront">Storefront</label>
<select id="storefront" name="storefront">${opts}</select></div>
<div><button class="btn" type="submit">Filter</button></div></form></div>
<div class="card">${leads.length ? `<table><thead><tr><th>Name</th><th>Phone</th><th>Business</th><th>Service</th><th>Status</th><th>Received</th></tr></thead><tbody>${rows}</tbody></table>`
: '<p class="muted">No leads match this filter.</p>'}</div>`);
}

function leadDetailPage(lead, back, statuses) {
  const opts = statuses.map((s) => `<option value="${s}"${lead.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('');
  return adminShell('Lead: ' + lead.name, 'leads', `
<h1>Lead</h1>
<div class="card">
<table><tbody>
<tr><th style="width:140px">Name</th><td>${esc(lead.name)}</td></tr>
<tr><th>Phone</th><td><a href="tel:${esc(lead.phone.replace(/\D/g, ''))}">${esc(lead.phone)}</a></td></tr>
<tr><th>Business</th><td>${esc(lead.business_name)} (<a href="/s/${esc(lead.slug)}" target="_blank">view page</a>)</td></tr>
<tr><th>Service</th><td>${esc(lead.service) || '<span class="muted">—</span>'}</td></tr>
<tr><th>Message</th><td>${esc(lead.message) ? esc(lead.message).replace(/\n/g, '<br>') : '<span class="muted">—</span>'}</td></tr>
<tr><th>Received</th><td class="muted">${esc(lead.created_at)}</td></tr>
<tr><th>Status</th><td>${statusBadge(lead.status)}</td></tr>
</tbody></table>
<form method="post" action="/admin/leads/${lead.id}/status" style="margin-top:14px;display:flex;gap:10px;align-items:end">
<input type="hidden" name="back" value="${esc(back)}">
<div><label for="status">Change status</label><select id="status" name="status">${opts}</select></div>
<div><button class="btn" type="submit">Update</button></div></form>
<div style="margin-top:12px"><a class="btn gray small" href="${esc(back)}">← Back to inbox</a></div>
</div>`);
}

function reviewToolsPage(sf, twilioOk, result, reviews, reviewLinkText) {
  const hasPlace = !!sf.google_place_id;
  const url = hasPlace ? reviewUrl(sf.google_place_id) : '';
  const canSms = twilioOk && !!sf.twilio_number;
  let resultHtml = '';
  if (result) {
    if (result.mode === 'sent') {
      resultHtml = result.ok
        ? `<div class="alert ok">Review request sent by SMS to ${esc(result.to)}.</div>`
        : `<div class="alert err">SMS failed: ${esc(result.error)}</div>`;
    } else {
      resultHtml = `<div class="alert">Twilio isn't connected, so here's the message to send manually:</div>
<div class="copybox" id="manualmsg">${esc(result.text)}</div>
<div style="margin-top:8px"><button class="btn small" type="button" onclick="navigator.clipboard.writeText(document.getElementById('manualmsg').innerText)">Copy message</button></div>`;
    }
  }
  const reviewRows = reviews.map((r) => `<tr><td>${esc(r.customer_name)}</td><td>${esc(r.customer_phone)}</td>
<td>${esc(r.status)}</td><td class="muted">${esc(r.sent_at)}</td></tr>`).join('');
  return adminShell('Review tools', 'dash', `
<h1>Review tools: ${esc(sf.business_name)}</h1>
${resultHtml}
<div class="card"><h2>Google review link</h2>
${hasPlace ? `<div class="qrwrap"><div id="qrcode"></div>
<div><p><a href="${esc(url)}" target="_blank">${esc(url)}</a></p>
<p class="muted">Put this link behind the "Review us on Google" button and print the QR code for job-site flyers, invoices, and the truck.</p></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('qrcode'),{text:${JSON.stringify(url)},width:180,height:180});</script>`
: `<div class="alert">No Google Place ID set for this storefront — review links are disabled until you add one. <a href="/admin/storefronts/${sf.id}/edit">Add it in settings</a>.</div>`}
</div>
<div class="card"><h2>Send a review request</h2>
${hasPlace ? `<form method="post" action="/admin/storefronts/${sf.id}/review-request">
<div class="row2"><div><label for="customer_name">Customer name *</label>
<input type="text" id="customer_name" name="customer_name" required></div>
<div><label for="customer_phone">Customer phone *</label>
<input type="tel" id="customer_phone" name="customer_phone" required></div></div>
<div style="margin-top:14px"><button class="btn" type="submit">${canSms ? 'Send SMS now' : 'Generate message text'}</button></div>
${canSms ? '' : '<div class="hint">Twilio is not connected for this storefront, so you\'ll get copy-paste text to send from your own phone.</div>'}
</form>` : '<p class="muted">Add a Google Place ID first.</p>'}
<p class="muted" style="margin-top:10px">Message preview:</p>
<div class="copybox">${esc(reviewLinkText)}</div></div>
<div class="card"><h2>Request history</h2>
${reviews.length ? `<table><thead><tr><th>Customer</th><th>Phone</th><th>Status</th><th>Sent</th></tr></thead><tbody>${reviewRows}</tbody></table>`
: '<p class="muted">No review requests sent yet.</p>'}</div>
<div><a class="btn gray small" href="/admin">← Back to dashboard</a></div>`);
}

// ---------------- PUBLIC ----------------

function publicPage(sf) {
  const services = svcList(sf);
  const color = /^#[0-9a-fA-F]{6}$/.test(sf.theme_color || '') ? sf.theme_color : '#1d4ed8';
  const hasReview = !!sf.google_place_id;
  const tel = telHref(sf.phone), sms = smsHref(sf.phone);
  const serviceOpts = services.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(sf.business_name)}${sf.trade ? ' — ' + esc(sf.trade) : ''}</title>
<meta name="description" content="${esc(sf.tagline || sf.trade || sf.business_name)}">
<style>
:root{--brand:${esc(color)}}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;color:#111827;background:#fff;line-height:1.5}
.sticky{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 14px;display:flex;align-items:center;gap:10px}
.sticky .name{font-weight:800;font-size:16px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sticky a.btn{flex:0 0 auto}
.btn{display:inline-block;background:var(--brand);color:#fff;border:0;border-radius:10px;padding:11px 18px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center}
.btn.ghost{background:#f3f4f6;color:#111827}
.hero{background:linear-gradient(135deg,var(--brand),#111827);color:#fff;padding:44px 20px;text-align:center}
.hero .trade{display:inline-block;background:rgba(255,255,255,.18);border-radius:999px;padding:4px 14px;font-size:13px;font-weight:600;margin-bottom:12px}
.hero h1{margin:0 0 8px;font-size:30px;line-height:1.2}
.hero p{margin:0 auto 20px;max-width:34em;font-size:16px;opacity:.92}
.hero .cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.hero .cta .btn{background:#fff;color:#111827}
.hero .cta .btn.call{background:var(--brand);color:#fff;border:2px solid #fff}
.wrap{max-width:640px;margin:0 auto;padding:0 18px}
section{padding:26px 0;border-bottom:1px solid #f0f0f0}
h2{font-size:20px;margin:0 0 12px}
ul.services{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.services li{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;font-weight:600}
ul.services li::before{content:"✓ ";color:var(--brand);font-weight:800}
.kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:15px}
.kv dt{color:#6b7280;font-weight:600}.kv dd{margin:0}
label{display:block;font-size:13px;font-weight:700;margin:12px 0 4px}
input,textarea,select{width:100%;padding:11px;border:1px solid #d1d5db;border-radius:10px;font-size:16px;font-family:inherit}
textarea{min-height:90px;resize:vertical}
form .btn{width:100%;margin-top:14px;padding:14px}
.footer{background:#111827;color:#9ca3af;padding:26px 18px;text-align:center;font-size:13px;margin-top:10px}
.footer a{color:#d1d5db}
.reviewbtn{display:block;margin-top:10px}
</style></head><body>
<div class="sticky"><span class="name">${esc(sf.business_name)}</span>
<a class="btn ghost" href="${esc(sms)}">Text</a><a class="btn" href="${esc(tel)}">Call</a></div>
<div class="hero">
${sf.trade ? `<span class="trade">${esc(sf.trade)}</span>` : ''}
<h1>${esc(sf.business_name)}</h1>
${sf.tagline ? `<p>${esc(sf.tagline)}</p>` : ''}
<div class="cta"><a class="btn call" href="${esc(tel)}">Call ${esc(sf.phone)}</a><a class="btn" href="#quote">Get a free quote</a></div>
</div>
<div class="wrap">
${services.length ? `<section><h2>Services</h2><ul class="services">${services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>` : ''}
${sf.about || sf.service_area || sf.hours ? `<section><h2>About</h2>
${sf.about ? `<p>${esc(sf.about)}</p>` : ''}
<dl class="kv">
${sf.service_area ? `<dt>Service area</dt><dd>${esc(sf.service_area)}</dd>` : ''}
${sf.hours ? `<dt>Hours</dt><dd>${esc(sf.hours)}</dd>` : ''}
${sf.email ? `<dt>Email</dt><dd><a href="mailto:${esc(sf.email)}">${esc(sf.email)}</a></dd>` : ''}
</dl></section>` : ''}
<section id="quote"><h2>Get a free quote</h2>
<p style="color:#4b5563;margin-top:0">Tell us what you need — we'll call you back, usually same day.</p>
<form method="post" action="/s/${esc(sf.slug)}/quote">
<label for="qname">Your name *</label><input id="qname" name="name" type="text" required autocomplete="name">
<label for="qphone">Phone *</label><input id="qphone" name="phone" type="tel" required autocomplete="tel" placeholder="(555) 000-0000">
${services.length ? `<label for="qservice">Service</label><select id="qservice" name="service"><option value="">— Pick one —</option>${serviceOpts}</select>` : ''}
<label for="qmessage">What do you need done?</label><textarea id="qmessage" name="message" placeholder="A few details help us quote faster"></textarea>
<button class="btn" type="submit">Request my free quote</button>
</form></section>
${hasReview ? `<section><h2>Happy with our work?</h2>
<p style="color:#4b5563;margin-top:0">A Google review takes 30 seconds and helps our small business more than you know.</p>
<a class="btn reviewbtn" href="${esc(reviewUrl(sf.google_place_id))}" target="_blank" rel="noopener">Review us on Google</a></section>` : ''}
</div>
<div class="footer">${esc(sf.business_name)}${sf.phone ? ` · <a href="${esc(tel)}">${esc(sf.phone)}</a>` : ''}<br>
<span style="font-size:12px">Powered by <b>Storefront</b> · Ghost Developer Studio</span></div>
</body></html>`;
}

function quoteThanksPage(sf, name) {
  const color = /^#[0-9a-fA-F]{6}$/.test(sf.theme_color || '') ? sf.theme_color : '#1d4ed8';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thanks! · ${esc(sf.business_name)}</title>
<style>:root{--brand:${esc(color)}}*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f8fafc;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:14px;padding:34px 28px;max-width:440px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.check{font-size:52px}.btn{display:inline-block;background:var(--brand);color:#fff;border-radius:10px;padding:12px 22px;font-weight:700;text-decoration:none;margin:6px}
h1{font-size:22px;margin:12px 0 8px}p{color:#4b5563}</style></head><body>
<div class="card"><div class="check">✓</div>
<h1>Thanks${name ? ', ' + esc(name) : ''}!</h1>
<p><b>${esc(sf.business_name)}</b> got your request and will call you back — usually the same day.</p>
<div style="margin-top:18px"><a class="btn" href="tel:${esc(sf.phone.replace(/\D/g, ''))}">Need us sooner? Call now</a><br>
<a href="/s/${esc(sf.slug)}" style="color:#6b7280;font-size:14px">← Back to ${esc(sf.business_name)}</a></div></div>
</body></html>`;
}

function splashPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Storefront · Ghost Developer Studio</title>
<style>body{font-family:system-ui,sans-serif;background:#111827;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px;text-align:center}
h1{font-size:28px}.btn{display:inline-block;background:#7c3aed;color:#fff;border-radius:10px;padding:12px 24px;font-weight:700;text-decoration:none;margin:6px}
.btn.ghost{background:#374151}p{color:#9ca3af;max-width:32em}</style></head><body>
<div><h1>👻 Storefront</h1><p>One-page websites for trades businesses — with quote forms, Google review tools, and missed-call text-back. By Ghost Developer Studio.</p>
<div><a class="btn" href="/s/blue-ridge-excavating">View demo storefront</a><a class="btn ghost" href="/admin">Admin login</a></div></div>
</body></html>`;
}

module.exports = {
  adminShell, loginPage, dashboardPage, storefrontFormPage, leadsPage,
  leadDetailPage, reviewToolsPage, publicPage, quoteThanksPage, splashPage,
  svcList, statusBadge,
};
