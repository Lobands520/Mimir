export const DAY = 86400000;
export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 512 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
class ArchiveSizeError extends Error {}
const encoder = new TextEncoder();
export function localDate(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateBounds(start, end) {
  const from = start ? new Date(`${start}T00:00:00`).getTime() : 0;
  const to = end ? new Date(`${end}T00:00:00`).getTime() : Date.now();
  const next = new Date(to); if (end) next.setDate(next.getDate() + 1);
  const until = end ? next.getTime() - 1 : to;
  if (!Number.isFinite(from) || !Number.isFinite(until) || from < 0 || from > until) throw new Error('日期范围无效');
  return { start: from, end: until };
}
export function normalizeRecord(raw, legacySource = 'legacy') {
  if (!raw || typeof raw !== 'object') throw new Error('无效记录');
  const url = String(raw.url || '').trim();
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || url.length > 65536) throw new Error('不支持的网址');
  const time = Number(raw.time ?? raw.timestamp ?? raw.lastVisitTime);
  if (!Number.isFinite(time) || time <= 0 || time > Date.now() + DAY) throw new Error('无效访问时间');
  const legacy = !raw.visitId || raw.legacy === true;
  const sourceId = legacy ? String(raw.sourceId || legacySource) : String(raw.sourceId || '');
  const visitId = legacy ? null : String(raw.visitId);
  if (!sourceId || sourceId.length > 128 || (visitId && visitId.length > 128)) throw new Error('无效来源或访问 ID');
  const key = legacy ? `l:${url}|${time}` : `v:${sourceId}:${visitId}`;
  return { key, sourceId, visitId, url, title: String(raw.title || url).slice(0, 4096),
    domain: parsed.hostname.toLowerCase(), time, transition: String(raw.transition || '').slice(0, 64), legacy };
}
export function publicRecord(row) {
  const { key, sourceId, visitId, url, title, domain, time, transition, legacy } = row;
  return { key, sourceId, visitId, url, title, domain, time, transition, legacy };
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function encodeArchive(rows) {
  const records = rows.map(publicRecord);
  const payload = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  const payloadBytes = encoder.encode(payload);
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) throw new ArchiveSizeError('归档需要进一步分片');
  const checksum = await sha256(payloadBytes);
  const header = JSON.stringify({ format: 'mimir-archive', version: ARCHIVE_VERSION, count: records.length, sha256: checksum });
  const stream = new Blob([header, '\n', payload]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function packArchiveChunk(chunk) {
  let rows = chunk.rows, cursor = chunk.cursor, done = chunk.done;
  while (rows.length) {
    let bytes;
    try { bytes = await encodeArchive(rows); }
    catch (error) { if (!(error instanceof ArchiveSizeError)) throw error; }
    if (bytes && bytes.length <= MAX_ARCHIVE_BYTES) return { bytes, rows, cursor, done };
    if (rows.length === 1) throw new Error('单条记录超过归档大小上限');
    rows = rows.slice(0, Math.ceil(rows.length / 2));
    cursor = [rows.at(-1).time, rows.at(-1).key]; done = false;
  }
  throw new Error('不能生成空分片');
}
export async function decodeArchive(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  // Each exported shard is small. Bound decompression before allocating a potentially hostile payload.
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 32 * 1024 * 1024) throw new Error('归档解压后过大，请按分片导入');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const text = await new Blob(chunks).text(); const split = text.indexOf('\n');
  if (split < 0) throw new Error('归档缺少格式信息');
  const header = JSON.parse(text.slice(0, split)); const payload = text.slice(split + 1);
  if (header.format !== 'mimir-archive' || header.version !== ARCHIVE_VERSION) throw new Error('不支持的归档版本');
  if (await sha256(encoder.encode(payload)) !== header.sha256) throw new Error('归档校验失败');
  const lines = payload.trimEnd().split('\n').filter(Boolean);
  if (lines.length !== header.count) throw new Error('归档记录数量不符');
  // Validate every row before importing any part of this shard.
  return lines.map(line => normalizeRecord(JSON.parse(line)));
}
export function legacyRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.history)) return data.history;
  if (Array.isArray(data?.data?.history)) return data.data.history;
  throw new Error('旧版 JSON 必须包含 history 数组');
}
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function base64ToBytes(value) { return Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)); }
export function errorMessage(error) { return error?.message || String(error); }
