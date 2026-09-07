import { $, rpc, notice, showStatus } from './lib/client.js';
import { base64ToBytes, decodeArchive, legacyRows, sha256, MAX_ARCHIVE_BYTES } from './lib/format.js';
let cancelled = false, fileBusy = false;
function values() {
  return { enabled: $('enabled').checked,
    ai: { url: $('aiUrl').value.trim(), model: $('aiModel').value.trim(), key: $('aiKey').value.trim() },
    github: { enabled: $('githubEnabled').checked, owner: $('owner').value.trim(), repo: $('repo').value.trim(), branch: $('branch').value.trim(), token: $('token').value.trim() } };
}
async function load() {
  try {
    const cfg = await rpc('getConfig'); $('enabled').checked = cfg.enabled; $('githubEnabled').checked = cfg.github.enabled;
    for (const key of ['owner', 'repo', 'branch', 'token']) $(key).value = cfg.github[key];
    $('aiUrl').value = cfg.ai.url; $('aiModel').value = cfg.ai.model; $('aiKey').value = cfg.ai.key;
    await refresh();
  } catch (e) { notice(e.message, true); }
}
function reportText(r) { return `读取 ${r.read.toLocaleString()} 条；新增 ${r.inserted.toLocaleString()}，重复 ${r.duplicates.toLocaleString()}，更新旧版记录 ${r.upgraded.toLocaleString()}，无效 ${r.invalid.toLocaleString()}。${r.completed ? '导入完成。' : '导入未完成，已写入的记录保留。'}`; }
async function refresh() {
  try { const state = await rpc('status'); showStatus(state); if (state.lastImport && !fileBusy) $('importSummary').textContent = reportText(state.lastImport); }
  catch (e) { notice(e.message, true); }
}
$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true; notice('正在验证并保存…');
  try {
    const cfg = values();
    if (cfg.ai.url) {
      const url = new URL(cfg.ai.url);
      const origin = `${url.protocol}//${url.hostname}/*`;
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error('未获得 AI 服务访问权限，设置尚未保存');
    }
    const saved = await rpc('saveConfig', { config: cfg }); $('branch').value = saved.github.branch;
    notice('设置已保存。'); await refresh();
  } catch (e) { notice(e.message, true); } finally { $('save').disabled = false; }
});
$('sync').addEventListener('click', async () => { try { await rpc('sync'); notice('同步已启动，关闭页面后仍会继续。'); await refresh(); } catch (e) { notice(e.message, true); } });
$('restore').addEventListener('click', async () => { try { await rpc('restore'); notice('恢复已启动，重复记录会自动跳过。'); await refresh(); } catch (e) { notice(e.message, true); } });
function busy(value) { fileBusy = value; $('cancelFiles').hidden = !value; for (const id of ['export', 'importFiles', 'importFolder']) $(id).disabled = value; }
async function writeFile(directory, name, bytes) {
  const handle = await directory.getFileHandle(name, { create: true }); const writer = await handle.createWritable();
  try { await writer.write(bytes); await writer.close(); } catch (e) { await writer.abort().catch(() => {}); throw e; }
}
$('export').addEventListener('click', async () => {
  cancelled = false; busy(true); let index = null, directory = null;
  try {
    if (!window.showDirectoryPicker) throw new Error('当前浏览器不支持文件夹导出，请使用新版 Edge');
    const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
    directory = await parent.getDirectoryHandle(`Mimir-${new Date().toISOString().replace(/[:.]/g, '-')}`, { create: true });
    const { until } = await rpc('exportStart'); let cursor = null;
    index = { format: 'mimir-export', version: 1, complete: false, count: 0, files: [] };
    await writeFile(directory, 'archive-index.json', JSON.stringify(index, null, 2));
    do {
      if (cancelled) throw new Error('已取消导出，已完成的分片保留在文件夹中');
      const chunk = await rpc('exportChunk', { until, cursor });
      if (cancelled) throw new Error('已取消导出，已完成的分片保留在文件夹中');
      if (chunk.count) {
        const name = `${chunk.digest}.jsonl.gz`; await writeFile(directory, name, base64ToBytes(chunk.base64));
        index.files.push({ name, sha256: chunk.digest, count: chunk.count }); index.count += chunk.count;
        await writeFile(directory, 'archive-index.json', JSON.stringify(index, null, 2));
        $('fileStatus').textContent = `已导出 ${index.count.toLocaleString()} 条，${index.files.length} 个分片…`;
      }
      cursor = chunk.cursor; if (chunk.done) break;
    } while (true);
    if (cancelled) throw new Error('已取消导出，已完成的分片保留在文件夹中');
    index.complete = true; await writeFile(directory, 'archive-index.json', JSON.stringify(index, null, 2));
    $('fileStatus').textContent = `导出完成：${index.count.toLocaleString()} 条，${index.files.length} 个分片。文件夹：${directory.name}`;
  } catch (e) { $('fileStatus').textContent = e.name === 'AbortError' ? '已取消文件夹选择。' : e.message; }
  finally { busy(false); }
});
$('importFiles').addEventListener('click', () => $('files').click());
$('importFolder').addEventListener('click', () => $('folder').click());
$('cancelFiles').addEventListener('click', () => { cancelled = true; $('fileStatus').textContent = '正在停止，当前已提交的数据会保留…'; });
async function importFiles(files, folderMode) {
  if (!files.length) return;
  cancelled = false; busy(true); $('fileStatus').textContent = '正在读取文件…';
  const report = { read: 0, inserted: 0, duplicates: 0, upgraded: 0, invalid: 0, completed: false, filesCompleted: 0, startedAt: Date.now() };
  try {
    let selected = files;
    if (folderMode) {
      const manifest = files.find(f => f.name === 'archive-index.json');
      if (!manifest) throw new Error('未找到导出清单。单个分片请使用“选择文件导入”。');
      const index = JSON.parse(await manifest.text());
      if (index.format !== 'mimir-export' || index.version !== 1 || !index.complete) throw new Error('这份导出尚未完成。如需恢复已有分片，请选择文件单独导入。');
      if (!Array.isArray(index.files) || index.files.some(e => !/^[a-f0-9]{64}\.jsonl\.gz$/.test(e.name))) throw new Error('导出清单无效');
      const byName = new Map(files.map(f => [f.name, f])); selected = [];
      for (const entry of index.files) {
        const file = byName.get(entry.name);
        if (!file || file.size > MAX_ARCHIVE_BYTES || await sha256(await file.arrayBuffer()) !== entry.sha256) throw new Error(`分片缺失或损坏：${entry.name}`);
        selected.push(file); if (cancelled) throw new Error('已取消导入');
      }
    }
    for (const file of selected) {
      if (cancelled) throw new Error('已取消导入');
      let rows, strict;
      if (file.name.endsWith('.gz')) {
        if (file.size > MAX_ARCHIVE_BYTES) throw new Error('归档分片超过 512 KiB');
        rows = await decodeArchive(await file.arrayBuffer()); strict = true;
      } else if (file.name.endsWith('.json')) {
        if (file.size > 128 * 1024 * 1024) throw new Error('旧版 JSON 超过 128 MB，请拆分后导入');
        rows = legacyRows(JSON.parse(await file.text())); strict = false;
      } else throw new Error(`不支持的文件：${file.name}`);
      for (let offset = 0; offset < rows.length; offset += 500) {
        if (cancelled) throw new Error('已取消导入');
        const result = await rpc('importRows', { rows: rows.slice(offset, offset + 500), strict });
        for (const key of ['read', 'inserted', 'duplicates', 'upgraded', 'invalid']) report[key] += result[key];
        await rpc('importReport', { report });
        $('fileStatus').textContent = `正在导入 ${file.name} · 已读取 ${report.read.toLocaleString()} 条`;
      }
      report.filesCompleted++;
    }
    report.completed = true; $('fileStatus').textContent = '导入完成。';
  } catch (e) { report.error = e.message; $('fileStatus').textContent = e.message; }
  finally {
    report.finishedAt = Date.now();
    try { await rpc('importReport', { report }); } catch (e) { notice(e.message, true); }
    $('importSummary').textContent = reportText(report); busy(false); await refresh();
  }
}
$('files').addEventListener('change', async () => { await importFiles([...$('files').files], false); $('files').value = ''; });
$('folder').addEventListener('change', async () => { await importFiles([...$('folder').files], true); $('folder').value = ''; });
void load(); setInterval(refresh, 5000);
