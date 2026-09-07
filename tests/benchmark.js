(async () => {
  const { ArchiveDB, Statistics } = await import('./lib/archive-db.js');
  const { encodeArchive, decodeArchive, publicRecord, sha256 } = await import('./lib/format.js');
  const name = 'Benchmark-' + crypto.randomUUID(); const source = new ArchiveDB(name); const target = new ArchiveDB(name + '-restore');
  const count = 100000, now = Date.now() - 10000;
  const metrics = {};
  let start = performance.now();
  for (let offset = 0; offset < count; offset += 500) {
    await source.putRecords(Array.from({ length: 500 }, (_, j) => {
      const i = offset + j;
      return { sourceId: 'benchmark', visitId: String(i), url: `https://site${i % 97}.example/topic/${i}`, title: `Topic ${i}`, time: now - (i % 1000) * 60000, transition: 'link' };
    }), { strict: true });
  }
  metrics.insertMs = Math.round(performance.now() - start);
  start = performance.now(); const first = await source.page({ start: 0, end: Date.now() });
  if (first.rows.length !== 50 || new Set(first.rows.map(r => r.key)).size !== 50) throw new Error('Pagination failed');
  metrics.pageMs = Math.round(performance.now() - start);
  start = performance.now(); const noMatch = await source.page({ query: 'does-not-exist' });
  if (noMatch.rows.length || noMatch.scanned !== 2000 || !noMatch.cursor) throw new Error('Search is not bounded');
  metrics.noMatchBatchMs = Math.round(performance.now() - start);
  start = performance.now(); let cursor = null; const stats = new Statistics();
  do { const chunk = await source.scan({}, cursor); stats.add(chunk.rows); cursor = chunk.cursor; } while (cursor);
  const summary = stats.result(); if (summary.total !== count || summary.uniqueUrls !== count || summary.domainCount !== 97) throw new Error('Statistics mismatch');
  metrics.statisticsMs = Math.round(performance.now() - start);
  start = performance.now(); let shards = 0, bytes = 0; cursor = null;
  do {
    const chunk = await source.archiveChunk(0, await source.maxSeq(), cursor);
    if (chunk.rows.length) {
      const encoded = await encodeArchive(chunk.rows); if (encoded.length > 512 * 1024) throw new Error('Oversized shard');
      const rows = await decodeArchive(encoded); await target.putRecords(rows, { strict: true }); shards++; bytes += encoded.length;
    }
    cursor = chunk.cursor; if (chunk.done) break;
  } while (true);
  metrics.exportRestoreMs = Math.round(performance.now() - start);
  async function signature(database) {
    let pointer = null; const hashes = [];
    do { const part = await database.scan({}, pointer); hashes.push(await sha256(new TextEncoder().encode(JSON.stringify(part.rows.map(publicRecord))))); pointer = part.cursor; } while (pointer);
    return hashes.join('');
  }
  const identical = await signature(source) === await signature(target);
  const restored = await target.count(); if (!identical || restored !== count) throw new Error('Restored fields differ');
  await source.close(); await target.close();
  for (const database of [name, name + '-restore']) await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(database); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  return { count, ...metrics, shards, compressedBytes: bytes, restored, identical };
})()
