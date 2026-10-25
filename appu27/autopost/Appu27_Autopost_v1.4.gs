// APPU27 AUTOPOST v1.4
// New in 1.4: ONE digest email per batch (with "Approve all", stories first) instead of one email per post,
// Performance tracking (per-post insights), Daily follower log, Dashboard tab and a content Playbook tab.
// After pasting: run setupV14 once, then Deploy > Manage deployments > edit > Version: New version > Deploy.
const CFG = {
  FOLDER: 'Appu27 - Ready to post',     // you can still drop images here by hand
  SHEET: 'Appu27 Queue',
  GRAPH: 'https://graph.instagram.com/v23.0',
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzOQV6iArNbFbYKWCQgOtb6YjdBuSmYzTUdV68VciI3QCWM7S3uH3_9usJ-xZFzWL2Txg/exec',
  APPROVER: '',                         // blank = your own Gmail
  DEFAULT_TAGS: '#KBFC #KeralaBlasters #ISL #Manjappada #Appu27 #IndianFootball',
  FOOTBALL: 'https://v3.football.api-sports.io',
  JOBS: 'https://raw.githubusercontent.com/bullpranav-code/instagram-automation/main/appu27/jobs/',
  TZ: 'Asia/Kolkata'
};
const HEAD = ['Added', 'Status', 'Type', 'Files', 'Caption', 'Result', 'Group', 'Preview', 'Emailed', 'Format', 'Topic'];
const YES = /^(ok|okay|yes|y|approve|approved|post|go|✅|👍)\.?$/i;
const ORDER = { STORY: 0, POST: 1, CAROUSEL: 1, REEL: 2 };   // Boss: stories first, then posts, then reels

/* ---------- one-time setup ---------- */
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
// v1.4: run this ONCE after pasting the new code. Safe to run again.
function setupV14() {
  const q = queue_(), ss = q.getParent();
  // backfill Format for existing rows
  if (q.getLastRow() > 1) {
    const n = q.getLastRow() - 1, g = q.getRange(2, 7, n, 1).getValues(), f = q.getRange(2, 10, n, 1).getValues(), e = q.getRange(2, 9, n, 1).getValues();
    for (let i = 0; i < n; i++) { if (!f[i][0]) f[i][0] = guessFormat_(g[i][0]); if (!e[i][0]) e[i][0] = 'before v1.4'; }
    q.getRange(2, 10, n, 1).setValues(f); q.getRange(2, 9, n, 1).setValues(e);
  }
  perf_(); daily_(); playbook_(ss); buildDashboard();
  ScriptApp.getProjectTriggers().filter(t => /^(insightsNightly|insightsHourly)$/.test(t.getHandlerFunction())).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('insightsNightly').timeBased().atHour(23).nearMinute(30).inTimezone(CFG.TZ).everyDays(1).create();
  ScriptApp.newTrigger('insightsHourly').timeBased().everyHours(1).create();
  insightsNightly();
  Logger.log('v1.4 ready. Open the "' + CFG.SHEET + '" sheet: Dashboard, Performance, Daily and Playbook tabs are added.');
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
    addRow_(q, b);
    sendDigest_();
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
function addRow_(q, b) {
  let cap = String(b.caption || '');
  if (b.type !== 'STORY' && cap.indexOf('#') < 0) cap = (cap + '\n\n' + CFG.DEFAULT_TAGS).trim();
  q.appendRow([new Date(), 'Waiting approval', b.type, (b.files || []).join(','), b.type === 'STORY' ? '' : cap, '', b.group || '', b.preview || '', '',
    b.format || guessFormat_(b.group), b.topic || '']);
}

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
    addRow_(q, b);
    seen[b.group] = 1;
  });
  sendDigest_();
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
    addRow_(q, { type: g.type, files: g.files.map(x => x.getId()), caption: caption, group: key, format: guessFormat_(key) });
  });
  sendDigest_();
}

