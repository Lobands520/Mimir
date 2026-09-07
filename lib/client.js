export const $ = id => document.getElementById(id);
export async function rpc(action, args = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...args });
  if (!response?.ok) throw new Error(response?.error || '后台未响应，请在扩展管理页面重新加载 Mimir');
  return response.data;
}
export function timeLabel(time) { return time ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '尚未完成'; }
export function notice(message, error = false) { const el = $('notice'); if (el) { el.textContent = message; el.classList.toggle('error', error); } }
export function download(text, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function showStatus(state) {
  const elements = {
    total: state.total.toLocaleString(), lastCapture: timeLabel(state.lastCapture),
    lastBackup: state.githubEnabled ? timeLabel(state.backup.lastSuccess) : '尚未配置 GitHub',
    pending: state.pending.toLocaleString(), usage: `${(state.usage / 1024 / 1024).toFixed(1)} MB`,
    captureState: !state.enabled ? '采集已暂停' : state.capture?.error ? '补录暂停 · 需要处理错误' : state.capture ? `正在补录 · 已处理 ${state.capture.processedUrls} 个网址` : '自动采集中',
    backupState: state.restore ? `正在恢复 · ${state.restore.shards} 个分片` : state.backup.error ? (state.backup.retryAt ? '备份等待重试' : '备份需要处理错误') : state.backup.running ? `正在备份 · 已上传 ${state.backup.uploaded} 条` : state.githubEnabled ? '每日自动备份' : '本地保存中'
  };
  for (const [key, value] of Object.entries(elements)) if ($(key)) $(key).textContent = value;
  const error = state.capture?.error || state.restore?.error || state.backup.error || state.serviceError;
  if ($('statusError')) { $('statusError').textContent = error || ''; $('statusError').hidden = !error; }
}
