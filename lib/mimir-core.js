class MimirCoreService {
  constructor() {
    this.dbWrapper = new DatabaseWrapper();
    this.db = this.dbWrapper.mimirDB;
    this.alarmNames = {
      hourlyBackup: 'mimir-hourly-backup',
      dailyReconcile: 'mimir-daily-reconcile',
      dailyCleanup: 'mimir-daily-cleanup'
    };
  }

  async initialize() {
    await this.dbWrapper.initialize();
    if (!this.dbWrapper.fallbackMode) {
      await this.db.initialize();
    }
    return this.ensureConfig();
  }

  async bootstrap() {
    await this.initialize();
    await this.scheduleAlarms();
  }

  async ensureConfig() {
    const currentResult = await this.dbWrapper.get('mimir-config');
    const currentConfig = currentResult['mimir-config'] || null;
    const legacyResult = currentConfig ? {} : await this.dbWrapper.get('config');
    const legacyConfig = currentConfig ? null : (legacyResult.config || null);
    const mergedConfig = MimirConfig.mergeConfig(currentConfig || legacyConfig || {});

    if (!currentConfig || JSON.stringify(currentConfig) !== JSON.stringify(mergedConfig)) {
      await this.dbWrapper.set({ 'mimir-config': mergedConfig });
    }

    if (!currentConfig && legacyConfig) {
      await this.dbWrapper.remove('config');
    }

    return mergedConfig;
  }

  async scheduleAlarms() {
    chrome.alarms.create(this.alarmNames.hourlyBackup, {
      delayInMinutes: 5,
      periodInMinutes: 60
    });

    chrome.alarms.create(this.alarmNames.dailyReconcile, {
      delayInMinutes: 15,
      periodInMinutes: 24 * 60
    });

    chrome.alarms.create(this.alarmNames.dailyCleanup, {
      delayInMinutes: 30,
      periodInMinutes: 24 * 60
    });
  }

  async handleAlarm(alarm) {
    await this.initialize();

    if (!alarm || !alarm.name) {
      return;
    }

    if (alarm.name === this.alarmNames.hourlyBackup) {
      await this.backupRecentHistory(false);
      return;
    }

    if (alarm.name === this.alarmNames.dailyReconcile) {
      await this.reconcileRecentHistory(7);
      return;
    }

    if (alarm.name === this.alarmNames.dailyCleanup) {
      await this.cleanupOldData();
    }
  }

  async handleMessage(request, _sender, sendResponse) {
    const respond = async () => {
      switch (request.action) {
        case 'test':
          return { success: true, message: 'Service worker is working' };
        case 'getDailyHistory':
          return this.getDailyHistory(request.date);
        case 'getYearData':
          return this.getYearData(request.year);
        case 'getAvailableYears':
          return this.getAvailableYears();
        case 'getSuggestionData':
          return this.getSuggestionData();
        case 'openOptionsPage':
          await chrome.runtime.openOptionsPage();
          return { success: true };
        case 'startMigration':
          return this.startMigration();
        case 'backupHistory':
          return this.backupRecentHistory(false);
        case 'fullBackupHistory':
          return this.backupRecentHistory(true);
        case 'getBackupStatus':
          return this.getBackupStatus();
        default:
          return { success: false, error: 'Unknown action' };
      }
    };

    respond()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
  }

  isValidHistoryItem(item) {
    if (!item || !item.url) {
      return false;
    }

    const url = String(item.url).trim();
    if (!url) {
      return false;
    }

    return !MimirConfig.EXCLUDED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
  }

  toHistoryRecord(item) {
    const timestamp = Number(item.lastVisitTime || item.timestamp || Date.now());
    const url = String(item.url || '').trim();
    const title = String(item.title || '').trim() || url;
    let domain = '';

    try {
      domain = MimirConfig.normalizeDomain(new URL(url).hostname);
    } catch (_error) {
      domain = 'invalid-url';
    }

    return {
      timestamp: timestamp,
      date: MimirConfig.formatDateLocal(timestamp),
      url: url,
      title: title,
      domain: domain,
      visitCount: Number(item.visitCount || 1),
      lastVisitTime: timestamp
    };
  }

  async recordVisit(item) {
    await this.initialize();

    if (!this.isValidHistoryItem(item)) {
      return { success: true, inserted: 0, skipped: 1 };
    }

    await this.db.addHistoryRecord(this.toHistoryRecord(item));
    await this.updateBackupMetadata({
      totalProcessed: 1,
      successCount: 1,
      skippedCount: 0,
      isFullBackup: false,
      trigger: 'onVisited'
    });

    return { success: true, inserted: 1, skipped: 0 };
  }

  async collectFullHistory() {
    const allItems = [];
    const now = Date.now();
    const chunkDays = 7;
    const maxDays = 365 * 3;
    let emptyChunkCount = 0;

    for (let daysBack = 0; daysBack < maxDays; daysBack += chunkDays) {
      const endTime = now - (daysBack * 24 * 60 * 60 * 1000);
      const startTime = now - ((daysBack + chunkDays) * 24 * 60 * 60 * 1000);
      const chunk = await chrome.history.search({
        text: '',
        startTime: startTime,
        endTime: endTime,
        maxResults: 0
      });

      if (chunk.length === 0) {
        emptyChunkCount += 1;
        if (daysBack > 90 && emptyChunkCount >= 4) {
          break;
        }
        continue;
      }

      emptyChunkCount = 0;
      allItems.push(...chunk);
    }

    return allItems;
  }

  async reconcileRecentHistory(days) {
    const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const items = await chrome.history.search({
      text: '',
      startTime: startTime,
      maxResults: 0
    });

    const validRecords = items
      .filter((item) => this.isValidHistoryItem(item))
      .map((item) => this.toHistoryRecord(item));

    const result = await this.db.bulkAddHistory(validRecords);
    await this.updateBackupMetadata({
      totalProcessed: validRecords.length,
      successCount: result.inserted,
      skippedCount: result.skipped,
      isFullBackup: false,
      trigger: 'daily-reconcile'
    });

    return {
      success: true,
      totalRecords: validRecords.length,
      backedUpRecords: result.inserted,
      skippedRecords: result.skipped
    };
  }

  async backupRecentHistory(isFullBackup) {
    await this.initialize();
    const currentTime = Date.now();
    const lastBackupTime = (await this.db.getSetting('mimir-last-backup')) || 0;
    const overlapStartTime = Math.max(0, lastBackupTime - (5 * 60 * 1000));

    const sourceItems = isFullBackup
      ? await this.collectFullHistory()
      : await chrome.history.search({
          text: '',
          startTime: overlapStartTime,
          maxResults: 0
        });

    const validRecords = sourceItems
      .filter((item) => this.isValidHistoryItem(item))
      .map((item) => this.toHistoryRecord(item));

    if (validRecords.length === 0) {
      await this.updateBackupMetadata({
        totalProcessed: 0,
        successCount: 0,
        skippedCount: 0,
        isFullBackup: isFullBackup,
        trigger: isFullBackup ? 'manual-full' : 'incremental'
      });

      return {
        success: true,
        totalRecords: 0,
        backedUpRecords: 0,
        skippedRecords: 0,
        message: '没有新的历史记录需要备份'
      };
    }

    const result = await this.db.bulkAddHistory(validRecords);
    await this.db.saveSetting('mimir-last-backup', currentTime, 'system');
    await this.updateBackupMetadata({
      totalProcessed: validRecords.length,
      successCount: result.inserted,
      skippedCount: result.skipped,
      isFullBackup: isFullBackup,
      trigger: isFullBackup ? 'manual-full' : 'incremental'
    });

    return {
      success: true,
      totalRecords: validRecords.length,
      backedUpRecords: result.inserted,
      skippedRecords: result.skipped,
      message: `成功备份 ${result.inserted} 条，跳过 ${result.skipped} 条重复记录`
    };
  }

  async updateBackupMetadata(stats) {
    const timestamp = Date.now();
    await this.db.saveSetting('mimir-backup-stats', Object.assign({
      lastBackupTime: timestamp
    }, stats), 'system');
  }

  async estimateBrowserHistoryCount() {
    let total = 0;
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    for (let offset = 0; offset < 12; offset += 1) {
      const endTime = now - (offset * monthMs);
      const startTime = endTime - monthMs;
      const records = await chrome.history.search({
        text: '',
        startTime: startTime,
        endTime: endTime,
        maxResults: 0
      });

      total += records.length;
      if (offset >= 3 && records.length === 0) {
        break;
      }
    }

    return total;
  }

  async getBackupStatus() {
    await this.initialize();
    const [allHistory, lastBackupTime, backupStats] = await Promise.all([
      this.db.getAllHistory(),
      this.db.getSetting('mimir-last-backup'),
      this.db.getSetting('mimir-backup-stats')
    ]);

    const browserHistoryCount = await this.estimateBrowserHistoryCount();
    const backupCoverage = browserHistoryCount > 0
      ? Math.round((allHistory.length / browserHistoryCount) * 100)
      : (allHistory.length > 0 ? 100 : 0);

    return {
      success: true,
      lastBackupTime: lastBackupTime || 0,
      lastBackupDate: lastBackupTime ? new Date(lastBackupTime).toLocaleString() : '从未备份',
      totalBackedUpRecords: allHistory.length,
      browserHistoryCount: browserHistoryCount,
      backupCoverage: backupCoverage,
      lastBackupStats: backupStats || {},
      isBackupEnabled: true,
      needsFullBackup: browserHistoryCount > 0 && allHistory.length < browserHistoryCount * 0.8
    };
  }

  async getDailyHistory(dateString) {
    const startTime = MimirConfig.startOfDay(dateString);
    const endTime = MimirConfig.endOfDay(dateString);
    const records = await chrome.history.search({
      text: '',
      startTime: startTime,
      endTime: endTime,
      maxResults: 0
    });

    return records
      .filter((item) => this.isValidHistoryItem(item))
      .map((item) => Object.assign({}, item, { timestamp: item.lastVisitTime }))
      .sort((left, right) => (right.lastVisitTime || 0) - (left.lastVisitTime || 0));
  }

  async getYearData(year) {
    await this.initialize();
    const startTime = new Date(`${year}-01-01T00:00:00`).getTime();
    const endTime = new Date(`${year}-12-31T23:59:59.999`).getTime();

    const storedRecords = await this.db.getHistoryByTimestampRange(startTime, endTime);
    if (storedRecords.length > 0) {
      return storedRecords;
    }

    const browserRecords = await chrome.history.search({
      text: '',
      startTime: startTime,
      endTime: endTime,
      maxResults: 0
    });

    return browserRecords
      .filter((item) => this.isValidHistoryItem(item))
      .map((item) => Object.assign({}, item, { timestamp: item.lastVisitTime }));
  }

  async getAvailableYears() {
    await this.initialize();
    const storedHistory = await this.db.getAllHistory();
    const years = new Set();

    storedHistory.forEach((record) => {
      const year = new Date(record.timestamp || record.lastVisitTime).getFullYear();
      if (!Number.isNaN(year)) {
        years.add(year);
      }
    });

    if (years.size === 0) {
      const browserHistory = await chrome.history.search({
        text: '',
        maxResults: 10000,
        startTime: new Date('2020-01-01T00:00:00').getTime()
      });

      browserHistory.forEach((record) => {
        const year = new Date(record.lastVisitTime).getFullYear();
        if (!Number.isNaN(year)) {
          years.add(year);
        }
      });
    }

    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((left, right) => right - left);
  }

  async getSuggestionData() {
    await this.initialize();
    const [configResult, history] = await Promise.all([
      this.dbWrapper.get('mimir-config'),
      chrome.history.search({ text: '', maxResults: 1000, startTime: 0 })
    ]);

    const config = MimirConfig.mergeConfig(configResult['mimir-config'] || {});
    return {
      history: history,
      builtInRules: MimirConfig.getBuiltInRules(),
      customRules: config.customRules || []
    };
  }

  async cleanupOldData() {
    await this.initialize();
    const config = await this.ensureConfig();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(config.retentionDays || 30));
    const cutoffDate = MimirConfig.formatDateLocal(cutoff);
    const storedEntries = await this.dbWrapper.get(null);
    const keysToDelete = Object.keys(storedEntries).filter((key) => {
      if (!key.startsWith('classified-') && !key.startsWith('diary-')) {
        return false;
      }

      const rawDate = key.split('-').slice(1).join('-');
      return rawDate < cutoffDate;
    });

    if (keysToDelete.length > 0) {
      await this.dbWrapper.remove(keysToDelete);
    }

    return { success: true, removed: keysToDelete.length };
  }

  async readChromeStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  async startMigration() {
    await this.initialize();
    await this.dbWrapper.setMigrationStatus('in_progress');

    try {
      const rawData = await this.readChromeStorage(null);
      const filteredEntries = {};

      Object.entries(rawData).forEach(([key, value]) => {
        if (key.startsWith('mimir-migration-')) {
          return;
        }
        filteredEntries[key] = value;
      });

      if (Object.keys(filteredEntries).length === 0) {
        await this.dbWrapper.setMigrationStatus('completed');
        return { success: true, message: '没有需要迁移的数据' };
      }

      await this.dbWrapper.set(filteredEntries);
      await this.dbWrapper.setMigrationStatus('completed');
      return { success: true, message: `迁移完成，共导入 ${Object.keys(filteredEntries).length} 项数据` };
    } catch (error) {
      await this.dbWrapper.setMigrationStatus('failed');
      return { success: false, error: error.message };
    }
  }
}

class MimirCoreClient {
  static send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(Object.assign({ action: action }, payload), (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }
}

if (typeof window !== 'undefined') {
  window.MimirCoreClient = MimirCoreClient;
}

if (typeof self !== 'undefined') {
  self.MimirCoreService = MimirCoreService;
}
