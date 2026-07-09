importScripts(
  'lib/mimir-config.js',
  'lib/idb.js',
  'lib/mimir-db.js',
  'lib/db-wrapper.js',
  'lib/mimir-core.js',
  'lib/migration.js'
);

const mimirCoreService = new MimirCoreService();

chrome.runtime.onInstalled.addListener(() => {
  mimirCoreService.bootstrap().catch((error) => {
    console.error('Mimir bootstrap on install failed:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  mimirCoreService.bootstrap().catch((error) => {
    console.error('Mimir bootstrap on startup failed:', error);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  mimirCoreService.handleMessage(request, sender, sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  mimirCoreService.handleAlarm(alarm).catch((error) => {
    console.error('Mimir alarm handler failed:', error);
  });
});

chrome.history.onVisited.addListener((item) => {
  mimirCoreService.recordVisit(item).catch((error) => {
    console.error('Mimir visit capture failed:', error);
  });
});

mimirCoreService.initialize().catch((error) => {
  console.error('Mimir initial service setup failed:', error);
});