/* ---------- C. approval: type yes / ok / okay in the Status cell = posts immediately ---------- */
function onQueueEdit(e) {
  const r = e && e.range;
  if (!r || r.getColumn() !== 2 || r.getRow() < 2 || r.getSheet().getIndex() !== 1) return;
  if (YES.test(String(r.getValue()).trim())) postRow_(r.getRow());
}
function postApprovedInSheet_() {          // safety net, runs every 10 minutes; stories first
  const q = queue_();
  if (q.getLastRow() < 2) return;
  const v = q.getRange(2, 1, q.getLastRow() - 1, 3).getValues();
  v.map((r, i) => ({ row: i + 2, ok: YES.test(String(r[1]).trim()), t: r[2] })).filter(x => x.ok)
    .sort((a, b) => (ORDER[a.t] || 1) - (ORDER[b.t] || 1) || a.row - b.row).forEach(x => postRow_(x.row));
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

/* ---------- D. ONE digest email for everything waiting (replaces one-mail-per-post) ---------- */
function sendDigest_() {
  const q = queue_();
  if (q.getLastRow() < 2) return;
  const n = q.getLastRow() - 1, v = q.getRange(2, 1, n, 11).getValues();
  const fresh = [];
  v.forEach((r, i) => { if (r[1] === 'Waiting approval' && !r[8]) fresh.push(i + 2); });
  if (!fresh.length) return;
  const waiting = v.map((r, i) => ({ row: i + 2, r: r })).filter(x => x.r[1] === 'Waiting approval')
    .sort((a, b) => (ORDER[a.r[2]] || 1) - (ORDER[b.r[2]] || 1) || a.row - b.row);
  const inline = {};
  let k = 0, cards = '';
  waiting.forEach((x, pos) => {
    const r = x.r, isNew = fresh.indexOf(x.row) >= 0;
    const shots = (r[7] ? String(r[7]) : String(r[3])).split(',').filter(s => !/\.mp4($|\?)/i.test(s));
    let img = '';
    if (shots[0] && k < 20) {
      try {
        const blob = /^https?:/.test(shots[0]) ? UrlFetchApp.fetch(shots[0]).getBlob() : DriveApp.getFileById(shots[0]).getBlob();
        if (/^image\//.test(blob.getContentType())) { inline['i' + k] = blob; img = '<img src="cid:i' + k + '" style="width:150px;border-radius:10px;display:block">'; k++; }
      } catch (e) {}
    }
    const vid = String(r[3]).split(',').filter(u => /\.mp4($|\?)/i.test(u))[0];
    const cap = r[4] ? esc_(String(r[4]).split('\n').slice(0, 3).join(' ').slice(0, 220)) + '…' : '<i>Story, no caption</i>';
    cards += '<tr><td style="padding:10px;vertical-align:top;width:160px">' + img + '</td><td style="padding:10px;vertical-align:top;font-family:Arial;font-size:14px">' +
      '<b>' + (pos + 1) + '. ' + r[2] + '</b> · ' + esc_(r[9] || '') + (isNew ? ' <span style="background:#FFC629;padding:1px 6px;border-radius:6px;font-size:11px">NEW</span>' : '') +
      '<br><span style="color:#555">' + cap + '</span>' + (vid ? '<br><a href="' + vid + '">&#9654; Watch video</a>' : '') +
      '<br><a href="' + link_('ok', x.row) + '" style="color:#16A34A;font-weight:bold">Approve</a> &nbsp; <a href="' + link_('no', x.row) + '" style="color:#c00">Reject</a>' +
      ' &nbsp; <span style="color:#999;font-size:12px">row ' + x.row + '</span></td></tr>';
  });
  const all = CFG.WEBAPP_URL + '?a=okall&rows=' + waiting.map(x => x.row).join('.') + '&k=' + secret_();
  const html = '<div style="font-family:Arial;max-width:640px">' +
    '<p style="font-size:13px;color:#888;margin:0">APPU27 &middot; approvals</p>' +
    '<h2 style="margin:4px 0 6px">' + waiting.length + ' waiting (' + fresh.length + ' new)</h2>' +
    '<p style="margin:0 0 14px;color:#555">They post in this order: stories, then posts, then reels.</p>' +
    '<p><a href="' + all + '" style="background:#16A34A;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold">&#9989; Approve all ' + waiting.length + '</a></p>' +
    '<table style="border-collapse:collapse;width:100%">' + cards + '</table>' +
    '<p style="font-size:12px;color:#888">Or type <b>yes</b> in the Status cell in the "' + CFG.SHEET + '" sheet. Edit a Caption cell before approving to change it.</p></div>';
  const day = Utilities.formatDate(new Date(), CFG.TZ, 'd MMM');
  MailApp.sendEmail({ to: CFG.APPROVER || Session.getEffectiveUser().getEmail(), name: 'Appu27 Bot',
    subject: 'Appu27 approvals · ' + day + ' · ' + waiting.length + ' waiting', htmlBody: html, inlineImages: inline });
  const stamp = new Date();
  fresh.forEach(row => q.getRange(row, 9).setValue(stamp));
}
function askApproval_(row) { sendDigest_(); }   // kept for old callers
function link_(a, row) { return CFG.WEBAPP_URL + '?a=' + a + '&row=' + row + '&k=' + secret_(); }

/* ---------- E. approve links ---------- */
function doGet(e) {
  const p = e.parameter || {};
  if (p.a === 'data') return ContentService.createTextOutput(matchData_(p)).setMimeType(ContentService.MimeType.JSON);
  if (p.k !== secret_()) return msg_('Link expired or wrong.');
  const q = queue_();
  if (p.a === 'okall') {
    const rows = String(p.rows || '').split('.').map(Number).filter(r => r > 1);
    const v = rows.map(r => ({ row: r, st: q.getRange(r, 2).getValue(), t: q.getRange(r, 3).getValue() })).filter(x => x.st === 'Waiting approval')
      .sort((a, b) => (ORDER[a.t] || 1) - (ORDER[b.t] || 1) || a.row - b.row);
    v.forEach(x => q.getRange(x.row, 2).setValue('yes'));
    SpreadsheetApp.flush();
    const start = Date.now(); let done = 0, fail = 0;
    for (const x of v) { if (Date.now() - start > 240000) break; const r = postRow_(x.row); if (r === 'posted') done++; else if (/^failed/.test(r)) fail++; }
    const left = v.length - done - fail;
    return msg_('Approved ' + v.length + '. Posted ' + done + ' now' + (fail ? ', ' + fail + ' failed (see sheet)' : '') +
      (left ? '. The other ' + left + ' will post within 10 minutes.' : '.') + ' &#127881;');
  }
  const row = Number(p.row);
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
    creation = api_('post', '/' + uid + '/media', media(urls[0], Object.assign({ media_type: 'STORIES' }, isVid(urls[0]) ? {} : {}))).id;
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

/* ---------- G. PERFORMANCE TRACKING (v1.4) ---------- */
const PERF = ['Group', 'Type', 'Format', 'Topic', 'Posted (IST)', 'Day', 'Hour', 'Media ID', 'Link', 'Reach', 'Views', 'Likes', 'Comments',
  'Shares', 'Saves', 'Interactions', 'Follows', 'Profile visits', 'Replies', 'Avg watch (s)', 'Engagement %', 'Verdict', 'Updated', 'Note'];
const METRICS = {
  STORY: 'reach,views,replies,shares,total_interactions,follows,profile_visits',
  REELS: 'reach,views,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time',
  FEED: 'reach,views,likes,comments,shares,saved,total_interactions,follows,profile_visits'
};
function insightsHourly() { try { updateInsights_(true); } catch (e) { Logger.log(e); } }   // stories vanish after 24 h, so catch them hourly
function insightsNightly() {
  try { updateInsights_(false); } catch (e) { Logger.log('insights: ' + e); }
  try { logDaily_(); } catch (e) { Logger.log('daily: ' + e); }
  try { verdicts_(); } catch (e) { Logger.log('verdicts: ' + e); }
}
function updateInsights_(storiesOnly) {
  const q = queue_(), sh = perf_();
  if (q.getLastRow() < 2) return;
  const rows = q.getRange(2, 1, q.getLastRow() - 1, 11).getValues();
  const have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 8, sh.getLastRow() - 1, 1).getValues().forEach((r, i) => have[String(r[0])] = i + 2);
  const now = Date.now();
  rows.forEach(r => {
    if (r[1] !== 'Posted') return;
    const m = String(r[5]).match(/Media (\d+)/); if (!m) return;
    const id = m[1], type = r[2];
    if (storiesOnly && type !== 'STORY') return;
    let info;
    try { info = api_('get', '/' + id, { fields: 'media_type,media_product_type,permalink,timestamp,like_count,comments_count' }); }
    catch (e) { if (!have[id]) writePerf_(sh, have, id, [r[6], type, r[9] || guessFormat_(r[6]), r[10] || '', '', '', '', id, '', '', '', '', '', '', '', '', '', '', '', '', '', '', new Date(), 'Media not found: ' + e.message]); return; }
    const t = info.timestamp ? new Date(info.timestamp) : new Date();
    const age = (now - t.getTime()) / 3600000;
    if (have[id] && (type === 'STORY' ? age > 26 : age > 24 * 35)) return;   // frozen: stories after 24 h, feed after 35 days
    const kind = info.media_product_type === 'STORY' ? 'STORY' : info.media_product_type === 'REELS' ? 'REELS' : 'FEED';
    const got = {}; let note = '';
    try { readInsights_(id, METRICS[kind], got); }
    catch (e) { note = 'Insights: ' + e.message; try { readInsights_(id, 'reach', got); } catch (e2) {} }
    if (got.likes == null && info.like_count != null) got.likes = info.like_count;
    if (got.comments == null && info.comments_count != null) got.comments = info.comments_count;
    const inter = got.total_interactions != null ? got.total_interactions : ['likes', 'comments', 'shares', 'saved', 'replies'].reduce((s, k) => s + (got[k] || 0), 0);
    const er = got.reach ? Math.round(inter / got.reach * 1000) / 10 : '';
    writePerf_(sh, have, id, [r[6], type, r[9] || guessFormat_(r[6]), r[10] || '',
      Utilities.formatDate(t, CFG.TZ, 'yyyy-MM-dd HH:mm'), Utilities.formatDate(t, CFG.TZ, 'EEE'), Number(Utilities.formatDate(t, CFG.TZ, 'H')),
      id, info.permalink || '', v_(got.reach), v_(got.views), v_(got.likes), v_(got.comments), v_(got.shares), v_(got.saved), inter,
      v_(got.follows), v_(got.profile_visits), v_(got.replies), got.ig_reels_avg_watch_time != null ? Math.round(got.ig_reels_avg_watch_time / 100) / 10 : '',
      er, '', new Date(), note]);
  });
}
function readInsights_(id, metrics, out) {
  const j = api_('get', '/' + id + '/insights', { metric: metrics });
  (j.data || []).forEach(d => { out[d.name] = d.total_value ? d.total_value.value : (d.values && d.values[0] ? d.values[0].value : null); });
}
function v_(x) { return x == null ? '' : x; }
function writePerf_(sh, have, id, row) {
  if (have[id]) { const old = sh.getRange(have[id], 22).getValue(); row[21] = old; sh.getRange(have[id], 1, 1, PERF.length).setValues([row]); }
  else { sh.appendRow(row); have[id] = sh.getLastRow(); }
}
function verdicts_() {                      // worked / average / flopped, compared with the median reach of the same type
  const sh = perf_(); if (sh.getLastRow() < 2) return;
  const n = sh.getLastRow() - 1, v = sh.getRange(2, 1, n, PERF.length).getValues();
  const byType = {};
  v.forEach(r => { if (typeof r[9] === 'number') (byType[r[1]] = byType[r[1]] || []).push(r[9]); });
  const med = a => { const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = v.map(r => {
    const a = byType[r[1]] || [];
    if (typeof r[9] !== 'number') return [''];
    if (a.length < 3) return ['⏳ Too early'];
    const md = med(a);
    return [r[9] >= md * 1.3 ? '🔥 Worked' : r[9] <= md * 0.7 ? '❄️ Flopped' : '👌 Average'];
  });
  sh.getRange(2, 22, n, 1).setValues(out);
}
function logDaily_() {
  const sh = daily_(), uid = PropertiesService.getScriptProperties().getProperty('IG_USER_ID') || String(igMe_().user_id);
  const me = api_('get', '/me', { fields: 'followers_count,media_count' });
  const got = {}; let note = '';
  try {
    const j = api_('get', '/' + uid + '/insights', { metric: 'reach,accounts_engaged,total_interactions,profile_views', period: 'day', metric_type: 'total_value' });
    (j.data || []).forEach(d => got[d.name] = d.total_value ? d.total_value.value : '');
  } catch (e) { note = e.message; }
  const today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  const last = sh.getLastRow(), prev = last > 1 ? sh.getRange(last, 2).getValue() : '';
  const row = [today, me.followers_count, prev === '' ? '' : me.followers_count - prev, me.media_count, v_(got.reach), v_(got.accounts_engaged), v_(got.total_interactions), v_(got.profile_views), note];
  if (last > 1 && Utilities.formatDate(new Date(sh.getRange(last, 1).getValue()), CFG.TZ, 'yyyy-MM-dd') === today) sh.getRange(last, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}
function guessFormat_(g) {
  g = String(g || '').toLowerCase();
  if (/_ft_|fulltime|full_time/.test(g)) return 'Full time';
  if (/_ht_|halftime/.test(g)) return 'Half time';
  if (/_ko_|kickoff|preview|matchday|lineup/.test(g)) return 'Matchday hype';
  if (/story2|vote|poll|predict/.test(g)) return 'Fan vote';
  if (/squad|foreign|player|spotlight/.test(g)) return 'Player guide';
  if (/strength|verdict|hot_?take/.test(g)) return 'Fan verdict';
  if (/recap|roundup|results|table/.test(g)) return 'Round-up';
  if (/quiz|guess/.test(g)) return 'Quiz';
  if (/meme|comic/.test(g)) return 'Appu comic';
  if (/stat/.test(g)) return 'Stat attack';
  if (/kochi|place|stadium/.test(g)) return 'Kochi matchday';
  if (/throwback|onthisday/.test(g)) return 'Throwback';
  if (/tactic/.test(g)) return 'Tactics board';
  return 'Other';
}

/* ---------- H. tabs: Performance, Daily, Playbook, Dashboard ---------- */
function tab_(name, head, color) {
  const ss = queue_().getParent();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground(color || '#FFC629'); }
  return sh;
}
function perf_() { return tab_('Performance', PERF); }
function daily_() { return tab_('Daily', ['Date', 'Followers', 'Change', 'Posts on page', 'Reach (day)', 'Accounts engaged', 'Interactions', 'Profile views', 'Note']); }
function playbook_(ss) {
  if (ss.getSheetByName('Playbook')) return;
  const sh = tab_('Playbook', ['Format', 'What it is', 'Best as', 'When', 'Posts so far', 'Avg reach', 'Last used']);
  const F = [
    ['Matchday hype', 'Preview, kick-off story + reel (automatic)', 'Story + Reel', 'Match day'],
    ['Half time', 'Half-time score story', 'Story', 'Match day'],
    ['Full time', 'Score post + story + mood-music reel (automatic)', 'Post + Story + Reel', 'Match day'],
    ['Appu comic', '3–4 panel cartoon: Appu reacts to the result or the week (meme style)', 'Carousel', 'Day after match'],
    ['Stat attack', 'One huge number + what it means', 'Post', 'Midweek'],
    ['Quiz', 'Guess the player from 3 clues, answer on the last slide', 'Carousel', 'Midweek'],
    ['Fan vote', 'Pick your #1 / predict the score, reply with a number', 'Story', 'Any day'],
    ['Fan verdict', 'Strengths vs worries, hot takes, rate the signing', 'Post', 'Midweek'],
    ['Player guide', 'Shirt-card spotlight on one player', 'Carousel', 'Midweek'],
    ['Round-up', 'All ISL results + table in one swipe', 'Carousel', 'Monday'],
    ['Kochi matchday', 'Place-based story: JLN, metro, food, chants (no photos of people)', 'Carousel / Reel', 'Day before home match'],
    ['Throwback', 'On this day in Blasters history', 'Post', 'Weekend, no match'],
    ['Tactics board', 'Simple pitch drawing: how we line up and why', 'Post', 'Day before match'],
    ['Appu Predicts', 'Appu’s score call + fan leaderboard', 'Story + Post', 'Day before match']];
  F.forEach((f, i) => {
    const r = i + 2;
    sh.getRange(r, 1, 1, 4).setValues([f]);
    sh.getRange(r, 5, 1, 3).setFormulas([[
      '=COUNTIF(Performance!C:C,A' + r + ')',
      '=IFERROR(ROUND(AVERAGEIF(Performance!C:C,A' + r + ',Performance!J:J)),"")',
      '=IFERROR(TEXT(MAXIFS(Performance!E:E,Performance!C:C,A' + r + '),"yyyy-mm-dd"),"never")']]);
  });
  sh.getRange(F.length + 3, 1).setValue('Rule: never the same format two days running; at least 5 different formats a week. Tag each job with "format" so the dashboard can compare them.')
    .setFontStyle('italic');
  sh.setColumnWidth(2, 420); sh.autoResizeColumn(1);
}
function buildDashboard() {
  const ss = queue_().getParent();
  let sh = ss.getSheetByName('Dashboard');
  if (sh) sh.clear(); else sh = ss.insertSheet('Dashboard', 1);
  sh.getCharts().forEach(c => sh.removeChart(c));
  const P = 'Performance!A1:X';
  const start = Utilities.formatDate(new Date(), CFG.TZ, 'd MMM yyyy'), review = Utilities.formatDate(new Date(Date.now() + 90 * 864e5), CFG.TZ, 'd MMM yyyy');
  sh.getRange('A1').setValue('APPU27 · PERFORMANCE DASHBOARD').setFontSize(18).setFontWeight('bold');
  sh.getRange('A2').setValue('Updates every night at 11:30 PM. Tracking from ' + start + ' · 3-month review: ' + review + '. Verdict compares each post with the median reach of its type.').setFontColor('#666');
  const kpi = [['Posts tracked', 'Total reach', 'Avg reach / post', 'Avg engagement %', 'Followers now', 'Followers gained', 'Worked 🔥', 'Flopped ❄️'],
    ['=COUNT(Performance!J2:J)', '=SUM(Performance!J2:J)', '=IFERROR(ROUND(AVERAGE(Performance!J2:J)),0)', '=IFERROR(ROUND(AVERAGE(Performance!U2:U),1),0)',
     '=IFERROR(INDEX(Daily!B:B,COUNTA(Daily!A:A)),"")', '=IFERROR(INDEX(Daily!B:B,COUNTA(Daily!A:A))-Daily!B2,"")',
     '=COUNTIF(Performance!V:V,"🔥 Worked")', '=COUNTIF(Performance!V:V,"❄️ Flopped")']];
  sh.getRange(4, 1, 2, 8).setValues([kpi[0], ['', '', '', '', '', '', '', '']]);
  sh.getRange(5, 1, 1, 8).setFormulas([kpi[1]]);
  sh.getRange(4, 1, 1, 8).setFontWeight('bold').setBackground('#141414').setFontColor('#FFC629');
  sh.getRange(5, 1, 1, 8).setFontSize(16).setFontWeight('bold').setBackground('#FFF4CC');
  const sec = (cell, title, f) => { sh.getRange(cell).setValue(title).setFontWeight('bold').setFontSize(12); sh.getRange(cell).offset(1, 0).setFormula(f); };
  const grp = (col, label) => '=IFERROR(QUERY(' + P + ',"select ' + col + ', count(J), avg(J), avg(U), sum(Q) where J is not null group by ' + col +
    ' order by avg(J) desc label ' + col + " '" + label + "', count(J) 'Posts', avg(J) 'Avg reach', avg(U) 'Avg eng %', sum(Q) 'Follows'\",1),\"No data yet\")";
  sec('A8', 'Which FORMATS work (best first)', grp('C', 'Format'));
  sec('H8', 'By post TYPE', grp('B', 'Type'));
  sec('A28', 'Best DAY to post', grp('F', 'Day'));
  sec('H28', 'Best HOUR to post (IST)', grp('G', 'Hour'));
  sec('A56', 'TOP 10 posts (by reach)', '=IFERROR(QUERY(' + P + ',"select E, B, C, A, J, U, V, I where J is not null order by J desc limit 10 label E \'Posted\', B \'Type\', C \'Format\', A \'Post\', J \'Reach\', U \'Eng %\', V \'Verdict\', I \'Link\'",1),"No data yet")');
  sec('A70', 'BOTTOM 10 posts (learn from these)', '=IFERROR(QUERY(' + P + ',"select E, B, C, A, J, U, V, I where J is not null order by J asc limit 10 label E \'Posted\', B \'Type\', C \'Format\', A \'Post\', J \'Reach\', U \'Eng %\', V \'Verdict\', I \'Link\'",1),"No data yet")');
  sec('N8', 'Verdicts', '=IFERROR(QUERY(' + P + ',"select V, count(J) where V is not null group by V label V \'Verdict\', count(J) \'Posts\'",1),"No data yet")');
  sh.setFrozenRows(5);
  const d = daily_();
  sh.insertChart(sh.newChart().asLineChart().addRange(d.getRange('A1:B400')).setPosition(14, 14, 0, 0)
    .setOption('title', 'Followers').setOption('legend', { position: 'none' }).setOption('colors', ['#E03A3E']).setNumHeaders(1).build());
  sh.insertChart(sh.newChart().asColumnChart().addRange(d.getRange('A1:A400')).addRange(d.getRange('E1:E400')).setPosition(34, 14, 0, 0)
    .setOption('title', 'Daily reach').setOption('legend', { position: 'none' }).setOption('colors', ['#F7A600']).setNumHeaders(1).build());
  sh.setColumnWidths(1, 13, 120);
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
  else if (sh.getLastColumn() < HEAD.length || sh.getRange(1, HEAD.length).getValue() !== HEAD[HEAD.length - 1]) sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
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
// END OF APPU27 AUTOPOST v1.4
