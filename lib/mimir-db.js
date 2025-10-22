/**
 * MimirDB - IndexedDB wrapper for Mimir dashboard plugin
 * Provides structured storage with 5 Object Stores: history, classified_cache, diaries, annual_reports, settings
 */
class MimirDB {
  constructor() {
    this.dbName = 'MimirDB';
    this.version = 1;
    this.db = null;
    // Support both window and service worker contexts
    this.errorHandler = (typeof window !== 'undefined' ? window.mimirErrorHandler : null) || 
                       (typeof self !== 'undefined' ? self.mimirErrorHandler : null);
    this.fallbackEnabled = true;
  }

  /**
   * Initialize the IndexedDB database with proper schema and indexes
   * Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 8.1, 8.2, 8.3, 8.4
   */
  async initialize() {
    if (this.errorHandler) {
      return await this.errorHandler.executeWithErrorHandling(
        () => this._initializeDatabase(),
        'DATABASE_INITIALIZATION',
        () => this._initializeFallback()
      );
    } else {
      return await this._initializeDatabase();
    }
  }

  /**
   * Internal database initialization method
   */
  async _initializeDatabase() {
    // Check if IndexedDB is available (support both window and service worker contexts)
    const indexedDB = (typeof window !== 'undefined' ? window.indexedDB : null) || 
                     (typeof self !== 'undefined' ? self.indexedDB : null);
    
    if (!indexedDB) {
      throw new Error('IndexedDB is not supported in this environment');
    }

    // Import idb library
    if (typeof idb === 'undefined') {
      throw new Error('idb library not loaded - please ensure lib/idb.js is included');
    }

    this.db = await idb.openDB(this.dbName, this.version, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        if (this.errorHandler) {
          this.errorHandler.logInfo(`Upgrading MimirDB from version ${oldVersion} to ${newVersion}`);
        }
        console.log(`Upgrading MimirDB from version ${oldVersion} to ${newVersion}`);
        this._createObjectStores(db);
      },
      blocked: () => {
        const message = 'MimirDB upgrade blocked by another connection';
        if (this.errorHandler) {
          this.errorHandler.logWarn(message);
        }
        console.warn(message);
      },
      blocking: () => {
        const message = 'MimirDB is blocking another connection';
        if (this.errorHandler) {
          this.errorHandler.logWarn(message);
        }
        console.warn(message);
      },
      terminated: () => {
        const message = 'MimirDB connection terminated unexpectedly';
        if (this.errorHandler) {
          this.errorHandler.logError('DATABASE_CONNECTION_TERMINATED', new Error(message));
        }
        console.error(message);
      }
    });

    if (this.errorHandler) {
      this.errorHandler.logInfo('MimirDB initialized successfully');
    }
    console.log('MimirDB initialized successfully');
    return this.db;
  }

  /**
   * Fallback initialization when IndexedDB fails
   * Requirement 8.3: Automatic fallback to chrome.storage
   */
  async _initializeFallback() {
    if (this.errorHandler) {
      this.errorHandler.logWarn('Initializing fallback mode - IndexedDB unavailable');
      this.errorHandler.setFallbackActive(true);
    }
    
    console.warn('MimirDB: Using chrome.storage.local fallback mode');
    
    // Test chrome.storage availability
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      throw new Error('Neither IndexedDB nor chrome.storage.local is available');
    }
    
    // Mark as fallback mode
    this.db = null;
    this.fallbackEnabled = true;
    
    return 'fallback_mode';
  }

  /**
   * Create all Object Stores with proper schemas and indexes
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   */
  _createObjectStores(db) {
    // 1. History Object Store - Raw browsing history
    // Requirement 2.1: auto-incrementing id as primary key
    if (!db.objectStoreNames.contains('history')) {
      const historyStore = db.createObjectStore('history', {
        keyPath: 'id',
        autoIncrement: true
      });
      
      // Create indexes for efficient querying
      historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      historyStore.createIndex('date', 'date', { unique: false });
      historyStore.createIndex('domain', 'domain', { unique: false });
      
      console.log('Created history Object Store with indexes');
    }

    // 2. Classified Cache Object Store - AI analysis results
    // Requirement 2.2: date (YYYY-MM-DD) as primary key
    if (!db.objectStoreNames.contains('classified_cache')) {
      const classifiedStore = db.createObjectStore('classified_cache', {
        keyPath: 'date'
      });
      
      // Create indexes for efficient querying
      classifiedStore.createIndex('createdAt', 'createdAt', { unique: false });
      
      console.log('Created classified_cache Object Store with indexes');
    }

    // 3. Diaries Object Store - Generated diary entries
    // Requirement 2.3: date (YYYY-MM-DD) as primary key
    if (!db.objectStoreNames.contains('diaries')) {
      const diariesStore = db.createObjectStore('diaries', {
        keyPath: 'date'
      });
      
      // Create indexes for efficient querying
      diariesStore.createIndex('createdAt', 'createdAt', { unique: false });
      diariesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      
      console.log('Created diaries Object Store with indexes');
    }

    // 4. Annual Reports Object Store - Annual reports
    // Requirement 2.4: year (YYYY) as primary key
    if (!db.objectStoreNames.contains('annual_reports')) {
      const reportsStore = db.createObjectStore('annual_reports', {
        keyPath: 'year'
      });
      
      // Create indexes for efficient querying
      reportsStore.createIndex('generatedAt', 'generatedAt', { unique: false });
      
      console.log('Created annual_reports Object Store with indexes');
    }

    // 5. Settings Object Store - User configuration
    // Requirement 2.5: key (string) as primary key
    if (!db.objectStoreNames.contains('settings')) {
      const settingsStore = db.createObjectStore('settings', {
        keyPath: 'key'
      });
      
      console.log('Created settings Object Store');
    }
  }

  /**
   * Get a specific Object Store for transactions
   * Requirements: 3.1, 3.2
   */
  async getStore(storeName, mode = 'readonly') {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const transaction = this.db.transaction(storeName, mode);
      return transaction.objectStore(storeName);
    } catch (error) {
      console.error(`Failed to get store ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized() {
    return this.db !== null;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('MimirDB connection closed');
    }
  }

  /**
   * Data validation utilities
   * Requirements: 8.1, 8.2 - proper error handling and validation
   */
  _validateDate(date) {
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }
    return true;
  }

  _validateYear(year) {
    const yearNum = parseInt(year);
    if (!year || !/^\d{4}$/.test(year.toString()) || yearNum < 1900 || yearNum > 2100) {
      throw new Error('Year must be a valid 4-digit number between 1900-2100');
    }
    return yearNum;
  }

  _validateHistoryRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('History record must be an object');
    }
    if (!record.timestamp || typeof record.timestamp !== 'number') {
      throw new Error('History record must have a valid timestamp');
    }
    if (!record.url || typeof record.url !== 'string') {
      throw new Error('History record must have a valid URL');
    }
    if (!record.title || typeof record.title !== 'string') {
      throw new Error('History record must have a valid title');
    }
    return true;
  }

  /**
   * HISTORY OBJECT STORE - Complete CRUD Operations
   * Requirements: 1.1, 1.2, 5.1, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4
   */

  // CREATE
  async addHistoryRecord(record) {
    try {
      this._validateHistoryRecord(record);
      
      // Ensure required fields are present
      const historyRecord = {
        timestamp: record.timestamp,
        date: record.date || new Date(record.timestamp).toISOString().split('T')[0],
        url: record.url,
        title: record.title,
        domain: record.domain || new URL(record.url).hostname,
        visitCount: record.visitCount || 1,
        lastVisitTime: record.lastVisitTime || record.timestamp
      };
      
      const store = await this.getStore('history', 'readwrite');
      const result = await store.add(historyRecord);
      console.log('Added history record with ID:', result);
      return result;
    } catch (error) {
      console.error('Failed to add history record:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // READ
  async getHistoryRecord(id) {
    try {
      if (!id || typeof id !== 'number') {
        throw new Error('History ID must be a valid number');
      }
      
      const store = await this.getStore('history');
      return await store.get(id);
    } catch (error) {
      console.error('Failed to get history record:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAllHistory(limit = null) {
    try {
      const store = await this.getStore('history');
      const results = await store.getAll();
      return limit ? results.slice(0, limit) : results;
    } catch (error) {
      console.error('Failed to get all history:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getHistoryByDateRange(startDate, endDate) {
    try {
      this._validateDate(startDate);
      this._validateDate(endDate);
      
      if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date');
      }
      
      const store = await this.getStore('history');
      const index = store.index('date');
      return await index.getAll(IDBKeyRange.bound(startDate, endDate));
    } catch (error) {
      console.error('Failed to get history by date range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getHistoryByDomain(domain) {
    try {
      if (!domain || typeof domain !== 'string') {
        throw new Error('Domain must be a non-empty string');
      }
      
      const store = await this.getStore('history');
      const index = store.index('domain');
      return await index.getAll(domain);
    } catch (error) {
      console.error('Failed to get history by domain:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getHistoryByTimestampRange(startTimestamp, endTimestamp) {
    try {
      if (!startTimestamp || !endTimestamp || typeof startTimestamp !== 'number' || typeof endTimestamp !== 'number') {
        throw new Error('Timestamps must be valid numbers');
      }
      
      const store = await this.getStore('history');
      const index = store.index('timestamp');
      return await index.getAll(IDBKeyRange.bound(startTimestamp, endTimestamp));
    } catch (error) {
      console.error('Failed to get history by timestamp range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // UPDATE
  async updateHistoryRecord(id, updates) {
    try {
      if (!id || typeof id !== 'number') {
        throw new Error('History ID must be a valid number');
      }
      if (!updates || typeof updates !== 'object') {
        throw new Error('Updates must be an object');
      }
      
      const store = await this.getStore('history', 'readwrite');
      const existing = await store.get(id);
      if (!existing) {
        throw new Error(`History record with ID ${id} not found`);
      }
      
      const updated = { ...existing, ...updates, id }; // Preserve ID
      this._validateHistoryRecord(updated);
      
      await store.put(updated);
      console.log('Updated history record:', id);
      return updated;
    } catch (error) {
      console.error('Failed to update history record:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // DELETE
  async deleteHistoryRecord(id) {
    try {
      if (!id || typeof id !== 'number') {
        throw new Error('History ID must be a valid number');
      }
      
      const store = await this.getStore('history', 'readwrite');
      const existing = await store.get(id);
      if (!existing) {
        throw new Error(`History record with ID ${id} not found`);
      }
      
      await store.delete(id);
      console.log('Deleted history record:', id);
      return true;
    } catch (error) {
      console.error('Failed to delete history record:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async clearHistoryByDateRange(startDate, endDate) {
    try {
      this._validateDate(startDate);
      this._validateDate(endDate);
      
      const records = await this.getHistoryByDateRange(startDate, endDate);
      const store = await this.getStore('history', 'readwrite');
      
      for (const record of records) {
        await store.delete(record.id);
      }
      
      console.log(`Cleared ${records.length} history records from ${startDate} to ${endDate}`);
      return records.length;
    } catch (error) {
      console.error('Failed to clear history by date range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * CLASSIFIED_CACHE OBJECT STORE - Complete CRUD Operations
   * Requirements: 1.1, 1.2, 5.2, 5.5, 8.1, 8.2, 8.3, 8.4
   */

  // CREATE & UPDATE (using PUT for upsert behavior)
  async saveClassifiedData(date, data) {
    try {
      this._validateDate(date);
      if (!data || typeof data !== 'object') {
        throw new Error('Classified data must be a valid object');
      }
      
      const store = await this.getStore('classified_cache', 'readwrite');
      const record = {
        date,
        data,
        createdAt: Date.now(),
        version: '1.0'
      };
      
      await store.put(record);
      console.log('Saved classified data for date:', date);
      return record;
    } catch (error) {
      console.error('Failed to save classified data:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // READ
  async getClassifiedData(date) {
    try {
      this._validateDate(date);
      
      const store = await this.getStore('classified_cache');
      return await store.get(date);
    } catch (error) {
      console.error('Failed to get classified data:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAllClassifiedData() {
    try {
      const store = await this.getStore('classified_cache');
      return await store.getAll();
    } catch (error) {
      console.error('Failed to get all classified data:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getClassifiedDataByDateRange(startDate, endDate) {
    try {
      this._validateDate(startDate);
      this._validateDate(endDate);
      
      if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date');
      }
      
      const store = await this.getStore('classified_cache');
      return await store.getAll(IDBKeyRange.bound(startDate, endDate));
    } catch (error) {
      console.error('Failed to get classified data by date range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // DELETE
  async deleteClassifiedData(date) {
    try {
      this._validateDate(date);
      
      const store = await this.getStore('classified_cache', 'readwrite');
      const existing = await store.get(date);
      if (!existing) {
        throw new Error(`Classified data for date ${date} not found`);
      }
      
      await store.delete(date);
      console.log('Deleted classified data for date:', date);
      return true;
    } catch (error) {
      console.error('Failed to delete classified data:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * DIARIES OBJECT STORE - Complete CRUD Operations
   * Requirements: 1.1, 1.2, 5.3, 5.5, 8.1, 8.2, 8.3, 8.4
   */

  // CREATE & UPDATE
  async saveDiary(date, content, title = '') {
    try {
      this._validateDate(date);
      if (!content || typeof content !== 'string') {
        throw new Error('Diary content must be a non-empty string');
      }
      
      const store = await this.getStore('diaries', 'readwrite');
      const existing = await store.get(date);
      const now = Date.now();
      
      const record = {
        date,
        content,
        title: title || '',
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
        wordCount: content.trim().split(/\s+/).length,
        tags: existing ? existing.tags : []
      };
      
      await store.put(record);
      console.log('Saved diary for date:', date);
      return record;
    } catch (error) {
      console.error('Failed to save diary:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // READ
  async getDiary(date) {
    try {
      this._validateDate(date);
      
      const store = await this.getStore('diaries');
      return await store.get(date);
    } catch (error) {
      console.error('Failed to get diary:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAllDiaries() {
    try {
      const store = await this.getStore('diaries');
      return await store.getAll();
    } catch (error) {
      console.error('Failed to get all diaries:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getDiariesByDateRange(startDate, endDate) {
    try {
      this._validateDate(startDate);
      this._validateDate(endDate);
      
      if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date');
      }
      
      const store = await this.getStore('diaries');
      return await store.getAll(IDBKeyRange.bound(startDate, endDate));
    } catch (error) {
      console.error('Failed to get diaries by date range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async updateDiaryTags(date, tags) {
    try {
      this._validateDate(date);
      if (!Array.isArray(tags)) {
        throw new Error('Tags must be an array');
      }
      
      const store = await this.getStore('diaries', 'readwrite');
      const existing = await store.get(date);
      if (!existing) {
        throw new Error(`Diary for date ${date} not found`);
      }
      
      existing.tags = tags;
      existing.updatedAt = Date.now();
      
      await store.put(existing);
      console.log('Updated diary tags for date:', date);
      return existing;
    } catch (error) {
      console.error('Failed to update diary tags:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // DELETE
  async deleteDiary(date) {
    try {
      this._validateDate(date);
      
      const store = await this.getStore('diaries', 'readwrite');
      const existing = await store.get(date);
      if (!existing) {
        throw new Error(`Diary for date ${date} not found`);
      }
      
      await store.delete(date);
      console.log('Deleted diary for date:', date);
      return true;
    } catch (error) {
      console.error('Failed to delete diary:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * ANNUAL_REPORTS OBJECT STORE - Complete CRUD Operations
   * Requirements: 1.1, 1.2, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4
   */

  // CREATE & UPDATE
  async saveAnnualReport(year, reportData) {
    try {
      const yearNum = this._validateYear(year);
      if (!reportData || typeof reportData !== 'object') {
        throw new Error('Report data must be a valid object');
      }
      
      const store = await this.getStore('annual_reports', 'readwrite');
      const record = {
        year: yearNum,
        reportData,
        generatedAt: Date.now(),
        version: '1.0',
        summary: reportData.summary || {}
      };
      
      await store.put(record);
      console.log('Saved annual report for year:', yearNum);
      return record;
    } catch (error) {
      console.error('Failed to save annual report:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // READ
  async getAnnualReport(year) {
    try {
      const yearNum = this._validateYear(year);
      
      const store = await this.getStore('annual_reports');
      return await store.get(yearNum);
    } catch (error) {
      console.error('Failed to get annual report:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAllAnnualReports() {
    try {
      const store = await this.getStore('annual_reports');
      return await store.getAll();
    } catch (error) {
      console.error('Failed to get all annual reports:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAnnualReportsByYearRange(startYear, endYear) {
    try {
      const startYearNum = this._validateYear(startYear);
      const endYearNum = this._validateYear(endYear);
      
      if (startYearNum > endYearNum) {
        throw new Error('Start year must be before or equal to end year');
      }
      
      const store = await this.getStore('annual_reports');
      return await store.getAll(IDBKeyRange.bound(startYearNum, endYearNum));
    } catch (error) {
      console.error('Failed to get annual reports by year range:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // DELETE
  async deleteAnnualReport(year) {
    try {
      const yearNum = this._validateYear(year);
      
      const store = await this.getStore('annual_reports', 'readwrite');
      const existing = await store.get(yearNum);
      if (!existing) {
        throw new Error(`Annual report for year ${yearNum} not found`);
      }
      
      await store.delete(yearNum);
      console.log('Deleted annual report for year:', yearNum);
      return true;
    } catch (error) {
      console.error('Failed to delete annual report:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * SETTINGS OBJECT STORE - Complete CRUD Operations
   * Requirements: 1.1, 1.2, 8.1, 8.2, 8.3, 8.4
   */

  // CREATE & UPDATE
  async saveSetting(key, value, category = 'general') {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Setting key must be a non-empty string');
      }
      if (value === undefined) {
        throw new Error('Setting value cannot be undefined');
      }
      
      const store = await this.getStore('settings', 'readwrite');
      const record = {
        key,
        value,
        updatedAt: Date.now(),
        category: category || 'general'
      };
      
      await store.put(record);
      console.log('Saved setting:', key);
      return record;
    } catch (error) {
      console.error('Failed to save setting:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // READ
  async getSetting(key) {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Setting key must be a non-empty string');
      }
      
      const store = await this.getStore('settings');
      const result = await store.get(key);
      return result ? result.value : null;
    } catch (error) {
      console.error('Failed to get setting:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getSettingRecord(key) {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Setting key must be a non-empty string');
      }
      
      const store = await this.getStore('settings');
      return await store.get(key);
    } catch (error) {
      console.error('Failed to get setting record:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getAllSettings() {
    try {
      const store = await this.getStore('settings');
      return await store.getAll();
    } catch (error) {
      console.error('Failed to get all settings:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async getSettingsByCategory(category) {
    try {
      if (!category || typeof category !== 'string') {
        throw new Error('Category must be a non-empty string');
      }
      
      const allSettings = await this.getAllSettings();
      return allSettings.filter(setting => setting.category === category);
    } catch (error) {
      console.error('Failed to get settings by category:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // DELETE
  async deleteSetting(key) {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error('Setting key must be a non-empty string');
      }
      
      const store = await this.getStore('settings', 'readwrite');
      const existing = await store.get(key);
      if (!existing) {
        throw new Error(`Setting with key '${key}' not found`);
      }
      
      await store.delete(key);
      console.log('Deleted setting:', key);
      return true;
    } catch (error) {
      console.error('Failed to delete setting:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  async clearSettingsByCategory(category) {
    try {
      if (!category || typeof category !== 'string') {
        throw new Error('Category must be a non-empty string');
      }
      
      const settings = await this.getSettingsByCategory(category);
      const store = await this.getStore('settings', 'readwrite');
      
      for (const setting of settings) {
        await store.delete(setting.key);
      }
      
      console.log(`Cleared ${settings.length} settings from category: ${category}`);
      return settings.length;
    } catch (error) {
      console.error('Failed to clear settings by category:', error);
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * ADVANCED QUERY METHODS
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5 - efficient querying with date ranges and domain searches
   */

  /**
   * Search across multiple Object Stores
   */
  async searchAll(query, options = {}) {
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Search query must be a non-empty string');
      }
      
      const results = {
        history: [],
        diaries: [],
        classifiedCache: [],
        annualReports: []
      };
      
      const searchTerm = query.toLowerCase();
      
      // Search history by title, URL, or domain
      if (!options.excludeHistory) {
        const historyRecords = await this.getAllHistory();
        results.history = historyRecords.filter(record => 
          record.title.toLowerCase().includes(searchTerm) ||
          record.url.toLowerCase().includes(searchTerm) ||
          record.domain.toLowerCase().includes(searchTerm)
        );
      }
      
      // Search diaries by content or title
      if (!options.excludeDiaries) {
        const diaryRecords = await this.getAllDiaries();
        results.diaries = diaryRecords.filter(record =>
          record.content.toLowerCase().includes(searchTerm) ||
          record.title.toLowerCase().includes(searchTerm)
        );
      }
      
      // Search classified cache (if data contains searchable text)
      if (!options.excludeClassified) {
        const classifiedRecords = await this.getAllClassifiedData();
        results.classifiedCache = classifiedRecords.filter(record => {
          const dataStr = JSON.stringify(record.data).toLowerCase();
          return dataStr.includes(searchTerm);
        });
      }
      
      // Search annual reports
      if (!options.excludeReports) {
        const reportRecords = await this.getAllAnnualReports();
        results.annualReports = reportRecords.filter(record => {
          const reportStr = JSON.stringify(record.reportData).toLowerCase();
          return reportStr.includes(searchTerm);
        });
      }
      
      return results;
    } catch (error) {
      console.error('Failed to search across stores:', error);
      throw new Error(`Search operation failed: ${error.message}`);
    }
  }

  /**
   * Get data statistics for dashboard overview
   */
  async getDataStatistics() {
    try {
      const stats = {
        history: { count: 0, dateRange: null },
        diaries: { count: 0, dateRange: null },
        classifiedCache: { count: 0, dateRange: null },
        annualReports: { count: 0, yearRange: null },
        settings: { count: 0, categories: [] }
      };
      
      // History statistics
      const historyRecords = await this.getAllHistory();
      stats.history.count = historyRecords.length;
      if (historyRecords.length > 0) {
        const dates = historyRecords.map(r => r.date).sort();
        stats.history.dateRange = { start: dates[0], end: dates[dates.length - 1] };
      }
      
      // Diaries statistics
      const diaryRecords = await this.getAllDiaries();
      stats.diaries.count = diaryRecords.length;
      if (diaryRecords.length > 0) {
        const dates = diaryRecords.map(r => r.date).sort();
        stats.diaries.dateRange = { start: dates[0], end: dates[dates.length - 1] };
      }
      
      // Classified cache statistics
      const classifiedRecords = await this.getAllClassifiedData();
      stats.classifiedCache.count = classifiedRecords.length;
      if (classifiedRecords.length > 0) {
        const dates = classifiedRecords.map(r => r.date).sort();
        stats.classifiedCache.dateRange = { start: dates[0], end: dates[dates.length - 1] };
      }
      
      // Annual reports statistics
      const reportRecords = await this.getAllAnnualReports();
      stats.annualReports.count = reportRecords.length;
      if (reportRecords.length > 0) {
        const years = reportRecords.map(r => r.year).sort();
        stats.annualReports.yearRange = { start: years[0], end: years[years.length - 1] };
      }
      
      // Settings statistics
      const settingRecords = await this.getAllSettings();
      stats.settings.count = settingRecords.length;
      stats.settings.categories = [...new Set(settingRecords.map(r => r.category))];
      
      return stats;
    } catch (error) {
      console.error('Failed to get data statistics:', error);
      throw new Error(`Statistics operation failed: ${error.message}`);
    }
  }

  /**
   * Bulk operations for efficient data management
   */
  async bulkAddHistory(records) {
    try {
      if (!Array.isArray(records)) {
        throw new Error('Records must be an array');
      }
      
      const store = await this.getStore('history', 'readwrite');
      const results = [];
      
      for (const record of records) {
        this._validateHistoryRecord(record);
        const historyRecord = {
          timestamp: record.timestamp,
          date: record.date || new Date(record.timestamp).toISOString().split('T')[0],
          url: record.url,
          title: record.title,
          domain: record.domain || new URL(record.url).hostname,
          visitCount: record.visitCount || 1,
          lastVisitTime: record.lastVisitTime || record.timestamp
        };
        
        const id = await store.add(historyRecord);
        results.push(id);
      }
      
      console.log(`Bulk added ${results.length} history records`);
      return results;
    } catch (error) {
      console.error('Failed to bulk add history records:', error);
      throw new Error(`Bulk operation failed: ${error.message}`);
    }
  }

  async bulkDeleteHistory(ids) {
    try {
      if (!Array.isArray(ids)) {
        throw new Error('IDs must be an array');
      }
      
      const store = await this.getStore('history', 'readwrite');
      let deletedCount = 0;
      
      for (const id of ids) {
        if (typeof id === 'number') {
          await store.delete(id);
          deletedCount++;
        }
      }
      
      console.log(`Bulk deleted ${deletedCount} history records`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to bulk delete history records:', error);
      throw new Error(`Bulk operation failed: ${error.message}`);
    }
  }

  /**
   * Data export utilities for backup and analysis
   */
  async exportAllData() {
    try {
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          version: '1.0',
          database: this.dbName
        },
        history: await this.getAllHistory(),
        classifiedCache: await this.getAllClassifiedData(),
        diaries: await this.getAllDiaries(),
        annualReports: await this.getAllAnnualReports(),
        settings: await this.getAllSettings()
      };
      
      console.log('Exported all data successfully');
      return exportData;
    } catch (error) {
      console.error('Failed to export all data:', error);
      throw new Error(`Export operation failed: ${error.message}`);
    }
  }

  async exportDataByDateRange(startDate, endDate) {
    try {
      this._validateDate(startDate);
      this._validateDate(endDate);
      
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          dateRange: { start: startDate, end: endDate },
          version: '1.0',
          database: this.dbName
        },
        history: await this.getHistoryByDateRange(startDate, endDate),
        classifiedCache: await this.getClassifiedDataByDateRange(startDate, endDate),
        diaries: await this.getDiariesByDateRange(startDate, endDate)
      };
      
      console.log(`Exported data for date range: ${startDate} to ${endDate}`);
      return exportData;
    } catch (error) {
      console.error('Failed to export data by date range:', error);
      throw new Error(`Export operation failed: ${error.message}`);
    }
  }

  /**
   * Database maintenance and cleanup utilities
   * Requirements: 8.3, 8.4 - error handling and recovery
   */
  async clearAllData() {
    try {
      const stores = ['history', 'classified_cache', 'diaries', 'annual_reports', 'settings'];
      const results = {};
      
      for (const storeName of stores) {
        const store = await this.getStore(storeName, 'readwrite');
        await store.clear();
        results[storeName] = 'cleared';
      }
      
      console.log('Cleared all data from database');
      return results;
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw new Error(`Clear operation failed: ${error.message}`);
    }
  }

  async validateDatabaseIntegrity() {
    try {
      const issues = [];
      
      // Check history records
      const historyRecords = await this.getAllHistory();
      for (const record of historyRecords) {
        try {
          this._validateHistoryRecord(record);
        } catch (error) {
          issues.push(`History record ${record.id}: ${error.message}`);
        }
      }
      
      // Check date formats in other stores
      const diaryRecords = await this.getAllDiaries();
      for (const record of diaryRecords) {
        try {
          this._validateDate(record.date);
        } catch (error) {
          issues.push(`Diary record ${record.date}: ${error.message}`);
        }
      }
      
      const classifiedRecords = await this.getAllClassifiedData();
      for (const record of classifiedRecords) {
        try {
          this._validateDate(record.date);
        } catch (error) {
          issues.push(`Classified record ${record.date}: ${error.message}`);
        }
      }
      
      const reportRecords = await this.getAllAnnualReports();
      for (const record of reportRecords) {
        try {
          this._validateYear(record.year);
        } catch (error) {
          issues.push(`Annual report ${record.year}: ${error.message}`);
        }
      }
      
      return {
        isValid: issues.length === 0,
        issues: issues,
        checkedRecords: {
          history: historyRecords.length,
          diaries: diaryRecords.length,
          classifiedCache: classifiedRecords.length,
          annualReports: reportRecords.length
        }
      };
    } catch (error) {
      console.error('Failed to validate database integrity:', error);
      throw new Error(`Validation operation failed: ${error.message}`);
    }
  }

  /**
   * Get database info for debugging
   * Requirements: 8.1, 8.2 - proper error handling and logging
   */
  async getInfo() {
    try {
      if (!this.db) {
        await this.initialize();
      }
      
      const stats = await this.getDataStatistics();
      
      return {
        name: this.db.name,
        version: this.db.version,
        objectStoreNames: Array.from(this.db.objectStoreNames),
        statistics: stats,
        isInitialized: this.isInitialized()
      };
    } catch (error) {
      console.error('Failed to get database info:', error);
      throw new Error(`Info operation failed: ${error.message}`);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MimirDB;
} else if (typeof window !== 'undefined') {
  window.MimirDB = MimirDB;
} else if (typeof self !== 'undefined') {
  self.MimirDB = MimirDB;
}