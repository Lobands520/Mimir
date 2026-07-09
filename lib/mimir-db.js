class MimirDB {
  constructor() {
    this.dbName = 'MimirDB';
    this.version = 2;
    this.db = null;
    this.needsVisitKeyBackfill = false;
  }

  async initialize() {
    if (this.db) {
      return this.db;
    }

    if (typeof idb === 'undefined' || typeof idb.openDB !== 'function') {
      throw new Error('idb library is not available');
    }

    let migratedFromLegacyVersion = false;

    this.db = await idb.openDB(this.dbName, this.version, {
      upgrade: (db, oldVersion, _newVersion, transaction) => {
        migratedFromLegacyVersion = oldVersion > 0;
        this.needsVisitKeyBackfill = oldVersion > 0 && oldVersion < 2;
        this.ensureStores(db, transaction);
      }
    });

    if (this.needsVisitKeyBackfill || migratedFromLegacyVersion) {
      await this.backfillHistoryVisitKeys();
      this.needsVisitKeyBackfill = false;
    }

    return this.db;
  }

  ensureStores(db, transaction) {
    let historyStore;

    if (!db.objectStoreNames.contains('history')) {
      historyStore = db.createObjectStore('history', {
        keyPath: 'id',
        autoIncrement: true
      });
    } else {
      historyStore = transaction.objectStore('history');
    }

    this.ensureIndex(historyStore, 'timestamp', 'timestamp');
    this.ensureIndex(historyStore, 'date', 'date');
    this.ensureIndex(historyStore, 'domain', 'domain');
    this.ensureIndex(historyStore, 'visitKey', 'visitKey');

    this.ensureSimpleStore(db, transaction, 'classified_cache', { keyPath: 'date' }, [
      ['createdAt', 'createdAt']
    ]);
    this.ensureSimpleStore(db, transaction, 'diaries', { keyPath: 'date' }, [
      ['createdAt', 'createdAt'],
      ['updatedAt', 'updatedAt']
    ]);
    this.ensureSimpleStore(db, transaction, 'annual_reports', { keyPath: 'year' }, [
      ['generatedAt', 'generatedAt']
    ]);
    this.ensureSimpleStore(db, transaction, 'settings', { keyPath: 'key' }, [
      ['category', 'category'],
      ['updatedAt', 'updatedAt']
    ]);
  }

  ensureSimpleStore(db, transaction, storeName, options, indexes) {
    let store;
    if (!db.objectStoreNames.contains(storeName)) {
      store = db.createObjectStore(storeName, options);
    } else {
      store = transaction.objectStore(storeName);
    }

    indexes.forEach(([indexName, keyPath]) => {
      this.ensureIndex(store, indexName, keyPath);
    });
  }

  ensureIndex(store, indexName, keyPath) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, { unique: false });
    }
  }

  async backfillHistoryVisitKeys() {
    await this.initialize();
    const transaction = this.db.transaction('history', 'readwrite');
    const store = transaction.objectStore('history');
    const allRecords = await store.getAll();

    for (const record of allRecords) {
      if (!record.visitKey) {
        record.visitKey = this.buildVisitKey(record);
        await store.put(record);
      }
    }

    await transaction.done;
  }

  buildVisitKey(record) {
    const timestamp = Number(record.lastVisitTime || record.timestamp || 0);
    const title = String(record.title || '').trim();
    const url = String(record.url || '').trim();
    return `${url}|${timestamp}|${title}`;
  }

  normalizeHistoryRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('History record must be an object');
    }

    const timestamp = Number(record.lastVisitTime || record.timestamp || 0);
    if (!timestamp) {
      throw new Error('History record must include a valid timestamp');
    }

    const url = String(record.url || '').trim();
    if (!url) {
      throw new Error('History record must include a valid URL');
    }

    const title = String(record.title || '').trim() || url;
    let parsedDomain = (record.domain || '').trim();
    if (!parsedDomain) {
      try {
        parsedDomain = new URL(url).hostname;
      } catch (_error) {
        parsedDomain = 'invalid-url';
      }
    }

    const normalized = {
      id: record.id,
      timestamp: timestamp,
      date: record.date || MimirConfig.formatDateLocal(timestamp),
      url: url,
      title: title,
      domain: MimirConfig.normalizeDomain(parsedDomain),
      visitCount: Number(record.visitCount || 1),
      lastVisitTime: timestamp,
      visitKey: record.visitKey || this.buildVisitKey({
        url: url,
        title: title,
        timestamp: timestamp,
        lastVisitTime: timestamp
      })
    };

    return normalized;
  }

  async getStore(storeName, mode = 'readonly') {
    await this.initialize();
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async addHistoryRecord(record) {
    await this.initialize();
    const normalized = this.normalizeHistoryRecord(record);
    const transaction = this.db.transaction('history', 'readwrite');
    const store = transaction.objectStore('history');
    const existingKey = await store.index('visitKey').getKey(normalized.visitKey);

    if (existingKey) {
      await transaction.done;
      return existingKey;
    }

    const identifier = await store.add(normalized);
    await transaction.done;
    return identifier;
  }

  async bulkAddHistory(records) {
    await this.initialize();
    const transaction = this.db.transaction('history', 'readwrite');
    const store = transaction.objectStore('history');
    const visitKeyIndex = store.index('visitKey');
    let inserted = 0;
    let skipped = 0;

    for (const record of records || []) {
      try {
        const normalized = this.normalizeHistoryRecord(record);
        const existingKey = await visitKeyIndex.getKey(normalized.visitKey);
        if (existingKey) {
          skipped += 1;
          continue;
        }

        await store.add(normalized);
        inserted += 1;
      } catch (_error) {
        skipped += 1;
      }
    }

    await transaction.done;
    return { inserted, skipped };
  }

  async getHistoryRecord(id) {
    if (!id) {
      return null;
    }

    const store = await this.getStore('history');
    return store.get(Number(id));
  }

  async getAllHistory(limit = null) {
    const store = await this.getStore('history');
    const records = await store.getAll();
    records.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
    return limit ? records.slice(0, limit) : records;
  }

  async getHistoryByDateRange(startDate, endDate) {
    const store = await this.getStore('history');
    const records = await store.index('date').getAll(IDBKeyRange.bound(startDate, endDate));
    records.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
    return records;
  }

  async getHistoryByTimestampRange(startTimestamp, endTimestamp) {
    const store = await this.getStore('history');
    const records = await store.index('timestamp').getAll(IDBKeyRange.bound(startTimestamp, endTimestamp));
    records.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
    return records;
  }

  async deleteHistoryRecord(id) {
    await this.initialize();
    const transaction = this.db.transaction('history', 'readwrite');
    await transaction.objectStore('history').delete(Number(id));
    await transaction.done;
  }

  async saveClassifiedData(date, data) {
    const store = await this.getStore('classified_cache', 'readwrite');
    const existing = await store.get(date);
    const timestamp = Date.now();
    await store.put({
      date: date,
      data: data,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp,
      version: '2.0'
    });
  }

  async getClassifiedData(date) {
    const store = await this.getStore('classified_cache');
    return store.get(date);
  }

  async getAllClassifiedData() {
    const store = await this.getStore('classified_cache');
    const records = await store.getAll();
    records.sort((left, right) => String(right.date).localeCompare(String(left.date)));
    return records;
  }

  async getClassifiedDataByDateRange(startDate, endDate) {
    const store = await this.getStore('classified_cache');
    const records = await store.getAll();
    return records
      .filter((record) => record.date >= startDate && record.date <= endDate)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  }

  async deleteClassifiedData(date) {
    await this.initialize();
    const transaction = this.db.transaction('classified_cache', 'readwrite');
    await transaction.objectStore('classified_cache').delete(date);
    await transaction.done;
  }

  async saveDiary(date, content, title = '') {
    const store = await this.getStore('diaries', 'readwrite');
    const existing = await store.get(date);
    const timestamp = Date.now();
    const normalizedContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await store.put({
      date: date,
      title: title || (existing && existing.title) || '',
      content: normalizedContent,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp,
      wordCount: normalizedContent.trim() ? normalizedContent.trim().split(/\s+/).length : 0,
      tags: (existing && existing.tags) || []
    });
  }

  async getDiary(date) {
    const store = await this.getStore('diaries');
    return store.get(date);
  }

  async getAllDiaries() {
    const store = await this.getStore('diaries');
    const records = await store.getAll();
    records.sort((left, right) => String(right.date).localeCompare(String(left.date)));
    return records;
  }

  async getDiariesByDateRange(startDate, endDate) {
    const store = await this.getStore('diaries');
    const records = await store.getAll();
    return records
      .filter((record) => record.date >= startDate && record.date <= endDate)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  }

  async deleteDiary(date) {
    await this.initialize();
    const transaction = this.db.transaction('diaries', 'readwrite');
    await transaction.objectStore('diaries').delete(date);
    await transaction.done;
  }

  async saveAnnualReport(year, reportData) {
    const store = await this.getStore('annual_reports', 'readwrite');
    const normalizedYear = Number(year);
    const existing = await store.get(normalizedYear);
    await store.put({
      year: normalizedYear,
      reportData: reportData,
      generatedAt: existing ? existing.generatedAt : Date.now(),
      updatedAt: Date.now(),
      version: '2.0',
      summary: (reportData && reportData.summary) || (existing && existing.summary) || {}
    });
  }

  async getAnnualReport(year) {
    const store = await this.getStore('annual_reports');
    return store.get(Number(year));
  }

  async getAllAnnualReports() {
    const store = await this.getStore('annual_reports');
    const records = await store.getAll();
    records.sort((left, right) => Number(right.year) - Number(left.year));
    return records;
  }

  async getAnnualReportsByYearRange(startYear, endYear) {
    const store = await this.getStore('annual_reports');
    const records = await store.getAll();
    return records
      .filter((record) => Number(record.year) >= Number(startYear) && Number(record.year) <= Number(endYear))
      .sort((left, right) => Number(right.year) - Number(left.year));
  }

  async deleteAnnualReport(year) {
    await this.initialize();
    const transaction = this.db.transaction('annual_reports', 'readwrite');
    await transaction.objectStore('annual_reports').delete(Number(year));
    await transaction.done;
  }

  async saveSetting(key, value, category = 'general') {
    const store = await this.getStore('settings', 'readwrite');
    await store.put({
      key: key,
      value: value,
      category: category,
      updatedAt: Date.now()
    });
  }

  async getSetting(key) {
    const store = await this.getStore('settings');
    const record = await store.get(key);
    return record ? record.value : null;
  }

  async getSettingRecord(key) {
    const store = await this.getStore('settings');
    return store.get(key);
  }

  async getAllSettings() {
    const store = await this.getStore('settings');
    const records = await store.getAll();
    records.sort((left, right) => String(left.key).localeCompare(String(right.key)));
    return records;
  }

  async deleteSetting(key) {
    await this.initialize();
    const transaction = this.db.transaction('settings', 'readwrite');
    await transaction.objectStore('settings').delete(key);
    await transaction.done;
  }

  async exportAllData() {
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '2.0',
        database: this.dbName
      },
      history: await this.getAllHistory(),
      classifiedCache: await this.getAllClassifiedData(),
      diaries: await this.getAllDiaries(),
      annualReports: await this.getAllAnnualReports(),
      settings: await this.getAllSettings()
    };
  }

  async exportDataByDateRange(startDate, endDate) {
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        dateRange: { start: startDate, end: endDate },
        version: '2.0',
        database: this.dbName
      },
      history: await this.getHistoryByDateRange(startDate, endDate),
      classifiedCache: await this.getClassifiedDataByDateRange(startDate, endDate),
      diaries: await this.getDiariesByDateRange(startDate, endDate)
    };
  }

  async clearAllData() {
    await this.initialize();
    const storeNames = ['history', 'classified_cache', 'diaries', 'annual_reports', 'settings'];
    for (const storeName of storeNames) {
      const transaction = this.db.transaction(storeName, 'readwrite');
      await transaction.objectStore(storeName).clear();
      await transaction.done;
    }
  }

  async getDataStatistics() {
    const [history, classifiedCache, diaries, annualReports, settings] = await Promise.all([
      this.getAllHistory(),
      this.getAllClassifiedData(),
      this.getAllDiaries(),
      this.getAllAnnualReports(),
      this.getAllSettings()
    ]);

    return {
      history: {
        count: history.length,
        dateRange: history.length
          ? { start: history[history.length - 1].date, end: history[0].date }
          : null
      },
      classifiedCache: { count: classifiedCache.length },
      diaries: { count: diaries.length },
      annualReports: { count: annualReports.length },
      settings: { count: settings.length }
    };
  }

  async getInfo() {
    await this.initialize();
    return {
      name: this.db.name,
      version: this.db.version,
      objectStoreNames: Array.from(this.db.objectStoreNames),
      statistics: await this.getDataStatistics()
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MimirDB;
} else if (typeof window !== 'undefined') {
  window.MimirDB = MimirDB;
} else if (typeof self !== 'undefined') {
  self.MimirDB = MimirDB;
}
