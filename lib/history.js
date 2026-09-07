import { DAY } from './format.js';
export class HistoryCollector {
  constructor(db, api) { this.db = db; this.api = api; }
  async source() {
    let source = await this.db.get('sourceId');
    if (!source) { source = crypto.randomUUID(); await this.db.set('sourceId', source); }
    return source;
  }
  async start(backupWanted = false) {
    const existing = await this.db.get('capture');
    if (existing) {
      existing.backupWanted ||= backupWanted; existing.error = null;
      await this.db.set('capture', existing); return;
    }
    const since = Math.max(0, ((await this.db.get('lastCapture')) || 0) - DAY);
    const until = Date.now();
    await this.db.set('capture', { since, until, windows: [[since, until]], urls: [], index: 0,
      processedUrls: 0, inserted: 0, duplicates: 0, backupWanted, startedAt: until });
  }
  valid(item) { try { return ['http:', 'https:'].includes(new URL(item.url).protocol); } catch { return false; } }
  async records(item, since, until) {
    const visits = await this.api.getVisits({ url: item.url });
    const sourceId = await this.source();
    return visits.filter(v => v.visitTime >= since && v.visitTime <= until).map(v => ({
      sourceId, visitId: v.visitId, url: item.url, title: item.title || item.url, time: v.visitTime, transition: v.transition
    }));
  }
  async recordVisit(item) {
    if (!this.valid(item)) return;
    const rows = await this.records(item, Math.max(0, (item.lastVisitTime || Date.now()) - DAY), Date.now() + 1000);
    for (let i = 0; i < rows.length; i += 500) await this.db.putRecords(rows.slice(i, i + 500), { strict: true });
  }
  async step() {
    const task = await this.db.get('capture'); if (!task || task.error) return { done: !task };
    if (task.index < task.urls.length) {
      const item = task.urls[task.index];
      const rows = await this.records(item, task.since, task.until);
      for (let i = 0; i < rows.length; i += 500) {
        const result = await this.db.putRecords(rows.slice(i, i + 500), { strict: true });
        task.inserted += result.inserted; task.duplicates += result.duplicates;
      }
      task.index++; task.processedUrls++;
      await this.db.set('capture', task);
      return { done: false };
    }
    if (task.windows.length) {
      const [startTime, endTime] = task.windows.pop();
      const items = await this.api.search({ text: '', startTime, endTime, maxResults: 1000 });
      if (items.length >= 1000) {
        if (endTime - startTime <= 1) throw new Error('同一毫秒的历史超出查询上限，补录暂停，未推进进度');
        const mid = Math.floor((startTime + endTime) / 2);
        task.windows.push([startTime, mid], [mid, endTime]);
        task.urls = [];
      } else task.urls = items.filter(item => this.valid(item)).map(({ url, title }) => ({ url, title }));
      task.index = 0;
      await this.db.set('capture', task);
      return { done: false };
    }
    const tx = (await this.db.open()).transaction('meta', 'readwrite');
    await tx.store.put(task.until, 'lastCapture');
    await tx.store.put({ ...task, finishedAt: Date.now(), urls: [], windows: [] }, 'lastCaptureResult');
    if (task.backupWanted) await tx.store.put(true, 'backupWanted');
    await tx.store.delete('capture'); await tx.done;
    return { done: true };
  }
}
