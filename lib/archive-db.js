import './idb.js';
import { normalizeRecord, publicRecord, localDate } from './format.js';

export class ArchiveDB {
  constructor(name = 'MimirArchive') { this.name = name; this.opening = null; }
  open() {
    if (!this.opening) {
      this.opening = globalThis.idb.openDB(this.name, 1, {
        upgrade(db) {
          const visits = db.createObjectStore('visits', { keyPath: 'seq', autoIncrement: true });
          visits.createIndex('key', 'key', { unique: true });
          visits.createIndex('match', ['url', 'time']);
          visits.createIndex('time', ['time', 'key']);
          visits.createIndex('domainTime', ['domain', 'time', 'key']);
          db.createObjectStore('meta');
          db.createObjectStore('batches', { keyPath: 'id' });
        },
        blocked() { console.error('数据库升级被旧页面阻塞，请关闭旧的 Mimir 页面'); },
        blocking: () => { this.close(); },
        terminated: () => { this.opening = null; }
      }).catch(error => { this.opening = null; throw error; });
    }
    return this.opening;
  }
  async close() { const opening = this.opening; this.opening = null; if (opening) (await opening).close(); }
  async get(key) { return (await this.open()).get('meta', key); }
  async set(key, value) { const db = await this.open(); await db.put('meta', value, key); }
  async remove(key) { await (await this.open()).delete('meta', key); }
  async putRecords(rows, { strict = false, legacySource = 'legacy', checkpoint } = {}) {
    const normalized = []; let invalid = 0;
    for (const raw of rows) {
      try { normalized.push(normalizeRecord(raw, legacySource)); }
      catch (e) { if (strict) throw e; invalid++; }
    }
    const db = await this.open(); const tx = db.transaction(['visits', 'meta'], 'readwrite');
    const store = tx.objectStore('visits');
    const result = { read: rows.length, inserted: 0, duplicates: 0, upgraded: 0, invalid };
    try {
      for (const record of normalized) {
        if (await store.index('key').getKey(record.key)) { result.duplicates++; continue; }
        const matches = await store.index('match').getAll([record.url, record.time]);
        if (record.legacy && matches.length) { result.duplicates++; continue; }
        const old = matches.find(r => r.legacy);
        if (old) { await store.delete(old.seq); result.upgraded++; }
        else result.inserted++;
        await store.add(record);
      }
      if (checkpoint) await tx.objectStore('meta').put(checkpoint.value, checkpoint.key);
      await tx.done;
      return result;
    } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw error; }
  }
  async maxSeq() {
    const cursor = await (await this.open()).transaction('visits').store.openCursor(null, 'prev');
    return cursor?.primaryKey || 0;
  }
  async count() { return (await this.open()).count('visits'); }
  async after(seq, limit = 500, until = Infinity) {
    const db = await this.open(); const tx = db.transaction('visits'); const rows = [];
    let cursor = await tx.store.openCursor(IDBKeyRange.lowerBound(seq, true));
    while (cursor && rows.length < limit && cursor.primaryKey <= until) { rows.push(cursor.value); cursor = await cursor.continue(); }
    return rows;
  }
  async pendingCount(seq) { return (await this.open()).count('visits', IDBKeyRange.lowerBound(seq, true)); }
  range(filter = {}, cursor = null) {
    const start = Number(filter.start ?? 0), end = Number(filter.end ?? Date.now());
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) throw new Error('日期范围无效');
    const domain = String(filter.domain || '').trim().toLowerCase();
    const lower = domain ? [domain, start, ''] : [start, ''];
    const upper = cursor || (domain ? [domain, end, '\uffff'] : [end, '\uffff']);
    if (cursor && JSON.stringify(cursor) === JSON.stringify(lower)) return null;
    return { index: domain ? 'domainTime' : 'time', key: IDBKeyRange.bound(lower, upper, false, !!cursor) };
  }
  async scan(filter = {}, cursor = null, max = 1000) {
    const range = this.range(filter, cursor); if (!range) return { rows: [], cursor: null };
    const db = await this.open(); const tx = db.transaction('visits');
    let c = await tx.store.index(range.index).openCursor(range.key, 'prev');
    const rows = []; let last = null;
    while (c && rows.length < max) { rows.push(c.value); last = c.key; c = await c.continue(); }
    return { rows, cursor: c ? last : null };
  }
  async page(filter = {}, cursor = null, limit = 50) {
    // Bound each request even when the keyword has no matches. The page can continue or cancel between requests.
    const range = this.range(filter, cursor); if (!range) return { rows: [], cursor: null };
    const tx = (await this.open()).transaction('visits');
    let c = await tx.store.index(range.index).openCursor(range.key, 'prev');
    const rows = []; let scanned = 0, last = null;
    const q = String(filter.query || '').toLowerCase();
    while (c && scanned < 2000 && rows.length < Math.min(100, limit)) {
      const r = c.value; scanned++; last = c.key;
      if (!q || r.url.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) rows.push(publicRecord(r));
      c = await c.continue();
    }
    return { rows, cursor: c ? last : null, scanned };
  }
  async batchGet(id) { return (await this.open()).get('batches', id); }
  async batchPut(batch) { await (await this.open()).put('batches', batch); }
  async finishBatch(batch, state) {
    const tx = (await this.open()).transaction(['batches', 'meta'], 'readwrite');
    await tx.objectStore('meta').put(state, `backup:${batch.destination}`);
    await tx.objectStore('batches').delete(batch.id);
    await tx.done;
  }
}

