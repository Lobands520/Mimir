import { ArchiveDB } from './lib/archive-db.js';
import { HistoryCollector } from './lib/history.js';
import { BackupService, GitHubClient } from './lib/backup.js';
import { packArchiveChunk, sha256, bytesToBase64, DAY, errorMessage } from './lib/format.js';

const db = new ArchiveDB();
const collector = new HistoryCollector(db, chrome.history);
let lock = Promise.resolve(), pumping = false, backup = null, backupSignature = '';
const serial = fn => { const promise = lock.then(fn); lock = promise.catch(() => {}); return promise; };
async function config() {
  const { config: stored = {} } = await chrome.storage.local.get('config');
  return { enabled: stored.enabled !== false, ai: { url: '', model: '', key: '', ...stored.ai },
    github: { enabled: false, owner: '', repo: '', branch: '', token: '', ...stored.github } };
}
async function service(cfg) {
  const signature = JSON.stringify(cfg.github);
  if (!backup || signature !== backupSignature) { backup = new BackupService(db, new GitHubClient({ ...cfg.github })); backupSignature = signature; }
  return backup;
}
async function ensureAlarms() {
  for (const [name, periodInMinutes] of [['mimir-capture', 60], ['mimir-backup', 1440]]) {
    if (!await chrome.alarms.get(name)) await chrome.alarms.create(name, { delayInMinutes: 1, periodInMinutes });
  }
}
async function scheduleWork() {
  if (!await chrome.alarms.get('mimir-work')) await chrome.alarms.create('mimir-work', { delayInMinutes: 0.5 });
}
async function startSync() {
  const cfg = await config();
  if (cfg.enabled) await collector.start(cfg.github.enabled);
  else if (cfg.github.enabled) await db.set('backupWanted', true);
  else throw new Error('采集已暂停，且尚未配置外部备份');
  await db.remove('serviceError');
  await scheduleWork();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const worked = await serial(async () => {
        const cfg = await config();
        const capture = await db.get('capture');
        if (cfg.enabled && capture && !capture.error) {
          try { await collector.step(); }
          catch (e) { capture.error = errorMessage(e); await db.set('capture', capture); }
          return true;
        }
        if (!cfg.github.enabled) return false;
        const svc = await service(cfg);
        if (await db.get('backupWanted')) {
          const state = await svc.state();
          if (state.retryAt > Date.now()) return false;
          try { await svc.start(); await db.remove('backupWanted'); await db.remove('serviceError'); }
          catch (e) {
            if (!e.retryable) await db.remove('backupWanted');
            await svc.fail(e); return false;
          }
          return true;
        }
        const restore = await db.get('restore');
        if (restore && restore.destination === svc.destination && (!restore.error || (restore.retryAt && restore.retryAt <= Date.now()))) {
          try { return await svc.restoreStep(); }
          catch (e) { restore.error = errorMessage(e); restore.retryAt = e.retryable ? Date.now() + (e.delay || 60000) : 0; await db.set('restore', restore); return false; }
        }
        try { return await svc.step(); }
        catch (e) { await svc.fail(e); return false; }
      });
      if (!worked) break;
    }
    const cfg = await config();
    const capture = await db.get('capture');
    let needed = cfg.enabled && capture && !capture.error;
    if (cfg.github.enabled) {
      const svc = await service(cfg); const state = await svc.state(); const restore = await db.get('restore');
      needed ||= await db.get('backupWanted');
      needed ||= state.job && (!state.error || state.retryAt);
      needed ||= restore && (!restore.error || restore.retryAt);
    }
    if (needed) await scheduleWork();
  } catch (e) { console.error('Mimir task:', errorMessage(e)); await db.set('serviceError', errorMessage(e)).catch(() => {}); }
  finally { pumping = false; }
}
async function initialize(startup = false) {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await db.open(); await collector.source(); await ensureAlarms();
  const cfg = await config();
  if (startup && cfg.enabled) {
    const state = cfg.github.enabled ? await (await service(cfg)).state() : null;
    await collector.start(!!state && Date.now() - state.lastSuccess >= DAY);
  } else if (startup && cfg.github.enabled) {
    const state = await (await service(cfg)).state();
    if (Date.now() - state.lastSuccess >= DAY) await db.set('backupWanted', true);
  }
  await scheduleWork();
}
async function status() {
  const cfg = await config(); const svc = await service(cfg); const state = await svc.state();
  const estimate = await navigator.storage.estimate();
  const capture = await db.get('capture'); const restore = await db.get('restore');
  return { enabled: cfg.enabled, total: await db.count(), usage: estimate.usage || 0,
    lastCapture: (await db.get('lastCapture')) || 0,
    capture: capture ? { processedUrls: capture.processedUrls, inserted: capture.inserted, error: capture.error } : null,
    githubEnabled: cfg.github.enabled, backup: { lastSuccess: state.lastSuccess, running: !!state.job,
      error: state.error || null, retryAt: state.retryAt || 0, uploaded: state.job?.uploaded || 0 },
    pending: await db.pendingCount(state.cursor), serviceError: await db.get('serviceError'),
    restore: restore ? { read: restore.read, shards: restore.shards, error: restore.error } : null,
    lastRestore: await db.get('lastRestore'), lastImport: await db.get('lastImport') };
}
async function saveConfig(input) {
  const previous = await config();
  const ai = { url: String(input.ai?.url || '').trim(), model: String(input.ai?.model || '').trim(), key: String(input.ai?.key || '').trim() };
  if (ai.url) {
    const url = new URL(ai.url);
    if (url.username || url.password || !(['https:'].includes(url.protocol) || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('AI 地址需使用 HTTPS 或本机 HTTP');
  }
  const github = { enabled: input.github?.enabled === true, owner: String(input.github?.owner || '').trim(),
    repo: String(input.github?.repo || '').trim(), branch: String(input.github?.branch || '').trim(), token: String(input.github?.token || '').trim() };
  if (github.enabled) {
    if (!/^[\w.-]+$/.test(github.owner) || !/^[\w.-]+$/.test(github.repo)) throw new Error('GitHub 用户和仓库名无效');
    const client = new GitHubClient(github); await client.validate(true); github.branch = client.config.branch;
  }
  const next = { enabled: input.enabled !== false, ai, github };
  await chrome.storage.local.set({ config: next });
  await db.remove('serviceError');
  if (next.enabled && !previous.enabled) await collector.start(github.enabled);
  if (github.enabled && JSON.stringify(previous.github) !== JSON.stringify(github)) await db.set('backupWanted', true);
  await scheduleWork();
  return next;
}
async function exportChunk(request) {
  const chunk = await db.archiveChunk(0, request.until, request.cursor || null);
  if (!chunk.rows.length) return { count: 0, cursor: chunk.cursor, done: chunk.done };
  const { rows, bytes, cursor, done } = await packArchiveChunk(chunk);
  return { count: rows.length, cursor, done, base64: bytesToBase64(bytes), digest: await sha256(bytes) };
}
async function handle(message) {
  switch (message.action) {
    case 'status': return status();
    case 'getConfig': return config();
    case 'saveConfig': return serial(() => saveConfig(message.config));
    case 'sync': await serial(startSync); return { started: true };
    case 'query': return db.page(message.filter, message.cursor, message.limit);
    case 'scan': return db.scan(message.filter, message.cursor, 1000);
    case 'exportStart': return { until: await db.maxSeq() };
    case 'exportChunk': return exportChunk(message);
    case 'importRows':
      if (!Array.isArray(message.rows) || message.rows.length > 500) throw new Error('每批最多导入 500 条记录');
      return serial(() => db.putRecords(message.rows, { strict: !!message.strict }));
    case 'importReport': await db.set('lastImport', message.report); return true;
    case 'restore': {
      const cfg = await config(); if (!cfg.github.enabled) throw new Error('请先启用 GitHub 备份');
      await serial(async () => { await (await service(cfg)).startRestore(); await scheduleWork(); }); return { started: true };
    }
    default: throw new Error('不支持的操作');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(message).then(data => { respond({ ok: true, data }); if (['sync', 'saveConfig', 'restore'].includes(message.action)) void pump(); },
    error => respond({ ok: false, error: errorMessage(error) }));
  return true;
});
chrome.history.onVisited.addListener(item => {
  void serial(async () => { if ((await config()).enabled) await collector.recordVisit(item); })
    .catch(e => db.set('serviceError', `实时采集失败：${errorMessage(e)}`));
});
chrome.alarms.onAlarm.addListener(alarm => {
  void serial(async () => {
    const cfg = await config();
    if (cfg.enabled && ['mimir-capture', 'mimir-backup'].includes(alarm.name)) await collector.start(cfg.github.enabled && alarm.name === 'mimir-backup');
    else if (cfg.github.enabled && alarm.name === 'mimir-backup') await db.set('backupWanted', true);
  }).then(pump).catch(e => console.error(errorMessage(e)));
});
chrome.runtime.onInstalled.addListener(() => { void serial(() => initialize(true)).then(pump).catch(e => console.error(errorMessage(e))); });
chrome.runtime.onStartup.addListener(() => { void serial(() => initialize(true)).then(pump).catch(e => console.error(errorMessage(e))); });
void serial(() => initialize()).then(pump).catch(e => console.error(errorMessage(e)));
