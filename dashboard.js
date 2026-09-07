import { $, rpc, notice, showStatus, download } from './lib/client.js';
import { localDate, dateBounds } from './lib/format.js';
import { Statistics } from './lib/archive-db.js';
import { analyze } from './lib/ai.js';
let generation = 0, pageStarts = [null], pageNumber = 0, nextCursor = null, activeFilter = {}, stats = null, aiController = null;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function range(days) { const now = new Date(); $('end').value = localDate(now); if (days === 'all') $('start').value = ''; else { now.setDate(now.getDate() - Number(days) + 1); $('start').value = localDate(now); } }
function filter() { return { ...dateBounds($('start').value, $('end').value), query: $('query').value.trim(), domain: $('domain').value.trim() }; }
function row(record) {
  const tr = document.createElement('tr'), date = document.createElement('td'), page = document.createElement('td'), domain = document.createElement('td');
  date.textContent = new Date(record.time).toLocaleString('zh-CN', { hour12: false });
  const a = document.createElement('a'); a.href = record.url; a.textContent = record.title; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = record.title;
  const detail = document.createElement('small'); detail.textContent = record.url;
  page.append(a, detail); domain.textContent = record.domain; if (record.legacy) { const tag = document.createElement('small'); tag.textContent = '旧版记录'; domain.append(tag); }
  tr.append(date, page, domain); return tr;
}
async function loadPage(token) {
  $('next').disabled = true; $('previous').disabled = true;
  $('historyRows').replaceChildren(); $('empty').hidden = false; $('empty').textContent = '正在查找…';
  let cursor = pageStarts[pageNumber], rows = [];
  do {
    const result = await rpc('query', { filter: activeFilter, cursor, limit: 50 - rows.length });
    if (generation !== token) return;
    rows.push(...result.rows); cursor = result.cursor;
    await tick();
  } while (cursor && rows.length < 50);
  if (generation !== token) return;
  $('historyRows').replaceChildren(...rows.map(row)); $('empty').hidden = !!rows.length; $('empty').textContent = '所选范围没有匹配的历史。';
  nextCursor = cursor; $('next').disabled = !cursor; $('previous').disabled = pageNumber === 0;
  $('pageLabel').textContent = `第 ${pageNumber + 1} 页 · ${rows.length} 条`;
}
function renderStats(value) {
  for (const [id, count] of Object.entries({ rangeTotal: value.total, uniqueUrls: value.uniqueUrls, domainCount: value.domainCount, activeDays: value.days.length })) $(id).textContent = count.toLocaleString();
  $('matchedCount').textContent = `匹配 ${value.total.toLocaleString()} 条记录`;
  $('domainChart').replaceChildren();
  const max = value.domains[0]?.[1] || 1;
  for (const [name, count] of value.domains.slice(0, 7)) {
    const line = document.createElement('div'); line.className = 'bar-row';
    const label = document.createElement('span'); label.className = 'bar-label'; label.textContent = name; label.title = name;
    const track = document.createElement('div'); track.className = 'bar-track'; const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${count / max * 100}%`; track.append(fill);
    const number = document.createElement('span'); number.textContent = count.toLocaleString(); line.append(label, track, number); $('domainChart').append(line);
  }
  if (!value.total) $('domainChart').textContent = '暂无数据';
  $('hourChart').replaceChildren(); const peak = Math.max(1, ...value.hours);
  value.hours.forEach((count, hour) => { const bar = document.createElement('div'); bar.className = 'hour'; bar.style.height = `${Math.max(2, count / peak * 100)}%`; bar.title = `${hour} 时：${count} 次`; $('hourChart').append(bar); });
  $('sampleLabel').textContent = `${value.total.toLocaleString()} 条记录 · ${value.samples.length} 条标题样本`;
  $('legacyNote').textContent = value.legacy ? `包含 ${value.legacy.toLocaleString()} 条旧版记录，可能不覆盖当时的每次访问。` : '';
  $('analyze').disabled = !value.total;
}
async function loadStats(token) {
  const accumulator = new Statistics(); let cursor = null, scanned = 0;
  do {
    const result = await rpc('scan', { filter: activeFilter, cursor });
    if (generation !== token) return;
    accumulator.add(result.rows, activeFilter.query); cursor = result.cursor; scanned += result.rows.length;
    $('searchState').textContent = `已扫描 ${scanned.toLocaleString()} 条`;
    await tick();
  } while (cursor);
  if (generation !== token) return;
  stats = accumulator.result(); renderStats(stats); $('searchState').textContent = '统计完成';
}
async function search() {
  let nextFilter; try { nextFilter = filter(); } catch (e) { notice(e.message, true); return; }
  const token = ++generation; activeFilter = nextFilter; pageStarts = [null]; pageNumber = 0; stats = null;
  aiController?.abort(); $('aiOutput').hidden = true; $('exportAI').disabled = true;
  $('analyze').disabled = true; $('cancelSearch').hidden = false; notice('');
  try { await Promise.all([loadPage(token), loadStats(token)]); }
  catch (e) { if (token === generation) notice(e.message, true); }
  finally { if (token === generation) $('cancelSearch').hidden = true; }
}
$('filters').addEventListener('submit', e => { e.preventDefault(); void search(); });
for (const button of document.querySelectorAll('[data-range]')) button.addEventListener('click', () => { range(button.dataset.range); void search(); });
$('cancelSearch').addEventListener('click', () => { generation++; $('cancelSearch').hidden = true; $('searchState').textContent = '查询已取消'; $('next').disabled = true; $('previous').disabled = true; });
$('next').addEventListener('click', async () => { pageStarts[++pageNumber] = nextCursor; try { await loadPage(generation); } catch (e) { notice(e.message, true); } });
$('previous').addEventListener('click', async () => { pageNumber--; try { await loadPage(generation); } catch (e) { notice(e.message, true); } });
$('sync').addEventListener('click', async () => { try { await rpc('sync'); notice('同步已启动。完成后点击“查找”刷新档案。'); } catch (e) { notice(e.message, true); } });
$('analyze').addEventListener('click', async () => {
  if (!stats) return;
  const controller = new AbortController(); aiController = controller; const token = generation;
  $('analyze').disabled = true; $('cancelAI').hidden = false; $('aiOutput').hidden = false; $('aiOutput').textContent = '正在分析…'; $('exportAI').disabled = true;
  try {
    const cfg = (await rpc('getConfig')).ai;
    const output = await analyze(cfg, stats, { start: new Date(activeFilter.start).toISOString(), end: new Date(activeFilter.end).toISOString(), domain: activeFilter.domain || undefined, keywordFilterApplied: !!activeFilter.query }, $('question').value, controller.signal);
    if (generation === token) { $('aiOutput').textContent = output; $('exportAI').disabled = false; }
  } catch (e) { if (generation === token) $('aiOutput').textContent = e.message; }
  finally { if (aiController === controller) { aiController = null; $('cancelAI').hidden = true; $('analyze').disabled = !stats?.total; } }
});
$('cancelAI').addEventListener('click', () => aiController?.abort());
$('exportAI').addEventListener('click', () => download($('aiOutput').textContent, `Mimir-分析-${localDate()}.txt`));
window.addEventListener('pagehide', () => { generation++; aiController?.abort(); });
async function refreshStatus() { try { showStatus(await rpc('status')); } catch (e) { notice(e.message, true); } }
range('7'); void search(); void refreshStatus(); setInterval(refreshStatus, 5000);

for (const tab of ['history', 'analysis']) $(tab + 'Tab').addEventListener('click', () => {
  for (const name of ['history', 'analysis']) { $(name + 'Panel').hidden = name !== tab; $(name + 'Tab').setAttribute('aria-pressed', String(name === tab)); }
});