export class Statistics {
  constructor() { this.total = 0; this.urls = new Set(); this.domains = new Map(); this.days = new Map(); this.hours = Array(24).fill(0); this.buckets = new Map(); this.legacy = 0; }
  add(rows, query = '') {
    const q = query.toLowerCase();
    for (const r of rows) {
      if (q && !r.url.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) continue;
      this.total++; this.urls.add(r.url); if (r.legacy) this.legacy++;
      this.domains.set(r.domain, (this.domains.get(r.domain) || 0) + 1);
      const day = localDate(r.time); this.days.set(day, (this.days.get(day) || 0) + 1);
      this.hours[new Date(r.time).getHours()]++;
      // Bounded, reproducible reservoir of date/domain strata: at most 180 groups and two titles each.
      const group = `${day}|${r.domain}`;
      const score = hash(group);
      if (!this.buckets.has(group)) {
        if (this.buckets.size >= 180) {
          let worst = null;
          for (const [k, v] of this.buckets) if (!worst || v.score > worst[1]) worst = [k, v.score];
          if (score >= worst[1]) continue;
          this.buckets.delete(worst[0]);
        }
        this.buckets.set(group, { score, samples: [] });
      }
      const bucket = this.buckets.get(group);
      const title = r.title === r.url ? r.domain : r.title.replace(/https?:\/\/\S+/g, '[网址]').slice(0, 160);
      if (bucket.samples.length < 2 && !bucket.samples.some(s => s.title === title)) bucket.samples.push({ date: day, domain: r.domain, title });
    }
  }
  result() {
    const domains = [...this.domains].sort((a, b) => b[1] - a[1]);
    const samples = [...this.buckets].sort((a, b) => a[1].score - b[1].score).flatMap(([, b]) => b.samples).slice(0, 180);
    return { total: this.total, uniqueUrls: this.urls.size, domainCount: this.domains.size, legacy: this.legacy,
      domains: domains.slice(0, 30), days: [...this.days].sort((a, b) => a[0].localeCompare(b[0])), hours: this.hours, samples };
  }
}
function hash(s) { let n = 2166136261; for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619); return n >>> 0; }

ArchiveDB.prototype.archiveChunk = async function (after, until, cursor = null, limit = 1000) {
  const range = this.range({ start: 0, end: Number.MAX_SAFE_INTEGER }, cursor);
  if (!range) return { rows: [], cursor: null, done: true };
  const tx = (await this.open()).transaction('visits');
  let c = await tx.store.index('time').openCursor(range.key, 'prev');
  let last = null, group = null, scanned = 0; const rows = [];
  while (c && scanned < 2000 && rows.length < limit) {
    const row = c.value;
    if (row.seq > after && row.seq <= until) {
      const currentGroup = `${row.sourceId}|${new Date(row.time).toISOString().slice(0, 10)}`;
      if (group && currentGroup !== group) break;
      group = currentGroup; rows.push(row);
    }
    last = c.key; scanned++; c = await c.continue();
  }
  return { rows, cursor: c ? last : null, done: !c };
};
