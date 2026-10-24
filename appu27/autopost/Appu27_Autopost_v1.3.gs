// APPU27 AUTOPOST v1.3 - pulls robot posts from GitHub, reels, instant approval (email button OR type yes in the sheet).
const CFG = {
  FOLDER: 'Appu27 - Ready to post',     // you can still drop images here by hand
  SHEET: 'Appu27 Queue',
  GRAPH: 'https://graph.instagram.com/v23.0',
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzOQV6iArNbFbYKWCQgOtb6YjdBuSmYzTUdV68VciI3QCWM7S3uH3_9usJ-xZFzWL2Txg/exec',
  APPROVER: '',                         // blank = your own Gmail
  DEFAULT_TAGS: '#KBFC #KeralaBlasters #ISL #Manjappada #Appu27 #IndianFootball',
  FOOTBALL: 'https://v3.football.api-sports.io',
  JOBS: 'https://raw.githubusercontent.com/bullpranav-code/instagram-automation/main/appu27/jobs/'
};
const HEAD = ['Added', 'Status', 'Type', 'Files', 'Caption', 'Result', 'Group', 'Preview'];
const YES = /^(ok|okay|yes|y|approve|approved|post|go|\u2705|\ud83d\udc4d)\.?$/i;

/* ---------- one-time setup (run again after updating to v1.2) ---------- */
function setup() {
  folder_(); const q = queue_();
  const me = igMe_();
  const p = PropertiesService.getScriptProperties();
  p.setProperty('IG_USER_ID', String(me.user_id || me.id));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scan').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('refreshToken').timeBased().everyDays(7).create();
  ScriptApp.newTrigger('onQueueEdit').forSpreadsheet(q.getParent().getId()).onEdit().create();
  Logger.log('Connected to @' + me.username + '. Robot key: ' + secret_());
}

