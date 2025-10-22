/**
 * Database Wrapper - Provides chrome.storage.local compatible interface for IndexedDB
 * This wrapper maintains backward compatibility while using IndexedDB as the storage backend
 * Enhanced with comprehensive error handling and automatic fallback mechanisms
 * Requirements: 8.1, 8.2, 8.3, 8.4, 1.4, 3.4
 */
class DatabaseWrapper {
  constructor() {
    this.mimirDB = null;
    this.initialized = false;
    this.fallbackMode = false;
    // Support both window and service worker contexts
    this.errorHandler = (typeof window !== 'undefined' ? window.mimirErrorHandler : null) || 
                       (typeof self !== 'undefined' ? self.mimirErrorHandler : null);
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 3;
  }

  /**
   * Initialize the database wrapper with enhanced error handling
   * Requirements: 8.1, 8.2, 8.3 - comprehensive error handling and fallback
   */
  async initialize() {
    if (this.initialized) return;
    
    this.initializationAttempts++;
    
    if (this.errorHandler) {
      return await this.errorHandler.executeWithErrorHandling(
        () => this._initializeWithRetry(),
        'DATABASE_WRAPPER_INITIALIZATION',
        () => this._enableFallbackMode()
      );
    } else {
      return await this._initializeWithRetry();
    }
  }

