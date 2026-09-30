/**
 * Ambrosia — Zelle orders. Google Apps Script bound to the orders spreadsheet.
 *
 * Deploy: Extensions -> Apps Script, paste this file, then
 *   Project Settings -> Script properties:
 *     SECRET        same value as APPS_SCRIPT_SECRET in Vercel
 *     OWNER_EMAILS  comma-separated, e.g. philip@...,brittney@...
 *   Deploy -> New deployment -> Web app
 *     Execute as: Me    Who has access: Anyone
 *   Copy the /exec URL into APPS_SCRIPT_URL in Vercel.
 * Emails are sent with MailApp from the Google account that owns the script
 * (Workspace: 1,500/day; consumer Gmail: 100/day).
 */

var SHEET = 'Orders';
var HEADERS = [
  'Order Number', 'Timestamp', 'Status', 'Customer Name', 'Email', 'Phone',
  'Shipping Address', 'Shipping State', 'Items', 'Subtotal', 'Discount Code',
  'Discount Amount', 'Shipping', 'Tax Charged', 'Estimated Tax Owed', 'Total',
  'Age 21+ Confirmed', 'Research-Use/Terms Confirmed', 'Notes',
  // system columns — leave in place, used to restore orders and prevent duplicates
  'Shipping Method', 'Tax Mode', 'Customer Marked Sent', 'Items JSON', 'Idempotency Key', 'Access Token'
];
var C = {}; HEADERS.forEach(function (h, i) { C[h] = i; });
var STATUSES = ['Awaiting Zelle payment', 'Payment received', 'Shipped', 'Cancelled'];
var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    if (!req.secret || req.secret !== props.getProperty('SECRET')) throw err('FORBIDDEN', 'Forbidden');
    if (req.action === 'create') out = create(req);
    else if (req.action === 'get') out = { ok: true, order: publicView(findRow(req.orderNumber, req.token)) };
    else if (req.action === 'markSent') out = markSent(req);
    else if (req.action === 'resend') out = resend(req);
    else throw err('BAD_ACTION', 'Unknown action');
  } catch (x) {
    out = { ok: false, code: x.code || 'ERROR', error: String(x.message || x) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function err(code, msg) { var e = new Error(msg); e.code = code; return e; }

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
    sh.hideColumns(C['Items JSON'] + 1, 3);
  }
  return sh;
}

function rows() {
  var sh = sheet();
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
}

function findRow(orderNumber, token) {
  var all = rows();
  for (var i = 0; i < all.length; i++) {
    if (all[i][C['Order Number']] === orderNumber && all[i][C['Access Token']] === token) return { index: i + 2, row: all[i] };
  }
  throw err('NOT_FOUND', 'Order not found');
}

function newNumber(taken) {
  for (var tries = 0; tries < 50; tries++) {
    var s = 'AMB-';
    for (var i = 0; i < 6; i++) s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    if (!taken[s]) return s;
  }
  throw err('ERROR', 'Could not allocate an order number');
}

var d = function (c) { return Math.round(c) / 100; };

