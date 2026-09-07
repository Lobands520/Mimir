import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveDB, Statistics } from '../lib/archive-db.js';
import { normalizeRecord, encodeArchive, decodeArchive, publicRecord, sha256, bytesToBase64, base64ToBytes, DAY } from '../lib/format.js';
import { HistoryCollector } from '../lib/history.js';
import { BackupService, GitHubClient } from '../lib/backup.js';
import { analysisInput, analyze } from '../lib/ai.js';
const time = Date.now() - DAY;
function db() { return new ArchiveDB(`test-${crypto.randomUUID()}`); }
function row(id = '1', extra = {}) { return { sourceId: 'device-a', visitId: id, url: 'https://example.com/page?x=1', title: 'Example', time, transition: 'link', ...extra }; }
function remote() {
  const files = new Map(); let puts = 0, lost = false, fail = null, privateRepo = true;
  const json = (value, status = 200, headers) => new Response(JSON.stringify(value), { status, headers });
  return {
    files, get puts() { return puts; }, loseNext() { lost = true; }, reject(status, headers) { fail = { status, headers }; }, makePublic() { privateRepo = false; },
    fetch: async (url, options = {}) => {
      if (fail) { const { status, headers } = fail; fail = null; return json({}, status, headers); }
      const path = decodeURIComponent(new URL(url).pathname);
      if (path === '/repos/user/archive') return json({ private: privateRepo, default_branch: 'main' });
      if (path.includes('/branches/')) return json({ commit: { sha: 'commit', commit: { tree: { sha: 'root' } } } });
      if (path.includes('/git/trees/')) {
        const root = path.split('/git/trees/')[1]; const prefix = root === 'root' ? '' : `${root}/`; const entries = new Map();
        for (const name of files.keys()) {
          if (!name.startsWith(prefix)) continue;
          const rest = name.slice(prefix.length), part = rest.split('/')[0];
          entries.set(part, { path: part, type: rest.includes('/') ? 'tree' : 'blob', sha: prefix + part });
        }
        return json({ tree: [...entries.values()], truncated: false });
      }
      if (path.includes('/contents/')) {
        const name = path.split('/contents/')[1];
        if (options.method === 'PUT') {
          if (files.has(name)) return json({}, 409);
          files.set(name, base64ToBytes(JSON.parse(options.body).content)); puts++;
          if (lost) { lost = false; throw new TypeError('lost response'); }
          return json({ content: { path: name } }, 201);
        }
        const bytes = files.get(name); return bytes ? json({ content: bytesToBase64(bytes), size: bytes.length, encoding: 'base64' }) : json({}, 404);
      }
      throw new Error(`Unexpected endpoint ${path}`);
    }
  };
}
function backup(database, mock) { return new BackupService(database, new GitHubClient({ owner: 'user', repo: 'archive', branch: 'main', token: 'secret-token' }, mock.fetch)); }
async function drain(service, max = 1000) { for (let i = 0; i < max; i++) { if (!(await service.state()).job) return; await service.step(); } throw new Error('Backup did not finish'); }

test('individual visits survive repeated sync and title changes; legacy snapshots reconcile', async () => {
  const database = db();
  assert.equal((await database.putRecords([row(), row('2')])).inserted, 2);
  assert.equal((await database.putRecords([row('1', { title: 'Changed title' }), row('2')])).duplicates, 2);
  const legacy = { url: row().url, timestamp: time, title: 'Old', visitCount: 999 };
  assert.equal((await database.putRecords([legacy])).duplicates, 1);
  assert.equal(await database.count(), 2);
  const other = { url: 'https://old.example/', timestamp: time - 2000, title: 'Legacy' };
  await database.putRecords([other]);
  const result = await database.putRecords([row('3', { url: other.url, time: other.timestamp })]);
  assert.equal(result.upgraded, 1); assert.equal(await database.count(), 3);
  assert.equal((await database.putRecords([other])).duplicates, 1);
  assert.equal((await database.after(0)).filter(r => r.legacy).length, 0);
  await database.close();
});