/* ---------- A. robot intake (GitHub bot calls this) ---------- */
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'bad json' }); }
  if (b.k !== secret_()) return json_({ ok: false, error: 'bad key' });
  if (b.action === 'football') return football_(b.path);
  if (b.action === 'queue') {
    const q = queue_();
    if (b.group && q.getLastRow() > 1 && q.getRange(2, 7, q.getLastRow() - 1, 1).getValues().some(r => r[0] === b.group))
      return json_({ ok: true, duplicate: true });
    let cap = String(b.caption || '');
    if (b.type !== 'STORY' && cap.indexOf('#') < 0) cap = (cap + '\n\n' + CFG.DEFAULT_TAGS).trim();
    q.appendRow([new Date(), 'Waiting approval', b.type, (b.files || []).join(','), b.type === 'STORY' ? '' : cap, '', b.group || '', b.preview || '']);
    askApproval_(q.getLastRow());
    return json_({ ok: true, row: q.getLastRow() });
  }
  return json_({ ok: false, error: 'unknown action' });
}
function football_(path) {
  const key = PropertiesService.getScriptProperties().getProperty('FOOTBALL_KEY');
  if (!key) return json_({ ok: false, error: 'FOOTBALL_KEY missing' });
  if (!/^\/[a-z]+(\?[\w=&%:.,-]*)?$/i.test(String(path || ''))) return json_({ ok: false, error: 'bad path' });
  const r = UrlFetchApp.fetch(CFG.FOOTBALL + path, { headers: { 'x-apisports-key': key }, muteHttpExceptions: true });
  return ContentService.createTextOutput(r.getContentText()).setMimeType(ContentService.MimeType.JSON);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- A2. robot posts published on GitHub (no keys needed) ---------- */
function pullRobotJobs_() {
  const idx = UrlFetchApp.fetch(CFG.JOBS + 'index.json?t=' + Date.now(), { muteHttpExceptions: true });
  if (idx.getResponseCode() !== 200) return;
  const q = queue_();
  const seen = {};
  if (q.getLastRow() > 1) q.getRange(2, 7, q.getLastRow() - 1, 1).getValues().forEach(r => seen[r[0]] = 1);
  JSON.parse(idx.getContentText()).forEach(name => {
    const r = UrlFetchApp.fetch(CFG.JOBS + name + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return;
    const b = JSON.parse(r.getContentText());
    if (!b.group || seen[b.group]) return;
    let cap = String(b.caption || '');
    if (b.type !== 'STORY' && cap.indexOf('#') < 0) cap = (cap + '\n\n' + CFG.DEFAULT_TAGS).trim();
    q.appendRow([new Date(), 'Waiting approval', b.type, (b.files || []).join(','), b.type === 'STORY' ? '' : cap, '', b.group, b.preview || '']);
    seen[b.group] = 1;
    askApproval_(q.getLastRow());
  });
}
function pullNow() { pullRobotJobs_(); }   // run by hand to fetch robot posts immediately

/* ---------- A3. public match data for the robot (scores are public; cached to save API quota) ---------- */
function matchData_(p) {
  const c = CacheService.getScriptCache(), key = 'md_' + (p.from || '') + (p.to || '') + (p.id || '');
  const hit = c.get(key); if (hit) return hit;
  const k = PropertiesService.getScriptProperties().getProperty('FOOTBALL_KEY');
  if (!k) return JSON.stringify({ error: 'FOOTBALL_KEY missing' });
  let path;
  if (p.id && /^\d+$/.test(p.id)) path = '/fixtures?id=' + p.id;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(p.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(p.to || '')) path = '/fixtures?league=' + (p.league || 323) + '&season=' + (p.season || 2026) + '&from=' + p.from + '&to=' + p.to + '&timezone=Asia/Kolkata';
  else if (p.what === 'leagues') path = '/leagues?search=indian%20super';
  else if (p.what === 'standings') path = '/standings?league=' + (p.league || 323) + '&season=' + (p.season || 2026);
  else return JSON.stringify({ error: 'bad request' });
  const t = UrlFetchApp.fetch(CFG.FOOTBALL + path, { headers: { 'x-apisports-key': k }, muteHttpExceptions: true }).getContentText();
  try { c.put(key, t, p.id ? 1800 : 600); } catch (e) {}
  return t;
}

/* ---------- B. manual drops in the Drive folder (story_*, carousel_NAME_1.., anything else = post) ---------- */
function scan() {
  postApprovedInSheet_();
  try { pullRobotJobs_(); } catch (e) { Logger.log('robot: ' + e); }
  const f = folder_(), q = queue_();
  const known = {};
  if (q.getLastRow() > 1) q.getRange(2, 4, q.getLastRow() - 1, 1).getValues().forEach(r => String(r[0]).split(',').forEach(id => known[id] = 1));
  const imgs = [], caps = {};
  const it = f.getFiles();
  while (it.hasNext()) {
    const x = it.next(), n = x.getName(), m = x.getMimeType();
    if (/^image\//.test(m)) { if (!known[x.getId()]) imgs.push(x); }
    else caps[n.replace(/\.(txt|docx?)$/i, '').toLowerCase()] = x;
  }
  if (!imgs.length) return;
  imgs.sort((a, b) => a.getName().localeCompare(b.getName(), undefined, { numeric: true }));
  const groups = {};
  imgs.forEach(x => {
    const base = x.getName().replace(/\.\w+$/, '').toLowerCase();
    const c = base.match(/^carousel_(.+)_\d+$/);
    const key = c ? 'carousel_' + c[1] : base;
    const type = c ? 'CAROUSEL' : /^story_/.test(base) ? 'STORY' : 'POST';
    (groups[key] = groups[key] || { type: type, files: [] }).files.push(x);
  });
  Object.keys(groups).forEach(key => {
    const g = groups[key], capFile = caps[key];
    let caption = '';
    if (capFile) caption = capFile.getMimeType() === MimeType.GOOGLE_DOCS ? DocumentApp.openById(capFile.getId()).getBody().getText() : capFile.getBlob().getDataAsString();
    if (g.type !== 'STORY' && caption.indexOf('#') < 0) caption = (caption + '\n\n' + CFG.DEFAULT_TAGS).trim();
    q.appendRow([new Date(), 'Waiting approval', g.type, g.files.map(x => x.getId()).join(','), g.type === 'STORY' ? '' : caption, '', key, '']);
    askApproval_(q.getLastRow());
  });
}

/* ---------- C. approval: type yes / ok / okay in the Status cell = posts immediately ---------- */
function onQueueEdit(e) {
  const r = e && e.range;
  if (!r || r.getColumn() !== 2 || r.getRow() < 2 || r.getSheet().getIndex() !== 1) return;
  if (YES.test(String(r.getValue()).trim())) postRow_(r.getRow());
}
function postApprovedInSheet_() {          // safety net, runs every 10 minutes
  const q = queue_();
  if (q.getLastRow() < 2) return;
  q.getRange(2, 2, q.getLastRow() - 1, 1).getValues().forEach((v, i) => { if (YES.test(String(v[0]).trim())) postRow_(i + 2); });
}
function postRow_(row) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 'busy';
  const q = queue_();
  try {
    const r = q.getRange(row, 1, 1, 8).getValues()[0];
    if (r[1] === 'Posted' || r[1] === 'Posting...') return 'already';
    if (!r[3]) return 'empty';
    q.getRange(row, 2).setValue('Posting...'); SpreadsheetApp.flush();
    const id = publish_(r[2], String(r[3]).split(','), String(r[4] || ''));
    q.getRange(row, 2).setValue('Posted'); q.getRange(row, 6).setValue('Media ' + id + ' at ' + new Date());
    return 'posted';
  } catch (err) {
    q.getRange(row, 2).setValue('Failed'); q.getRange(row, 6).setValue(String(err.message || err).slice(0, 400));
    return 'failed: ' + (err.message || err);
  } finally { lock.releaseLock(); }
}

/* ---------- D. approval email ---------- */
function askApproval_(row) {
  const q = queue_(), r = q.getRange(row, 1, 1, 8).getValues()[0];
  const link = a => CFG.WEBAPP_URL + '?a=' + a + '&row=' + row + '&k=' + secret_();
  const items = String(r[3]).split(','), inline = {};
  const shots = r[7] ? String(r[7]).split(',') : items;
  let imgs = '';
  shots.slice(0, 10).forEach((id, i) => {
    try {
      const blob = /^https?:/.test(id) ? UrlFetchApp.fetch(id).getBlob() : DriveApp.getFileById(id).getBlob();
      if (!/^image\//.test(blob.getContentType())) return;
      inline['i' + i] = blob; imgs += '<img src="cid:i' + i + '" style="width:260px;margin:4px;border-radius:12px">';
    } catch (x) {}
  });
  const vids = items.filter(u => /\.mp4($|\?)/i.test(u)).map(u => '<p><a href="' + u + '">&#9654; Watch the video</a></p>').join('');
  const html = '<div style="font-family:Arial;max-width:600px">' +
    '<p style="font-size:13px;color:#888;margin:0">APPU27 &middot; ' + r[2] + '</p><h2 style="margin:4px 0 12px">Ready to post?</h2>' + imgs + vids +
    (r[4] ? '<pre style="white-space:pre-wrap;font-family:Arial;background:#f5f5f5;padding:12px;border-radius:10px">' + esc_(r[4]) + '</pre>' : '<p><i>Story (no caption).</i></p>') +
    '<p><a href="' + link('ok') + '" style="background:#16A34A;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold">&#9989; Approve &amp; post</a> &nbsp; ' +
    '<a href="' + link('no') + '" style="color:#c00">&#10060; Reject</a></p>' +
    '<p style="font-size:12px;color:#888">Or open the "' + CFG.SHEET + '" sheet and type <b>yes</b> in the Status cell of row ' + row + '. It posts immediately. ' +
    'To change the caption, edit the Caption cell first.</p></div>';
  MailApp.sendEmail({ to: CFG.APPROVER || Session.getEffectiveUser().getEmail(), subject: 'Appu27: approve ' + String(r[2]).toLowerCase() + ' "' + r[6] + '"', htmlBody: html, inlineImages: inline });
}

/* ---------- E. approve link ---------- */
function doGet(e) {
  const p = e.parameter || {};
  if (p.a === 'data') return ContentService.createTextOutput(matchData_(p)).setMimeType(ContentService.MimeType.JSON);
  if (p.k !== secret_()) return msg_('Link expired or wrong.');
  const q = queue_(), row = Number(p.row);
  if (!(row > 1)) return msg_('Unknown post.');
  if (p.a === 'no') { q.getRange(row, 2).setValue('Rejected'); return msg_('Rejected. Nothing was posted.'); }
  const res = postRow_(row);
  if (res === 'posted') return msg_('Posted to Instagram! &#127881;');
  if (res === 'already') return msg_('Already posted. Check Instagram.');
  return msg_('Posting failed: ' + res + '<br>Tap Approve again in a minute to retry.');
}

/* ---------- F. Instagram publishing (images, carousels, stories, reels) ---------- */
function publish_(type, items, caption) {
  const uid = PropertiesService.getScriptProperties().getProperty('IG_USER_ID') || String(igMe_().user_id);
  const urls = items.map(mediaUrl_);
  const isVid = u => /\.mp4($|\?)/i.test(u);
  const media = (u, extra) => Object.assign(isVid(u) ? { video_url: u } : { image_url: u }, extra || {});
  let creation;
  if (type === 'CAROUSEL') {
    const kids = urls.slice(0, 10).map(u => wait_(api_('post', '/' + uid + '/media', media(u, Object.assign({ is_carousel_item: 'true' }, isVid(u) ? { media_type: 'VIDEO' } : {}))).id));
    creation = api_('post', '/' + uid + '/media', { media_type: 'CAROUSEL', children: kids.join(','), caption: caption }).id;
  } else if (type === 'STORY') {
    creation = api_('post', '/' + uid + '/media', media(urls[0], { media_type: 'STORIES' })).id;
  } else if (type === 'REEL') {
    creation = api_('post', '/' + uid + '/media', { video_url: urls[0], media_type: 'REELS', caption: caption, share_to_feed: 'true' }).id;
  } else {
    creation = api_('post', '/' + uid + '/media', media(urls[0], { caption: caption })).id;
  }
  wait_(creation);
  return api_('post', '/' + uid + '/media_publish', { creation_id: creation }).id;
}
function wait_(id) {                       // videos can take up to ~2 minutes to process
  for (let i = 0; i < 45; i++) {
    const s = api_('get', '/' + id, { fields: 'status_code' }).status_code;
    if (s === 'FINISHED') return id;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error('Instagram could not process the media (' + s + ').');
    Utilities.sleep(3000);
  }
  return id;
}
function mediaUrl_(item) {
  item = String(item).trim();
  if (/^https?:/.test(item)) return item;          // robot media: already a public URL
  let f = DriveApp.getFileById(item);              // manual drop: Drive file -> public JPEG
  if (f.getMimeType() !== MimeType.JPEG) {
    const j = f.getBlob().getAs(MimeType.JPEG).setName(f.getName().replace(/\.\w+$/, '') + '.jpg');
    f = folderSub_('Published copies').createFile(j);
  }
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + f.getId();
}
function api_(method, path, params) {
  const token = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!token) throw new Error('Add IG_TOKEN in Project Settings > Script properties.');
  params = params || {}; params.access_token = token;
  const qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  const res = method === 'get'
    ? UrlFetchApp.fetch(CFG.GRAPH + path + '?' + qs, { muteHttpExceptions: true })
    : UrlFetchApp.fetch(CFG.GRAPH + path, { method: 'post', payload: qs, contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true });
  const j = JSON.parse(res.getContentText() || '{}');
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j;
}
function igMe_() {
  const token = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!token) throw new Error('Add IG_TOKEN in Project Settings > Script properties.');
  const j = JSON.parse(UrlFetchApp.fetch(CFG.GRAPH + '/me?fields=user_id,username&access_token=' + encodeURIComponent(token), { muteHttpExceptions: true }).getContentText());
  if (j.error) throw new Error('Token problem: ' + j.error.message);
  return j;
}
function refreshToken() {
  const p = PropertiesService.getScriptProperties();
  const j = JSON.parse(UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' +
    encodeURIComponent(p.getProperty('IG_TOKEN')), { muteHttpExceptions: true }).getContentText());
  if (j.access_token) p.setProperty('IG_TOKEN', j.access_token);
  else MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Appu27: token refresh failed', 'Generate a new token in Meta and update IG_TOKEN. ' + JSON.stringify(j));
}