function create(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var result;
  try {
    var all = rows(), taken = {};
    for (var i = 0; i < all.length; i++) {
      taken[all[i][C['Order Number']]] = true;
      if (all[i][C['Idempotency Key']] === req.idempotencyKey) {
        return { ok: true, existing: true, order: publicView({ index: i + 2, row: all[i] }) };
      }
    }
    var o = req.order, q = o.quote, c = o.customer;
    var number = newNumber(taken);
    var token = Utilities.getUuid().replace(/-/g, '');
    var address = [c.street, c.apt, c.city, c.state + ' ' + c.zip].filter(String).join(', ');
    var row = [];
    row[C['Order Number']] = number;
    row[C['Timestamp']] = new Date();
    row[C['Status']] = STATUSES[0];
    row[C['Customer Name']] = c.name;
    row[C['Email']] = c.email;
    row[C['Phone']] = "'" + c.phone;
    row[C['Shipping Address']] = address;
    row[C['Shipping State']] = c.state;
    row[C['Items']] = q.items.map(function (it) { return it.name + ' ' + it.mass + ' x ' + it.qty; }).join('; ');
    row[C['Subtotal']] = d(q.subtotal);
    row[C['Discount Code']] = 'ZELLE25';
    row[C['Discount Amount']] = d(q.discount);
    row[C['Shipping']] = d(q.shipping);
    row[C['Tax Charged']] = d(q.taxCharged);
    row[C['Estimated Tax Owed']] = d(q.taxEstimated);
    row[C['Total']] = d(q.total);
    row[C['Age 21+ Confirmed']] = o.attest.ageAt;
    row[C['Research-Use/Terms Confirmed']] = o.attest.termsAt;
    row[C['Notes']] = o.notes || '';
    row[C['Shipping Method']] = q.shipLabel + (q.freeShipping ? ' (free)' : '');
    row[C['Tax Mode']] = q.taxMode;
    row[C['Customer Marked Sent']] = '';
    row[C['Items JSON']] = JSON.stringify({ q: q, c: c, notes: o.notes || '' });
    row[C['Idempotency Key']] = req.idempotencyKey;
    row[C['Access Token']] = token;
    var sh = sheet();
    sh.appendRow(row);
    var index = sh.getLastRow();
    sh.getRange(index, C['Subtotal'] + 1, 1, 7).setNumberFormat('$#,##0.00');
    SpreadsheetApp.flush();
    result = { index: index, row: row };
  } finally {
    lock.releaseLock();
  }
  var view = publicView(result);
  try { sendCustomer(view, req.zelle, req.support); } catch (x) { console.error('customer email failed', x); }
  try { sendOwners(view, result.row, req.zelle); } catch (x) { console.error('owner email failed', x); }
  return { ok: true, order: view };
}

function publicView(hit) {
  var r = hit.row, j = JSON.parse(r[C['Items JSON']] || '{}');
  var q = j.q || {}, c = j.c || {};
  return {
    number: r[C['Order Number']], token: r[C['Access Token']], status: r[C['Status']],
    createdAt: new Date(r[C['Timestamp']]).toISOString(),
    customerSentAt: r[C['Customer Marked Sent']] ? new Date(r[C['Customer Marked Sent']]).toISOString() : null,
    customer: c, notes: j.notes || '',
    items: q.items || [], subtotal: q.subtotal, discount: q.discount, discountLabel: q.discountLabel,
    shipping: q.shipping, shipLabel: q.shipLabel, taxCharged: q.taxCharged, total: q.total
  };
}

function markSent(req) {
  var hit = findRow(req.orderNumber, req.token);
  if (!hit.row[C['Customer Marked Sent']]) sheet().getRange(hit.index, C['Customer Marked Sent'] + 1).setValue(new Date());
  return { ok: true };
}

function resend(req) {
  var cache = CacheService.getScriptCache(), k = 'resend:' + req.orderNumber;
  if (cache.get(k)) return { ok: true, throttled: true };
  var view = publicView(findRow(req.orderNumber, req.token));
  sendCustomer(view, req.zelle, req.support);
  cache.put(k, '1', 120);
  return { ok: true };
}

/* ------------------------------ email ------------------------------ */

