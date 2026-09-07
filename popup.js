import { $, rpc, notice, showStatus } from './lib/client.js';
async function refresh() { try { showStatus(await rpc('status')); } catch (e) { notice(e.message, true); } }
$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  try { await rpc('sync'); notice('同步已启动，关闭弹窗后仍会继续。'); await refresh(); }
  catch (e) { notice(e.message, true); } finally { $('sync').disabled = false; }
});
$('open').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));
void refresh(); setInterval(refresh, 3000);
