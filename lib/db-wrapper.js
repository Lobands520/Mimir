class DatabaseWrapper {
  constructor() {
    this.mimirDB = new MimirDB();
    this.initialized = false;
    this.fallbackMode = false;
  }

  async initialize() {
    if (this.initialized) {
      return true;
    }

    try {
      await this.mimirDB.initialize();
      this.initialized = true;
      this.fallbackMode = false;
      return true;
    } catch (error) {
      if (await this.canUseFallbackStorage()) {
        this.initialized = true;
        this.fallbackMode = true;
        return true;
      }

      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async canUseFallbackStorage() {
    try {
      await this.fallbackSet({ '__mimir_test__': true });
      await this.fallbackRemove('__mimir_test__');
      return true;
    } catch (_error) {
      return false;
    }
  }

  async get(keys = null) {
    await this.ensureInitialized();

    if (this.fallbackMode) {
      return this.fallbackGet(keys);
    }

    if (keys === null) {
      const result = {};
      const [settings, classified, diaries, reports] = await Promise.all([
        this.mimirDB.getAllSettings(),
        this.mimirDB.getAllClassifiedData(),
        this.mimirDB.getAllDiaries(),
        this.mimirDB.getAllAnnualReports()
      ]);

      settings.forEach((setting) => {
        result[setting.key] = setting.value;
      });
      classified.forEach((entry) => {
        result[`classified-${entry.date}`] = entry.data;
      });
      diaries.forEach((entry) => {
        result[`diary-${entry.date}`] = entry.content;
      });
      reports.forEach((entry) => {
        result[`annual-report-${entry.year}`] = entry.reportData;
      });
      return result;
    }

    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    const result = {};

    for (const key of requestedKeys) {
      if (key === 'mimir-config') {
        const value = await this.mimirDB.getSetting('mimir-config');
        if (value !== null) {
          result[key] = value;
        }
        continue;
      }

      if (key.startsWith('classified-')) {
        const date = key.slice('classified-'.length);
        const record = await this.mimirDB.getClassifiedData(date);
        if (record) {
          result[key] = record.data;
        }
        continue;
      }

      if (key.startsWith('diary-')) {
        const date = key.slice('diary-'.length);
        const record = await this.mimirDB.getDiary(date);
        if (record) {
          result[key] = record.content;
        }
        continue;
      }

      if (key.startsWith('annual-report-')) {
        const year = key.slice('annual-report-'.length);
        const record = await this.mimirDB.getAnnualReport(year);
        if (record) {
          result[key] = record.reportData;
        }
        continue;
      }

      const value = await this.mimirDB.getSetting(key);
      if (value !== null) {
        result[key] = value;
      }
    }

    return result;
  }

  async set(items) {
    await this.ensureInitialized();

    if (this.fallbackMode) {
      return this.fallbackSet(items);
    }

    const operations = Object.entries(items).map(async ([key, value]) => {
      if (key === 'mimir-config') {
        return this.mimirDB.saveSetting('mimir-config', MimirConfig.mergeConfig(value), 'config');
      }

      if (key.startsWith('classified-')) {
        return this.mimirDB.saveClassifiedData(key.slice('classified-'.length), value);
      }

      if (key.startsWith('diary-')) {
        return this.mimirDB.saveDiary(key.slice('diary-'.length), value);
      }

      if (key.startsWith('annual-report-')) {
        return this.mimirDB.saveAnnualReport(key.slice('annual-report-'.length), value);
      }

      return this.mimirDB.saveSetting(key, value, 'general');
    });

    await Promise.all(operations);
  }

  async remove(keys) {
    await this.ensureInitialized();
    const requestedKeys = Array.isArray(keys) ? keys : [keys];

    if (this.fallbackMode) {
      return this.fallbackRemove(requestedKeys);
    }

    const operations = requestedKeys.map(async (key) => {
      if (key.startsWith('classified-')) {
        return this.mimirDB.deleteClassifiedData(key.slice('classified-'.length));
      }

      if (key.startsWith('diary-')) {
        return this.mimirDB.deleteDiary(key.slice('diary-'.length));
      }

      if (key.startsWith('annual-report-')) {
        return this.mimirDB.deleteAnnualReport(key.slice('annual-report-'.length));
      }

      return this.mimirDB.deleteSetting(key);
    });

    await Promise.all(operations);
  }

  async clear() {
    await this.ensureInitialized();

    if (this.fallbackMode) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    }

    await this.mimirDB.clearAllData();
  }

  async fallbackGet(keys) {
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

  async fallbackSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async fallbackRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async isIndexedDBAvailable() {
    try {
      await this.mimirDB.initialize();
      return true;
    } catch (_error) {
      return false;
    }
  }

  async getMigrationStatus() {
    await this.ensureInitialized();

    if (this.fallbackMode) {
      const result = await this.fallbackGet('mimir-migration-status');
      return result['mimir-migration-status'] || 'not_started';
    }

    return (await this.mimirDB.getSetting('mimir-migration-status')) || 'not_started';
  }

  async setMigrationStatus(status) {
    await this.ensureInitialized();

    if (this.fallbackMode) {
      await this.fallbackSet({ 'mimir-migration-status': status });
      return;
    }

    await this.mimirDB.saveSetting('mimir-migration-status', status, 'system');
  }
}

if (typeof window !== 'undefined') {
  window.dbWrapper = new DatabaseWrapper();
}
