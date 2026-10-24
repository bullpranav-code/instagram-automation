// Accent Voice v1.0 - turns lesson scripts into Malayalam voice files with Gemini.
// Paste this as a NEW file inside your Ila Apps Script project (it reuses GEMINI_API_KEY).
// Then choose vxSetup in the function list and press Run once. That is all.

var VX = {
  JOBS: 'https://raw.githubusercontent.com/bullpranav-code/instagram-automation/main/accent/voice/jobs.json',
  FOLDER: 'Accent Academy - Voice',
  MODELS: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'],
  OLD_MODELS: ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'],
  PER_RUN: 4
};

function vxSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'vxRun') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('vxRun').timeBased().everyMinutes(10).create();
  vxRun();
}

function vxRun() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY missing in Script properties');
    var res = UrlFetchApp.fetch(VX.JOBS + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('jobs.json ' + res.getResponseCode());
    var data = JSON.parse(res.getContentText());
    var folder = vxFolder_(data.folder || VX.FOLDER);
    var status = vxReadStatus_(folder);
    var done = 0;
    for (var i = 0; i < data.jobs.length && done < VX.PER_RUN; i++) {
      var job = data.jobs[i];
      var name = job.id + '.wav';
      if (folder.getFilesByName(name).hasNext()) { status[job.id] = 'ready'; continue; }
      try {
        var wav = vxSpeak_(key, job);
        folder.createFile(Utilities.newBlob(wav, 'audio/wav', name));
        status[job.id] = 'ready';
      } catch (e) {
        status[job.id] = 'error: ' + String(e.message || e).slice(0, 300);
      }
      done++;
      Utilities.sleep(6000);
    }
    status._checked = new Date().toISOString();
    vxWriteStatus_(folder, status);
  } finally {
    lock.releaseLock();
  }
}

function vxSpeak_(key, job) {
  var errors = [];
  for (var m = 0; m < VX.MODELS.length; m++) {
    try { return vxInteractions_(key, VX.MODELS[m], job); } catch (e) { errors.push(VX.MODELS[m] + ': ' + e.message); }
  }
  for (var n = 0; n < VX.OLD_MODELS.length; n++) {
    try { return vxGenerate_(key, VX.OLD_MODELS[n], job); } catch (e2) { errors.push(VX.OLD_MODELS[n] + ': ' + e2.message); }
  }
  throw new Error(errors.join(' | '));
}

function vxInteractions_(key, model, job) {
  var content = { type: 'text', text: job.text };
  if (job.style) content.annotations = [{ type: 'speech_metadata', style: job.style }];
  var body = {
    model: model,
    input: [{ type: 'user_input', content: [content] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice: job.voice || 'Sulafat' }] }
  };
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body)
  });
  var code = r.getResponseCode();
  if (code !== 200) throw new Error(code + ' ' + r.getContentText().slice(0, 200));
  var json = JSON.parse(r.getContentText());
  var b64 = '';
  (json.steps || []).forEach(function (s) {
    (s.content || []).forEach(function (c) { if (c.type === 'audio' && c.data) b64 = c.data; });
  });
  if (!b64 && json.output_audio && json.output_audio.data) b64 = json.output_audio.data;
  if (!b64) throw new Error('no audio in reply');
  var bytes = Utilities.base64Decode(b64);
  var head = String.fromCharCode(bytes[0] & 255, bytes[1] & 255, bytes[2] & 255, bytes[3] & 255);
  return head === 'RIFF' ? bytes : vxWav_(bytes, 24000);
}

function vxGenerate_(key, model, job) {
  var say = (job.style ? job.style + ' Say this in Malayalam: ' : '') + job.text;
  var body = {
    contents: [{ parts: [{ text: say }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice || 'Sulafat' } } }
    }
  };
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body)
  });
  var code = r.getResponseCode();
  if (code !== 200) throw new Error(code + ' ' + r.getContentText().slice(0, 200));
  var json = JSON.parse(r.getContentText());
  var part = json.candidates[0].content.parts[0].inlineData;
  return vxWav_(Utilities.base64Decode(part.data), 24000);
}

function vxWav_(pcm, rate) {
  var len = pcm.length, h = [];
  function s(t) { for (var i = 0; i < t.length; i++) h.push(t.charCodeAt(i)); }
  function u32(v) { h.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
  function u16(v) { h.push(v & 255, (v >> 8) & 255); }
  s('RIFF'); u32(36 + len); s('WAVE'); s('fmt '); u32(16); u16(1); u16(1);
  u32(rate); u32(rate * 2); u16(2); u16(16); s('data'); u32(len);
  var out = h.map(function (b) { return b > 127 ? b - 256 : b; });
  return out.concat(pcm);
}

function vxFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function vxReadStatus_(folder) {
  var it = folder.getFilesByName('voice_status.json');
  if (!it.hasNext()) return {};
  try { return JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { return {}; }
}

function vxWriteStatus_(folder, status) {
  var it = folder.getFilesByName('voice_status.json');
  var text = JSON.stringify(status, null, 1);
  if (it.hasNext()) it.next().setContent(text); else folder.createFile('voice_status.json', text, 'application/json');
}
// END of Accent Voice
