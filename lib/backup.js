import { packArchiveChunk, decodeArchive, sha256, bytesToBase64, base64ToBytes, MAX_ARCHIVE_BYTES } from './format.js';
export class RemoteError extends Error {
  constructor(message, retryable = false, delay = 60000) { super(message); this.retryable = retryable; this.delay = delay; }
}
export class GitHubClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; this.readyAt = 0; }
  get root() { return `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`; }
  get destination() { return `${this.config.owner.toLowerCase()}/${this.config.repo.toLowerCase()}@${this.config.branch}`; }
  async request(path, options = {}, allowMissing = false) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.fetcher(`https://api.github.com${path}`, {
        ...options, signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${this.config.token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
      });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        const limited = response.status === 429 || (response.status === 403 && (retryAfter || response.headers.get('x-ratelimit-remaining') === '0'));
        const resetMs = Math.max(0, Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now());
        const message = limited ? 'GitHub 请求限流，将自动重试' : response.status === 401 ? 'GitHub 令牌失效，请更新设置' : response.status === 403 ? 'GitHub 令牌没有所需权限' : `GitHub 请求失败（${response.status}）`;
        throw new RemoteError(message, limited || response.status >= 500 || response.status === 409, Math.max(60000, retryAfter * 1000, limited ? resetMs : 0));
      }
      return await response.json();
    } catch (e) {
      if (e instanceof RemoteError) throw e;
      throw new RemoteError(e.name === 'AbortError' ? 'GitHub 请求超时，将自动重试' : 'GitHub 网络请求失败，将自动重试', true);
    } finally { clearTimeout(timeout); }
  }
  async validate(force = false) {
    if (!force && Date.now() - this.readyAt < 300000) return;
    if (!this.config.owner || !this.config.repo || !this.config.token) throw new RemoteError('请配置 GitHub 仓库和令牌');
    const repo = await this.request(this.root);
    if (repo.private !== true) throw new RemoteError('备份仅支持私有仓库，请修改仓库设置');
    if (!this.config.branch) this.config.branch = repo.default_branch;
    await this.request(`${this.root}/branches/${encodeURIComponent(this.config.branch)}`);
    this.readyAt = Date.now();
  }
  filePath(path, ref = this.config.branch) {
    return `${this.root}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  }
  async read(path, ref) {
    const file = await this.request(this.filePath(path, ref), {}, true);
    if (!file) return null;
    if (file.encoding !== 'base64' || typeof file.content !== 'string' || file.size > MAX_ARCHIVE_BYTES) throw new RemoteError('归档文件格式或大小不受支持');
    return base64ToBytes(file.content);
  }
  async upload(batch) {
    await this.validate();
    const current = await this.read(batch.path);
    if (current) {
      if (await sha256(current) !== batch.digest) throw new RemoteError('远端同名归档内容不一致，已停止覆盖');
      return;
    }
    await this.request(this.filePath(batch.path).split('?')[0], { method: 'PUT', body: JSON.stringify({
      branch: this.config.branch, message: 'Archive browsing history', content: bytesToBase64(batch.bytes)
    }) });
    const saved = await this.read(batch.path);
    if (!saved || await sha256(saved) !== batch.digest) throw new RemoteError('远端写入尚未通过校验，将重新检查', true);
  }
  async rootTree() {
    await this.validate(true);
    const branch = await this.request(`${this.root}/branches/${encodeURIComponent(this.config.branch)}`);
    return { commit: branch.commit.sha, tree: branch.commit.commit.tree.sha };
  }
  async tree(sha) {
    const tree = await this.request(`${this.root}/git/trees/${encodeURIComponent(sha)}`);
    if (tree.truncated) throw new RemoteError('远端目录列表被截断，恢复已暂停');
    return tree.tree;
  }
}
export class BackupService {
  constructor(db, client) { this.db = db; this.client = client; }
  get destination() { return this.client.destination; }
  async state() { return (await this.db.get(`backup:${this.destination}`)) || { cursor: 0, lastSuccess: 0 }; }
  async save(state) { await this.db.set(`backup:${this.destination}`, state); }
  async start() {
    await this.client.validate(true);
    const state = await this.state();
    state.error = null; state.retryAt = 0;
    if (!state.job) state.job = { until: await this.db.maxSeq(), scanCursor: null, uploaded: 0, startedAt: Date.now() };
    await this.save(state);
  }
  async step() {
    const state = await this.state();
    if (!state.job || (state.error && !state.retryAt) || state.retryAt > Date.now()) return false;
    state.error = null; state.retryAt = 0;
    const pending = await this.db.batchGet(this.destination);
    if (pending) {
      await this.client.upload(pending);
      state.job.scanCursor = pending.nextCursor; state.job.uploaded += pending.count;
      if (pending.done) { state.cursor = state.job.until; state.lastSuccess = Date.now(); state.job = null; }
      state.failures = 0;
      await this.db.finishBatch(pending, state);
      return true;
    }
    const chunk = await this.db.archiveChunk(state.cursor, state.job.until, state.job.scanCursor);
    if (!chunk.rows.length) {
      state.job.scanCursor = chunk.cursor;
      if (chunk.done) { state.cursor = state.job.until; state.lastSuccess = Date.now(); state.job = null; }
      await this.save(state); return true;
    }
    const { rows, bytes, cursor: nextCursor, done } = await packArchiveChunk(chunk);
    const digest = await sha256(bytes);
    const date = new Date(rows[0].time).toISOString().slice(0, 10).replaceAll('-', '/');
    const path = `archives/${encodeURIComponent(rows[0].sourceId)}/${date}/${digest.slice(0, 2)}/${digest}.jsonl.gz`;
    await this.db.batchPut({ id: this.destination, destination: this.destination, bytes, digest, path, nextCursor, done, count: rows.length });
    return true;
  }
  async fail(error) {
    const state = await this.state(); state.failures = (state.failures || 0) + 1;
    state.error = error.message;
    state.retryAt = error.retryable ? Date.now() + Math.max(error.delay || 60000, Math.min(3600000, 60000 * 2 ** Math.min(state.failures - 1, 6))) : 0;
    await this.save(state);
  }
  async startRestore() {
    const existing = await this.db.get('restore');
    if (existing && existing.destination !== this.destination) throw new Error('请先完成当前仓库的恢复');
    if (existing) { existing.error = null; existing.retryAt = 0; await this.db.set('restore', existing); return; }
    const { commit, tree } = await this.client.rootTree();
    await this.db.set('restore', { destination: this.destination, commit, stack: [{ sha: tree, path: '' }], files: [],
      read: 0, inserted: 0, duplicates: 0, upgraded: 0, invalid: 0, shards: 0 });
  }
  async restoreStep() {
    const state = await this.db.get('restore');
    if (!state || state.destination !== this.destination || (state.error && !state.retryAt) || state.retryAt > Date.now()) return false;
    state.error = null; state.retryAt = 0;
    await this.client.validate();
    if (state.files.length) {
      const path = state.files[0]; const bytes = await this.client.read(path, state.commit);
      if (!bytes) throw new RemoteError('恢复文件不存在');
      const digest = path.split('/').at(-1).replace('.jsonl.gz', '');
      if (await sha256(bytes) !== digest) throw new RemoteError('远端分片校验失败');
      const rows = await decodeArchive(bytes);
      const result = await this.db.putRecords(rows, { strict: true });
      for (const key of ['read', 'inserted', 'duplicates', 'upgraded', 'invalid']) state[key] += result[key];
      state.shards++; state.files.shift(); await this.db.set('restore', state); return true;
    }
    if (state.stack.length) {
      const node = state.stack.pop(); const entries = await this.client.tree(node.sha);
      for (const entry of entries) {
        const path = node.path ? `${node.path}/${entry.path}` : entry.path;
        if (path !== 'archives' && !path.startsWith('archives/')) continue;
        if (entry.type === 'tree') state.stack.push({ sha: entry.sha, path });
        if (entry.type === 'blob' && path.endsWith('.jsonl.gz')) state.files.push(path);
      }
      await this.db.set('restore', state); return true;
    }
    await this.db.set('lastRestore', { ...state, finishedAt: Date.now(), stack: [], files: [] });
    await this.db.remove('restore'); return true;
  }
}