test('concurrent writes deduplicate and transaction abort does not commit records or checkpoint', async () => {
  const database = db();
  await Promise.all([database.putRecords([row()]), database.putRecords([row()])]);
  assert.equal(await database.count(), 1);
  const real = await database.open(); let calls = 0;
  database.open = async () => ({ transaction: (...args) => {
    const tx = real.transaction(...args);
    return { get done() { return tx.done; }, abort: () => tx.abort(), objectStore: name => {
      const store = tx.objectStore(name);
      if (name !== 'visits') return store;
      return new Proxy(store, { get(target, key) {
        if (key === 'add') return async value => { calls++; if (calls === 2) { tx.abort(); throw new Error('disk write failure'); } return target.add(value); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
  } });
  await assert.rejects(database.putRecords([row('4'), row('5')], { checkpoint: { key: 'lastCapture', value: 123 } }), /disk write failure/);
  database.open = async () => real;
  assert.equal(await database.count(), 1); assert.equal(await database.get('lastCapture'), undefined);
  await database.close();
});

test('invalid legacy rows are counted, strict archive rows reject the whole batch', async () => {
  const database = db();
  const result = await database.putRecords([row(), { url: 'javascript:alert(1)', timestamp: time }, { url: 'https://a/', time: 0 }]);
  assert.deepEqual(result, { read: 3, inserted: 1, duplicates: 0, upgraded: 0, invalid: 2 });
  await assert.rejects(database.putRecords([row('2'), { url: 'bad' }], { strict: true }));
  assert.equal(await database.count(), 1); await database.close();
});

test('archive round trip retains exact public fields and rejects corruption', async () => {
  const records = [row(), row('2', { time: time + 1000, title: '中文 <script>unsafe</script>', apiKey: 'must-not-export' })].map(r => normalizeRecord(r));
  const bytes = await encodeArchive(records);
  assert.deepEqual(await decodeArchive(bytes), records);
  const restored = db(); await restored.putRecords(await decodeArchive(bytes), { strict: true });
  assert.deepEqual((await restored.after(0)).map(publicRecord), records);
  assert.ok(!(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()).includes('must-not-export'));
  const corrupt = bytes.slice(); corrupt[Math.floor(corrupt.length / 2)] ^= 0xff;
  await assert.rejects(decodeArchive(corrupt)); await restored.close();
});

test('history query splitting, durable progress and per-visit backfill', async () => {
  const database = db(); let searches = 0, visitFailure = true;
  const api = {
    search: async ({ startTime, endTime, maxResults }) => { assert.equal(maxResults, 1000); searches++; return endTime - startTime > 5000 ? Array(1000).fill({ url: row().url }) : [{ url: row().url, title: 'Browser title' }]; },
    getVisits: async () => { if (visitFailure) { visitFailure = false; throw new Error('browser interrupted'); } return [1, 2, 3].map(i => ({ visitId: String(i), visitTime: time + i, transition: 'link' })); }
  };
  const collector = new HistoryCollector(database, api);
  await database.set('lastCapture', time - 100); await collector.start();
  const task = await database.get('capture'); task.since = time; task.until = time + 10000; task.windows = [[task.since, task.until]]; await database.set('capture', task);
  await collector.step(); await collector.step();
  await assert.rejects(collector.step(), /browser interrupted/);
  assert.equal(await database.get('lastCapture'), time - 100);
  const resumed = new HistoryCollector(database, api);
  for (let i = 0; i < 30 && await database.get('capture'); i++) await resumed.step();
  assert.equal(await database.count(), 3); assert.equal(await database.get('lastCapture'), time + 10000); assert.ok(searches >= 3);
  await database.close();
});

test('lost GitHub success response reuses a frozen batch without duplicate upload', async () => {
  const database = db(); await database.putRecords([row(), row('2')]);
  const mock = remote(), service = backup(database, mock); await service.start(); await service.step();
  const frozen = await database.batchGet(service.destination); assert.ok(frozen.bytes.length <= 512 * 1024);
  mock.loseNext();
  await assert.rejects(service.step(), /网络/);
  assert.equal((await service.state()).cursor, 0); assert.equal(mock.puts, 1);
  const resumed = backup(database, mock); await drain(resumed);
  assert.equal(mock.puts, 1); assert.equal((await resumed.state()).cursor, await database.maxSeq());
  assert.equal(await database.batchGet(service.destination), undefined);
  await database.putRecords([row('3', { time: time - DAY * 30 })]);
  await resumed.start(); await drain(resumed); assert.equal(mock.puts, 2);
  await database.close();
});

test('GitHub permission, rate limits, and public repositories never report success', async () => {
  const database = db(); await database.putRecords([row()]); const mock = remote(), service = backup(database, mock);
  mock.reject(401); await assert.rejects(service.start(), /令牌失效/); assert.equal((await service.state()).lastSuccess, 0);
  mock.reject(429, { 'retry-after': '120' });
  try { await service.start(); assert.fail('should fail'); } catch (error) { assert.equal(error.retryable, true); await service.fail(error); }
  assert.ok((await service.state()).retryAt >= Date.now() + 119000);
  mock.makePublic(); await assert.rejects(service.start(), /私有仓库/); assert.equal(mock.puts, 0); await database.close();
});

test('GitHub restoration verifies shards and repeated restore deduplicates', async () => {
  const source = db(); await source.putRecords([row(), row('2', { time: time - DAY * 2 })]); const mock = remote();
  const uploader = backup(source, mock); await uploader.start(); await drain(uploader);
  const target = db(), restorer = backup(target, mock);
  for (let run = 0; run < 2; run++) {
    await restorer.startRestore();
    for (let i = 0; i < 100 && await target.get('restore'); i++) await restorer.restoreStep();
    assert.equal(await target.count(), 2);
  }
  assert.equal((await target.get('lastRestore')).duplicates, 2);
  const name = [...mock.files.keys()][0]; mock.files.get(name)[0] ^= 1;
  await restorer.startRestore(); let failed = false;
  for (let i = 0; i < 100 && await target.get('restore'); i++) {
    try { await restorer.restoreStep(); } catch (error) { assert.match(error.message, /校验失败/); failed = true; break; }
  }
  assert.equal(failed, true); assert.equal(await target.count(), 2); await source.close(); await target.close();
});

test('pagination handles equal timestamps, absent keywords and exact domains', async () => {
  const database = db(); await database.putRecords(Array.from({ length: 130 }, (_, i) => row(String(i), { url: `https://${i % 2 ? 'example.com' : 'other.com'}/${i}`, title: `Page ${i}` })));
  let cursor = null; const keys = [];
  do { const page = await database.page({ start: 0, end: Date.now() }, cursor); keys.push(...page.rows.map(r => r.key)); cursor = page.cursor; } while (cursor);
  assert.equal(keys.length, 130); assert.equal(new Set(keys).size, 130);
  const filtered = await database.page({ domain: 'example.com', query: 'Page 1' }); assert.ok(filtered.rows.every(r => r.domain === 'example.com' && r.title.includes('Page 1')));
  assert.equal((await database.page({ query: 'no-match' })).rows.length, 0); await database.close();
});

test('AI receives bounded evidence without full URLs, uses the exact selected model and can abort', async () => {
  const stats = new Statistics();
  stats.add(Array.from({ length: 10000 }, (_, i) => normalizeRecord(row(String(i), { time: time - i * DAY / 10, url: `https://example.com/private?secret=${i}`, title: i % 3 ? `Topic ${i}` : 'https://example.com/?private=key' }))));
  const summary = stats.result(); assert.ok(summary.samples.length <= 180);
  const messages = analysisInput(summary, { start: 'x', end: 'y' });
  assert.ok(JSON.stringify(messages).length < 100000); assert.ok(!JSON.stringify(messages).includes('private=key')); assert.ok(!JSON.stringify(messages).includes('?secret='));
  const controller = new AbortController(); let body;
  const answer = await analyze({ url: 'https://ai.example/chat', model: 'my-specific-model', key: 'secret' }, summary, {}, '', controller.signal,
    async (_url, options) => { body = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'Observation' } }] })); });
  assert.equal(body.model, 'my-specific-model'); assert.equal(answer, 'Observation');
  controller.abort();
  await assert.rejects(analyze({ url: 'https://ai.example/chat', model: 'm', key: 's' }, summary, {}, '', controller.signal,
    async (_url, options) => { options.signal.throwIfAborted(); }), /取消/);
});

test('highly compressible long records are split before exceeding the decompression limit', async () => {
  const { packArchiveChunk } = await import('../lib/format.js');
  const rows = Array.from({ length: 400 }, (_, i) => normalizeRecord(row(String(i), { url: 'https://example.com/' + 'a'.repeat(64000) + i, time: time - i })));
  const packed = await packArchiveChunk({ rows, cursor: null, done: true });
  assert.ok(packed.rows.length < rows.length); assert.equal(packed.done, false);
  assert.equal((await decodeArchive(packed.bytes)).length, packed.rows.length);
  assert.deepEqual(packed.cursor, [packed.rows.at(-1).time, packed.rows.at(-1).key]);
});