function money(c) { return '$' + (Number(c || 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

function summaryHtml(v) {
  var line = function (l, r, strong) {
    return '<tr><td style="padding:6px 0;font-size:14px;color:#3C312C">' + l + '</td><td align="right" style="padding:6px 0;font-size:' + (strong ? '20px' : '14px') + ';color:#241C19' + (strong ? ';font-weight:600' : '') + '">' + r + '</td></tr>';
  };
  var h = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">';
  v.items.forEach(function (it) { h += line(esc(it.name) + ' &middot; ' + esc(it.mass) + ' &times; ' + it.qty, money(it.line)); });
  h += line('Subtotal', money(v.subtotal));
  if (v.discount) h += line(esc(v.discountLabel), '&minus;' + money(v.discount));
  h += line('Shipping (' + esc(v.shipLabel) + ')', v.shipping ? money(v.shipping) : 'Free');
  if (v.taxCharged) h += line('Tax', money(v.taxCharged));
  h += line('Total', money(v.total), true);
  return h + '</table>';
}

function shell(inner) {
  return '<div style="background:#F0E9DC;padding:32px 16px;font-family:Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#F0E9DC;border:1px solid #C9A227;padding:32px">'
    + '<div style="font-family:Georgia,serif;letter-spacing:0.3em;color:#6B1F28;font-size:18px;margin-bottom:24px">AMBROSIA</div>'
    + inner
    + '<p style="font-size:11px;line-height:1.7;color:#6E6055;margin-top:28px">For research use only. Not for human use. Ambrosia Research Supply Company, LLC &middot; Nashville, TN</p></div></div>';
}

function sendCustomer(v, zelle, support) {
  var body = '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;color:#6B1F28;margin:0 0 12px">Complete your payment.</h1>'
    + '<p style="font-size:15px;color:#241C19;margin:0 0 20px">Send <b>' + money(v.total) + '</b> via Zelle to finish order <b style="color:#6B1F28">' + v.number + '</b>.</p>'
    + '<table cellpadding="0" cellspacing="0" style="font-size:14px;color:#241C19;margin-bottom:20px">'
    + '<tr><td style="padding:4px 16px 4px 0;color:#6E6055">Zelle email</td><td>' + esc(zelle.email) + '</td></tr>'
    + '<tr><td style="padding:4px 16px 4px 0;color:#6E6055">Zelle name</td><td>' + esc(zelle.name) + '</td></tr>'
    + '<tr><td style="padding:4px 16px 4px 0;color:#6E6055">Order number</td><td style="color:#6B1F28;font-weight:600">' + v.number + '</td></tr></table>'
    + '<ol style="font-size:14px;line-height:1.7;color:#3C312C;padding-left:20px;margin:0 0 20px"><li>Open your banking app and choose Zelle.</li><li>Send the exact amount to the email above.</li><li>Type your order number in the memo or note field.</li></ol>'
    + '<p style="font-size:13px;line-height:1.7;color:#3C312C">Your order ships after payment is confirmed. Include your order number so we can match your payment.</p>'
    + '<h2 style="font-size:11px;letter-spacing:0.2em;color:#7A5622;margin:28px 0 8px">ORDER SUMMARY</h2>' + summaryHtml(v)
    + '<h2 style="font-size:11px;letter-spacing:0.2em;color:#7A5622;margin:28px 0 8px">SHIP TO</h2><p style="font-size:14px;line-height:1.6;color:#241C19;margin:0">' + esc(v.customer.name) + '<br>' + esc([v.customer.street, v.customer.apt].filter(String).join(', ')) + '<br>' + esc(v.customer.city + ', ' + v.customer.state + ' ' + v.customer.zip) + '</p>'
    + '<p style="font-size:13px;color:#3C312C;margin-top:24px">Questions? ' + esc(support.email) + '</p>';
  MailApp.sendEmail({ to: v.customer.email, subject: 'Your Ambrosia order ' + v.number + ': payment instructions', htmlBody: shell(body), name: 'Ambrosia', replyTo: support.email });
}

function sendOwners(v, row) {
  var to = PropertiesService.getScriptProperties().getProperty('OWNER_EMAILS');
  if (!to) return;
  var c = v.customer;
  var body = '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;color:#6B1F28;margin:0 0 16px">New Zelle order ' + v.number + '</h1>'
    + '<p style="font-size:14px;line-height:1.7;color:#241C19">' + esc(c.name) + '<br>' + esc(c.email) + ' &middot; ' + esc(c.phone) + '<br>' + esc(row[C['Shipping Address']]) + '</p>'
    + summaryHtml(v)
    + '<p style="font-size:13px;line-height:1.7;color:#3C312C">Estimated tax owed: ' + money(Math.round(row[C['Estimated Tax Owed']] * 100)) + ' (' + esc(row[C['Tax Mode']]) + ')<br>Age 21+ confirmed: ' + esc(row[C['Age 21+ Confirmed']]) + '<br>Research-use/Terms confirmed: ' + esc(row[C['Research-Use/Terms Confirmed']]) + (v.notes ? '<br>Notes: ' + esc(v.notes) : '') + '</p>'
    + '<p style="font-size:13px;color:#3C312C">Status: Awaiting Zelle payment. Match the memo ' + v.number + ' against incoming Zelle payments, then set Status to "Payment received".</p>';
  MailApp.sendEmail({ to: to, subject: 'Zelle order ' + v.number + ' · ' + money(v.total), htmlBody: shell(body), name: 'Ambrosia Orders' });
}
