// Ila Knowledge Sync v1.0 - keeps the "Ila Knowledge" tab in step with Accent's knowledge base on GitHub.
// Paste as a NEW file inside your Ila project, choose kbSetup and press Run once.
var KB_URL = 'https://raw.githubusercontent.com/bullpranav-code/instagram-automation/main/accent/ila/knowledge.json';

function kbSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kbSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kbSync').timeBased().everyMinutes(30).create();
  kbSync();
}

function kbSync() {
  var r = UrlFetchApp.fetch(KB_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return;
  var rows = JSON.parse(r.getContentText()).rows;
  if (!rows || !rows.length) return;
  var sh = ss_().getSheetByName(TABS.know[0]);
  if (!sh) return;
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  CacheService.getScriptCache().remove('ila_kb');
}
// END of Ila Knowledge Sync