  /**
   * Internal initialization with retry logic
   */
  async _initializeWithRetry() {
    try {
      this.mimirDB = new MimirDB();
      const result = await this.mimirDB.initialize();
      
      if (result === 'fallback_mode') {
        return await this._enableFallbackMode();
      }
      
      this.initialized = true;
      this.fallbackMode = false;
      
      if (this.errorHandler) {
        this.errorHandler.logInfo('DatabaseWrapper initialized successfully with IndexedDB');
      }
      console.log('DatabaseWrapper initialized successfully');
      
      return true;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.logError('DATABASE_WRAPPER_INIT', error, {
          attempt: this.initializationAttempts,
          maxAttempts: this.maxInitializationAttempts
        });
      }
      
      // If we've exhausted retries, enable fallback mode
      if (this.initializationAttempts >= this.maxInitializationAttempts) {
        return await this._enableFallbackMode();
      }
      
      throw error;
    }
  }

  /**
   * Enable fallback mode when IndexedDB fails
   * Requirement 8.3: Automatic fallback to chrome.storage
   */
  async _enableFallbackMode() {
    try {
      // Test chrome.storage availability
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        throw new Error('Neither IndexedDB nor chrome.storage.local is available');
      }
      
      // Test chrome.storage functionality
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ 'mimir-test': 'test' }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            chrome.storage.local.remove('mimir-test', resolve);
          }
        });
      });
      
      this.fallbackMode = true;
      this.initialized = true;
      
      if (this.errorHandler) {
        this.errorHandler.logWarn('DatabaseWrapper initialized in fallback mode (chrome.storage.local)');
        this.errorHandler.setFallbackActive(true);
      }
      
      console.warn('DatabaseWrapper: Using chrome.storage.local fallback mode');
      return true;
      
    } catch (error) {
      this.initialized = false;
      this.fallbackMode = false;
      
      if (this.errorHandler) {
        this.errorHandler.logError('FALLBACK_MODE_INIT', error);
      }
      
      throw new Error(`Failed to initialize database: IndexedDB unavailable and chrome.storage.local failed: ${error.message}`);
    }
  }

  /**
   * Ensure database is initialized before operations
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.initialized;
  }

  /**
   * Chrome.storage.local compatible get method with enhanced error handling
   * Supports both single keys and arrays of keys
   * Requirements: 8.1, 8.2, 8.3 - comprehensive error handling and fallback
   */
  async get(keys = null) {
    if (this.errorHandler) {
      return await this.errorHandler.executeWithErrorHandling(
        () => this._performGet(keys),
        'DATABASE_GET',
        () => this.fallbackGet(keys)
      );
    } else {
      return await this._performGet(keys);
    }
  }

  /**
   * Internal get method implementation
   */
  async _performGet(keys = null) {
    const isInitialized = await this.ensureInitialized();
    
    // Use fallback if in fallback mode
    if (this.fallbackMode || !isInitialized) {
      return await this.fallbackGet(keys);
    }
    
    const result = {};
    
    if (keys === null) {
      // Get all data - equivalent to chrome.storage.local.get(null)
      const [settings, classified, diaries, reports] = await Promise.all([
        this.mimirDB.getAllSettings(),
        this.mimirDB.getAllClassifiedData(),
        this.mimirDB.getAllDiaries(),
        this.mimirDB.getAllAnnualReports()
      ]);
      
      // Convert settings to chrome.storage format
      settings.forEach(setting => {
        result[setting.key] = setting.value;
      });
      
      // Convert classified data to chrome.storage format
      classified.forEach(item => {
        result[`classified-${item.date}`] = item.data;
      });
      
      // Convert diaries to chrome.storage format
      diaries.forEach(item => {
        result[`diary-${item.date}`] = item.content;
      });
      
      // Convert annual reports to chrome.storage format
      reports.forEach(item => {
        result[`annual-report-${item.year}`] = item.reportData;
      });
      
      return result;
    }
    
    // Handle single key or array of keys
    const keyArray = Array.isArray(keys) ? keys : [keys];
    
    for (const key of keyArray) {
      try {
        if (key === 'mimir-config') {
          // Handle settings
          const value = await this.mimirDB.getSetting('mimir-config');
          if (value !== null) {
            result[key] = value;
          }
        } else if (key.startsWith('classified-')) {
          // Handle classified data
          const date = key.replace('classified-', '');
          const classifiedData = await this.mimirDB.getClassifiedData(date);
          if (classifiedData) {
            result[key] = classifiedData.data;
          }
        } else if (key.startsWith('diary-')) {
          // Handle diary data
          const date = key.replace('diary-', '');
          const diaryData = await this.mimirDB.getDiary(date);
          if (diaryData) {
            result[key] = diaryData.content;
          }
        } else if (key.startsWith('annual-report-')) {
          // Handle annual report data
          const year = key.replace('annual-report-', '');
          const reportData = await this.mimirDB.getAnnualReport(year);
          if (reportData) {
            result[key] = reportData.reportData;
          }
        } else {
          // Handle other settings
          const value = await this.mimirDB.getSetting(key);
          if (value !== null) {
            result[key] = value;
          }
        }
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler.logWarn(`Failed to get key ${key}`, error);
        }
        // Continue with other keys instead of failing completely
        console.warn(`Failed to get key ${key}:`, error);
      }
    }
    
    return result;
  }

  /**
   * Chrome.storage.local compatible set method with enhanced error handling
   * Requirements: 8.1, 8.2, 8.3 - comprehensive error handling and fallback
   */
  async set(items) {
    if (this.errorHandler) {
      return await this.errorHandler.executeWithErrorHandling(
        () => this._performSet(items),
        'DATABASE_SET',
        () => this.fallbackSet(items)
      );
    } else {
      return await this._performSet(items);
    }
  }

  /**
   * Internal set method implementation
   */
  async _performSet(items) {
    const isInitialized = await this.ensureInitialized();
    
    // Use fallback if in fallback mode
    if (this.fallbackMode || !isInitialized) {
      return await this.fallbackSet(items);
    }
    
    const promises = [];
    const failedKeys = [];
    
    for (const [key, value] of Object.entries(items)) {
      try {
        if (key === 'mimir-config') {
          // Handle settings
          promises.push(this.mimirDB.saveSetting('mimir-config', value, 'config'));
        } else if (key.startsWith('classified-')) {
          // Handle classified data
          const date = key.replace('classified-', '');
          promises.push(this.mimirDB.saveClassifiedData(date, value));
        } else if (key.startsWith('diary-')) {
          // Handle diary data
          const date = key.replace('diary-', '');
          promises.push(this.mimirDB.saveDiary(date, value));
        } else if (key.startsWith('annual-report-')) {
          // Handle annual report data
          const year = key.replace('annual-report-', '');
          promises.push(this.mimirDB.saveAnnualReport(year, value));
        } else {
          // Handle other settings
          promises.push(this.mimirDB.saveSetting(key, value));
        }
      } catch (error) {
        failedKeys.push(key);
        if (this.errorHandler) {
          this.errorHandler.logWarn(`Failed to prepare set operation for key ${key}`, error);
        }
        console.warn(`Failed to prepare set operation for key ${key}:`, error);
      }
    }
    
    // Execute all promises
    const results = await Promise.allSettled(promises);
    
    // Check for failures
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      const errorMessage = `${failures.length} out of ${promises.length} set operations failed`;
      if (this.errorHandler) {
        this.errorHandler.logWarn(errorMessage, { failures: failures.map(f => f.reason) });
      }
      
      // If more than half failed, throw error to trigger fallback
      if (failures.length > promises.length / 2) {
        throw new Error(errorMessage);
      }
    }
    
    if (this.errorHandler) {
      this.errorHandler.logInfo(`DatabaseWrapper set completed for ${Object.keys(items).length} keys`);
    }
    console.log('DatabaseWrapper set completed for keys:', Object.keys(items));
  }

  /**
   * Chrome.storage.local compatible remove method
   */
  async remove(keys) {
    const isInitialized = await this.ensureInitialized();
    
    // Use fallback if IndexedDB is not available
    if (!isInitialized) {
      return await this.fallbackRemove(keys);
    }
    
    try {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const promises = [];
      
      for (const key of keyArray) {
        if (key === 'mimir-config') {
          promises.push(this.mimirDB.deleteSetting('mimir-config'));
        } else if (key.startsWith('classified-')) {
          const date = key.replace('classified-', '');
          promises.push(this.mimirDB.deleteClassifiedData(date));
        } else if (key.startsWith('diary-')) {
          const date = key.replace('diary-', '');
          promises.push(this.mimirDB.deleteDiary(date));
        } else if (key.startsWith('annual-report-')) {
          const year = key.replace('annual-report-', '');
          promises.push(this.mimirDB.deleteAnnualReport(year));
        } else {
          promises.push(this.mimirDB.deleteSetting(key));
        }
      }
      
      await Promise.all(promises);
      console.log('DatabaseWrapper remove completed for keys:', keyArray);
    } catch (error) {
      console.error('DatabaseWrapper remove failed:', error);
      // Fallback to chrome.storage.local if IndexedDB fails
      await this.fallbackRemove(keys);
    }
  }

  /**
   * Chrome.storage.local compatible clear method
   */
  async clear() {
    const isInitialized = await this.ensureInitialized();
    
    // Use fallback if IndexedDB is not available
    if (!isInitialized) {
      return await chrome.storage.local.clear();
    }
    
    try {
      // Clear all Object Stores
      const promises = [
        this.mimirDB.getAllSettings().then(settings => 
          Promise.all(settings.map(s => this.mimirDB.deleteSetting(s.key)))
        ),
        this.mimirDB.getAllClassifiedData().then(classified => 
          Promise.all(classified.map(c => this.mimirDB.deleteClassifiedData(c.date)))
        ),
        this.mimirDB.getAllDiaries().then(diaries => 
          Promise.all(diaries.map(d => this.mimirDB.deleteDiary(d.date)))
        ),
        this.mimirDB.getAllAnnualReports().then(reports => 
          Promise.all(reports.map(r => this.mimirDB.deleteAnnualReport(r.year)))
        )
      ];
      
      await Promise.all(promises);
      console.log('DatabaseWrapper clear completed');
    } catch (error) {
      console.error('DatabaseWrapper clear failed:', error);
      // Fallback to chrome.storage.local if IndexedDB fails
      await chrome.storage.local.clear();
    }
  }

  /**
   * Enhanced fallback methods with proper error handling
   * Requirement 8.3: Automatic fallback to chrome.storage
   */
  async fallbackGet(keys) {
    if (this.errorHandler) {
      this.errorHandler.logWarn('Using chrome.storage.local fallback for get operation');
    }
    console.warn('Using chrome.storage.local fallback for get operation');
    
    return new Promise((resolve, reject) => {
      try {
        const callback = (result) => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            if (this.errorHandler) {
              this.errorHandler.logError('FALLBACK_GET', error);
            }
            reject(error);
          } else {
            resolve(result);
          }
        };
        
        if (keys === null) {
          chrome.storage.local.get(null, callback);
        } else {
          chrome.storage.local.get(keys, callback);
        }
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler.logError('FALLBACK_GET_SETUP', error);
        }
        reject(error);
      }
    });
  }

  async fallbackSet(items) {
    if (this.errorHandler) {
      this.errorHandler.logWarn('Using chrome.storage.local fallback for set operation');
    }
    console.warn('Using chrome.storage.local fallback for set operation');
    
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            if (this.errorHandler) {
              this.errorHandler.logError('FALLBACK_SET', error);
            }
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler.logError('FALLBACK_SET_SETUP', error);
        }
        reject(error);
      }
    });
  }

  async fallbackRemove(keys) {
    if (this.errorHandler) {
      this.errorHandler.logWarn('Using chrome.storage.local fallback for remove operation');
    }
    console.warn('Using chrome.storage.local fallback for remove operation');
    
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove(keys, () => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            if (this.errorHandler) {
              this.errorHandler.logError('FALLBACK_REMOVE', error);
            }
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler.logError('FALLBACK_REMOVE_SETUP', error);
        }
        reject(error);
      }
    });
  }

  /**
   * Check if IndexedDB is available and working
   */
  async isIndexedDBAvailable() {
    try {
      await this.ensureInitialized();
      return this.initialized;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus() {
    try {
      const status = await this.mimirDB.getSetting('migration-status');
      return status || 'not_started';
    } catch (error) {
      return 'not_started';
    }
  }

  /**
   * Set migration status
   */
  async setMigrationStatus(status) {
    try {
      await this.mimirDB.saveSetting('migration-status', status, 'system');
    } catch (error) {
      console.error('Failed to set migration status:', error);
    }
  }
}

// Create global instance only in window context
// Service worker will create its own instance
if (typeof window !== 'undefined') {
  window.dbWrapper = new DatabaseWrapper();
}