/* ---------- helpers ---------- */
function folder_() { const it = DriveApp.getFoldersByName(CFG.FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.FOLDER); }
function folderSub_(n) { const p = folder_(), it = p.getFoldersByName(n); return it.hasNext() ? it.next() : p.createFolder(n); }
function queue_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('QUEUE_ID'), ss;
  try { ss = id ? SpreadsheetApp.openById(id) : null; } catch (e) { ss = null; }
  if (!ss) { ss = SpreadsheetApp.create(CFG.SHEET); p.setProperty('QUEUE_ID', ss.getId()); DriveApp.getFileById(ss.getId()).moveTo(folder_()); }
  const sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < HEAD.length) sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
  sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
  return sh;
}
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('LINK_KEY');
  if (!s) { s = Utilities.getUuid().replace(/-/g, ''); p.setProperty('LINK_KEY', s); }
  return s;
}
function msg_(t) {
  return HtmlService.createHtmlOutput('<div style="font-family:Arial;padding:40px;font-size:20px;text-align:center">' + t + '</div>')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setTitle('Appu27 Autopost');
}
function esc_(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function testConnection() { const me = igMe_(); Logger.log('OK, connected to @' + me.username + ' (id ' + me.user_id + ')'); }
// END OF APPU27 AUTOPOST
