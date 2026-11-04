// ACCENT PUBLISHER - uploads one free lesson a day to the Accent YouTube channel.
// Setup once: Services (+) -> add "YouTube Data API v3" -> run setup() -> Allow.
var QUEUE_URL = 'https://bullpranav-code.github.io/instagram-automation/publisher/queue.json';
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('publishNext').timeBased().everyDays(1).atHour(18).create();   // every day around 6-7 pm
  Logger.log('Daily publishing is on. Running the first upload now...');
  publishNext();
}
function publishNext() {
  var P = PropertiesService.getScriptProperties(), done = JSON.parse(P.getProperty('done') || '{}');
  var q = JSON.parse(UrlFetchApp.fetch(QUEUE_URL + '?t=' + Date.now()).getContentText()).queue;
  var item = q.filter(function (x) { return !done[x.id]; })[0];
  if (!item) { Logger.log('Queue finished. Add more videos to queue.json.'); return; }
  var blob = UrlFetchApp.fetch(item.video).getBlob().setName(item.id + '.mp4');
  var res = YouTube.Videos.insert({ snippet: { title: item.title, description: item.desc, tags: item.tags, categoryId: '27', defaultLanguage: 'ml' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }, 'snippet,status', blob);
  done[item.id] = res.id; P.setProperty('done', JSON.stringify(done));
  Logger.log('Uploaded: ' + item.title + ' -> https://youtu.be/' + res.id);
}
function status() { Logger.log(PropertiesService.getScriptProperties().getProperty('done') || 'Nothing uploaded yet.'); }
