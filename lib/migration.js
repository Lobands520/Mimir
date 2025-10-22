/**
 * Migration utilities for transferring data from chrome.storage.local to IndexedDB
 * This file provides the complete migration system (Task 3)
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.1, 8.2, 8.3, 8.4
 */
class MimirMigration {
  constructor(mimirDB) {
    this.db = mimirDB;
    this.migrationKey = 'mimir-migration-status';
    this.backupKey = 'mimir-migration-backup';
    this.progressKey = 'mimir-migration-progress';
    this.validationKey = 'mimir-migration-validation';
    // Support both window and service worker contexts
    this.errorHandler = (typeof window !== 'undefined' ? window.mimirErrorHandler : null) || 
                       (typeof self !== 'undefined' ? self.mimirErrorHandler : null);
  }

  /**
   * Check if migration has been completed
   * Requirement 4.6: Migration status tracking
   */
  async isMigrationComplete() {
    try {
      const result = await chrome.storage.local.get(this.migrationKey);
      return result[this.migrationKey] === 'completed';
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * Get current migration status with detailed information
   * Requirements: 8.1, 8.2 - proper error handling and logging
   */
  async getMigrationStatus() {
    try {
      const [status, progress, validation] = await Promise.all([
        chrome.storage.local.get(this.migrationKey),
        chrome.storage.local.get(this.progressKey),
        chrome.storage.local.get(this.validationKey)
      ]);

      return {
        status: status[this.migrationKey] || 'not_started',
        progress: progress[this.progressKey] || { current: 0, total: 0, stage: 'idle' },
        validation: validation[this.validationKey] || { passed: false, errors: [] },
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Failed to get migration status:', error);
      throw new Error(`Migration status check failed: ${error.message}`);
    }
  }

  /**
   * Update migration progress
   * Requirement 4.6: Migration progress tracking
   */
  async updateProgress(current, total, stage, details = '') {
    try {
      const progress = {
        current,
        total,
        stage,
        details,
        percentage: total > 0 ? Math.round((current / total) * 100) : 0,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({ [this.progressKey]: progress });
      console.log(`Migration progress: ${progress.percentage}% - ${stage} - ${details}`);
      return progress;
    } catch (error) {
      console.error('Failed to update migration progress:', error);
      throw error;
    }
  }

  /**
   * Mark migration as completed
   * Requirement 4.6: Migration completion tracking
   */
  async markMigrationComplete() {
    try {
      await chrome.storage.local.set({ 
        [this.migrationKey]: 'completed',
        [this.progressKey]: { 
          current: 100, 
          total: 100, 
          stage: 'completed', 
          percentage: 100,
          timestamp: Date.now()
        }
      });
      console.log('Migration marked as completed');
    } catch (error) {
      console.error('Failed to mark migration as completed:', error);
      throw error;
    }
  }

  /**
   * Mark migration as failed with error details
   * Requirements: 8.1, 8.2, 8.3 - comprehensive error handling
   */
  async markMigrationFailed(error, stage = 'unknown') {
    try {
      const failureInfo = {
        status: 'failed',
        error: error.message || error.toString(),
        stage,
        timestamp: Date.now(),
        stack: error.stack
      };

      await chrome.storage.local.set({ 
        [this.migrationKey]: 'failed',
        [`${this.migrationKey}-failure`]: failureInfo
      });
      
      console.error('Migration marked as failed:', failureInfo);
    } catch (setError) {
      console.error('Failed to mark migration as failed:', setError);
    }
  }

  /**
   * Get all chrome.storage.local data for backup
   * Requirement 4.1: Backup existing chrome.storage.local data
   */
  async backupChromeStorage() {
    try {
      await this.updateProgress(0, 100, 'backup', 'Starting chrome.storage backup');
      
      const allData = await chrome.storage.local.get(null);
      const backup = {
        data: allData,
        timestamp: Date.now(),
        version: '1.0',
        itemCount: Object.keys(allData).length
      };

      // Store backup in chrome.storage with a special key
      await chrome.storage.local.set({ [this.backupKey]: backup });
      
      await this.updateProgress(100, 100, 'backup', `Backed up ${backup.itemCount} items`);
      console.log('Chrome storage backup created:', backup.itemCount, 'items');
      
      return backup;
    } catch (error) {
      console.error('Failed to backup chrome storage:', error);
      await this.markMigrationFailed(error, 'backup');
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Transform chrome.storage data to IndexedDB format
   * Requirement 4.2: Data transformation logic
   */
  transformChromeStorageData(chromeData) {
    const transformed = {
      history: [],
      classified_cache: [],
      diaries: [],
      annual_reports: [],
      settings: []
    };

    let transformedCount = 0;
    const totalItems = Object.keys(chromeData).length;

    for (const [key, value] of Object.entries(chromeData)) {
      try {
        // Skip migration-related keys
        if (key.startsWith('mimir-migration-')) {
          continue;
        }

        // Transform classified cache data (classified-YYYY-MM-DD)
        if (key.startsWith('classified-')) {
          const date = key.replace('classified-', '');
          if (this._isValidDate(date)) {
            transformed.classified_cache.push({
              date,
              data: value,
              createdAt: Date.now(),
              version: '1.0'
            });
            transformedCount++;
          }
        }
        // Transform diary data (diary-YYYY-MM-DD)
        else if (key.startsWith('diary-')) {
          const date = key.replace('diary-', '');
          if (this._isValidDate(date)) {
            const content = typeof value === 'string' ? value : JSON.stringify(value);
            transformed.diaries.push({
              date,
              content,
              title: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              wordCount: content.trim().split(/\s+/).length,
              tags: []
            });
            transformedCount++;
          }
        }
        // Transform annual report data (annual-report-YYYY)
        else if (key.startsWith('annual-report-')) {
          const yearStr = key.replace('annual-report-', '');
          const year = parseInt(yearStr);
          if (!isNaN(year) && year >= 1900 && year <= 2100) {
            transformed.annual_reports.push({
              year,
              reportData: value,
              generatedAt: Date.now(),
              version: '1.0',
              summary: value.summary || {}
            });
            transformedCount++;
          }
        }
        // Transform settings data (mimir-config and other settings)
        else if (key === 'mimir-config' || key.startsWith('mimir-')) {
          const settingKey = key === 'mimir-config' ? 'config' : key;
          transformed.settings.push({
            key: settingKey,
            value,
            updatedAt: Date.now(),
            category: key === 'mimir-config' ? 'main' : 'general'
          });
          transformedCount++;
        }
        // Handle any other data as general settings
        else {
          transformed.settings.push({
            key,
            value,
            updatedAt: Date.now(),
            category: 'legacy'
          });
          transformedCount++;
        }
      } catch (error) {
        console.warn(`Failed to transform item ${key}:`, error);
        // Continue with other items instead of failing completely
      }
    }

    console.log(`Transformed ${transformedCount}/${totalItems} items from chrome.storage`);
    return transformed;
  }

  /**
   * Validate transformed data before migration
   * Requirement 4.6: Data integrity validation
   */
  async validateTransformedData(transformedData) {
    const validation = {
      passed: true,
      errors: [],
      warnings: [],
      summary: {}
    };

    try {
      // Validate each object store data
      for (const [storeName, records] of Object.entries(transformedData)) {
        validation.summary[storeName] = records.length;

        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          
          try {
            switch (storeName) {
              case 'classified_cache':
                if (!this._isValidDate(record.date)) {
                  validation.errors.push(`Invalid date in classified_cache[${i}]: ${record.date}`);
                  validation.passed = false;
                }
                if (!record.data || typeof record.data !== 'object') {
                  validation.errors.push(`Invalid data in classified_cache[${i}]`);
                  validation.passed = false;
                }
                break;

              case 'diaries':
                if (!this._isValidDate(record.date)) {
                  validation.errors.push(`Invalid date in diaries[${i}]: ${record.date}`);
                  validation.passed = false;
                }
                if (!record.content || typeof record.content !== 'string') {
                  validation.errors.push(`Invalid content in diaries[${i}]`);
                  validation.passed = false;
                }
                break;

              case 'annual_reports':
                if (!record.year || typeof record.year !== 'number' || record.year < 1900 || record.year > 2100) {
                  validation.errors.push(`Invalid year in annual_reports[${i}]: ${record.year}`);
                  validation.passed = false;
                }
                if (!record.reportData || typeof record.reportData !== 'object') {
                  validation.errors.push(`Invalid reportData in annual_reports[${i}]`);
                  validation.passed = false;
                }
                break;

              case 'settings':
                if (!record.key || typeof record.key !== 'string') {
                  validation.errors.push(`Invalid key in settings[${i}]: ${record.key}`);
                  validation.passed = false;
                }
                if (record.value === undefined) {
                  validation.warnings.push(`Undefined value in settings[${i}] for key: ${record.key}`);
                }
                break;
            }
          } catch (error) {
            validation.errors.push(`Validation error in ${storeName}[${i}]: ${error.message}`);
            validation.passed = false;
          }
        }
      }

      // Store validation results
      await chrome.storage.local.set({ [this.validationKey]: validation });
      
      console.log('Data validation completed:', validation.passed ? 'PASSED' : 'FAILED');
      if (validation.errors.length > 0) {
        console.error('Validation errors:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Validation warnings:', validation.warnings);
      }

      return validation;
    } catch (error) {
      validation.passed = false;
      validation.errors.push(`Validation process failed: ${error.message}`);
      console.error('Failed to validate transformed data:', error);
      return validation;
    }
  }

  /**
   * Migrate data from chrome.storage to IndexedDB
   * Requirements: 4.2, 4.3, 4.4, 4.5 - complete migration process
   */
  async migrateToIndexedDB(transformedData) {
    try {
      await this.updateProgress(0, 100, 'migration', 'Starting IndexedDB migration');

      // Ensure database is initialized
      if (!this.db.isInitialized()) {
        await this.db.initialize();
      }

      let totalRecords = 0;
      let migratedRecords = 0;

      // Count total records
      for (const records of Object.values(transformedData)) {
        totalRecords += records.length;
      }

      // Migrate classified cache data
      await this.updateProgress(10, 100, 'migration', 'Migrating classified cache data');
      for (const record of transformedData.classified_cache) {
        await this.db.saveClassifiedData(record.date, record.data);
        migratedRecords++;
      }

      // Migrate diary data
      await this.updateProgress(30, 100, 'migration', 'Migrating diary data');
      for (const record of transformedData.diaries) {
        await this.db.saveDiary(record.date, record.content, record.title);
        migratedRecords++;
      }

      // Migrate annual reports
      await this.updateProgress(50, 100, 'migration', 'Migrating annual reports');
      for (const record of transformedData.annual_reports) {
        await this.db.saveAnnualReport(record.year, record.reportData);
        migratedRecords++;
      }

      // Migrate settings
      await this.updateProgress(70, 100, 'migration', 'Migrating settings');
      for (const record of transformedData.settings) {
        await this.db.saveSetting(record.key, record.value, record.category);
        migratedRecords++;
      }

      await this.updateProgress(90, 100, 'migration', 'Migration completed, validating data');
      
      console.log(`Successfully migrated ${migratedRecords}/${totalRecords} records to IndexedDB`);
      return { totalRecords, migratedRecords };
    } catch (error) {
      console.error('Failed to migrate data to IndexedDB:', error);
      await this.markMigrationFailed(error, 'migration');
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  /**
   * Validate migrated data in IndexedDB
   * Requirement 4.6: Data integrity validation after migration
   */
  async validateMigratedData(originalData) {
    try {
      await this.updateProgress(90, 100, 'validation', 'Validating migrated data');

      const validation = {
        passed: true,
        errors: [],
        summary: {
          original: {},
          migrated: {},
          matches: {}
        }
      };

      // Count original data
      validation.summary.original = {
        classified_cache: originalData.classified_cache.length,
        diaries: originalData.diaries.length,
        annual_reports: originalData.annual_reports.length,
        settings: originalData.settings.length
      };

      // Count migrated data and validate
      const migratedClassified = await this.db.getAllClassifiedData();
      const migratedDiaries = await this.db.getAllDiaries();
      const migratedReports = await this.db.getAllAnnualReports();
      const migratedSettings = await this.db.getAllSettings();

      validation.summary.migrated = {
        classified_cache: migratedClassified.length,
        diaries: migratedDiaries.length,
        annual_reports: migratedReports.length,
        settings: migratedSettings.length
      };

      // Check if counts match
      for (const store of ['classified_cache', 'diaries', 'annual_reports', 'settings']) {
        const originalCount = validation.summary.original[store];
        const migratedCount = validation.summary.migrated[store];
        validation.summary.matches[store] = originalCount === migratedCount;
        
        if (!validation.summary.matches[store]) {
          validation.errors.push(`Count mismatch in ${store}: original=${originalCount}, migrated=${migratedCount}`);
          validation.passed = false;
        }
      }

      // Sample data validation (check a few records for data integrity)
      if (originalData.classified_cache.length > 0 && migratedClassified.length > 0) {
        const originalFirst = originalData.classified_cache[0];
        const migratedFirst = migratedClassified.find(r => r.date === originalFirst.date);
        if (!migratedFirst || JSON.stringify(migratedFirst.data) !== JSON.stringify(originalFirst.data)) {
          validation.errors.push('Sample classified cache data validation failed');
          validation.passed = false;
        }
      }

      console.log('Migration validation completed:', validation.passed ? 'PASSED' : 'FAILED');
      return validation;
    } catch (error) {
      console.error('Failed to validate migrated data:', error);
      return {
        passed: false,
        errors: [`Validation failed: ${error.message}`],
        summary: {}
      };
    }
  }

  /**
   * Complete migration process with all steps and enhanced error handling
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.1, 8.2, 8.3, 8.4 - full migration workflow with error handling
   */
  async performFullMigration() {
    if (this.errorHandler) {
      return await this.errorHandler.executeWithErrorHandling(
        () => this._performFullMigrationInternal(),
        'FULL_MIGRATION',
        null // No fallback for full migration
      );
    } else {
      return await this._performFullMigrationInternal();
    }
  }

  /**
   * Internal full migration implementation
   */
  async _performFullMigrationInternal() {
    if (this.errorHandler) {
      this.errorHandler.logInfo('Starting full migration process');
    }
    console.log('Starting full migration process...');
    
    // Check if already completed
    if (await this.isMigrationComplete()) {
      const message = 'Migration already completed';
      if (this.errorHandler) {
        this.errorHandler.logInfo(message);
      }
      console.log(message);
      return { success: true, message };
    }

    let backup = null;
    let transformedData = null;

    try {
      // Step 1: Backup chrome.storage data
      await chrome.storage.local.set({ [this.migrationKey]: 'in_progress' });
      backup = await this.backupChromeStorage();

      // Step 2: Transform data
      await this.updateProgress(20, 100, 'transform', 'Transforming data format');
      transformedData = this.transformChromeStorageData(backup.data);

      // Step 3: Validate transformed data
      await this.updateProgress(40, 100, 'validate', 'Validating transformed data');
      const validation = await this.validateTransformedData(transformedData);
      
      if (!validation.passed) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }

      // Step 4: Migrate to IndexedDB
      const migrationResult = await this.migrateToIndexedDB(transformedData);

      // Step 5: Validate migrated data
      const finalValidation = await this.validateMigratedData(transformedData);
      
      if (!finalValidation.passed) {
        throw new Error(`Final validation failed: ${finalValidation.errors.join(', ')}`);
      }

      // Step 6: Mark as completed
      await this.markMigrationComplete();
      
      const result = {
        success: true,
        message: 'Migration completed successfully',
        details: {
          backup: { itemCount: backup.itemCount },
          migration: migrationResult,
          validation: finalValidation
        }
      };

      if (this.errorHandler) {
        this.errorHandler.logInfo('Full migration completed successfully', result);
      }
      console.log('Full migration completed successfully:', result);
      return result;
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.logError('FULL_MIGRATION', error, {
          hasBackup: !!backup,
          hasTransformedData: !!transformedData,
          migrationStep: this.getCurrentMigrationStep()
        });
      }
      
      console.error('Full migration failed:', error);
      await this.markMigrationFailed(error, 'full_migration');
      
      // Provide recovery suggestions based on failure point
      const suggestions = this.getMigrationRecoverySuggestions(error, backup, transformedData);
      const enhancedError = new Error(error.message);
      enhancedError.suggestions = suggestions;
      enhancedError.hasBackup = !!backup;
      enhancedError.canRollback = !!backup;
      
      throw enhancedError;
    }
  }

  /**
   * Get current migration step for error context
   */
  getCurrentMigrationStep() {
    // This would be enhanced to track current step
    return 'unknown';
  }

  /**
   * Get migration-specific recovery suggestions
   * Requirement 8.2: Recovery suggestions for migration errors
   */
  getMigrationRecoverySuggestions(error, backup, transformedData) {
    const suggestions = [];
    
    if (backup) {
      suggestions.push('Your original data has been backed up and can be restored using the rollback feature');
      suggestions.push('Click the "Rollback Migration" button to restore your original data');
    }
    
    if (error.message.includes('quota') || error.message.includes('storage')) {
      suggestions.push('Free up browser storage space and try the migration again');
      suggestions.push('Export your data to reduce storage usage before retrying');
    }
    
    if (error.message.includes('validation')) {
      suggestions.push('Some data may be corrupted - try cleaning up old entries before migration');
      suggestions.push('Check the browser console for specific validation errors');
    }
    
    if (error.message.includes('IndexedDB') || error.message.includes('database')) {
      suggestions.push('Close other browser tabs and try the migration again');
      suggestions.push('Restart your browser and retry the migration');
      suggestions.push('Check if IndexedDB is enabled in your browser settings');
    }
    
    suggestions.push('Contact support if the problem persists - include the error details');
    
    return suggestions;
  }

  /**
   * Rollback mechanism - restore from backup if migration fails
   * Requirement 4.6: Rollback mechanism in case migration fails
   */
  async rollbackMigration() {
    try {
      console.log('Starting migration rollback...');
      
      // Get backup data
      const backupResult = await chrome.storage.local.get(this.backupKey);
      const backup = backupResult[this.backupKey];
      
      if (!backup || !backup.data) {
        throw new Error('No backup data found for rollback');
      }

      await this.updateProgress(0, 100, 'rollback', 'Starting rollback process');

      // Clear current IndexedDB data
      if (this.db.isInitialized()) {
        await this.updateProgress(20, 100, 'rollback', 'Clearing IndexedDB data');
        
        // Clear all object stores
        const stores = ['history', 'classified_cache', 'diaries', 'annual_reports', 'settings'];
        for (const storeName of stores) {
          try {
            const store = await this.db.getStore(storeName, 'readwrite');
            await store.clear();
          } catch (error) {
            console.warn(`Failed to clear store ${storeName}:`, error);
          }
        }
      }

      // Restore chrome.storage data (excluding migration keys)
      await this.updateProgress(60, 100, 'rollback', 'Restoring chrome.storage data');
      const restoreData = { ...backup.data };
      
      // Remove migration-related keys from restore data
      delete restoreData[this.migrationKey];
      delete restoreData[this.backupKey];
      delete restoreData[this.progressKey];
      delete restoreData[this.validationKey];
      
      await chrome.storage.local.clear();
      await chrome.storage.local.set(restoreData);

      // Reset migration status
      await chrome.storage.local.set({ 
        [this.migrationKey]: 'rolled_back',
        [`${this.migrationKey}-rollback`]: {
          timestamp: Date.now(),
          restoredItems: Object.keys(restoreData).length
        }
      });

      await this.updateProgress(100, 100, 'rollback', 'Rollback completed');
      
      const result = {
        success: true,
        message: 'Migration rolled back successfully',
        restoredItems: Object.keys(restoreData).length
      };

      console.log('Migration rollback completed:', result);
      return result;
    } catch (error) {
      console.error('Rollback failed:', error);
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Clean up migration artifacts after successful migration
   * Requirements: 8.4 - cleanup and maintenance
   */
  async cleanupMigrationArtifacts() {
    try {
      console.log('Cleaning up migration artifacts...');
      
      // Remove backup data and temporary keys
      await chrome.storage.local.remove([
        this.backupKey,
        this.progressKey,
        this.validationKey,
        `${this.migrationKey}-failure`
      ]);
      
      console.log('Migration artifacts cleaned up');
      return true;
    } catch (error) {
      console.error('Failed to cleanup migration artifacts:', error);
      return false;
    }
  }

  /**
   * Utility method to validate date format
   */
  _isValidDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().split('T')[0] === dateString;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MimirMigration;
} else if (typeof window !== 'undefined') {
  window.MimirMigration = MimirMigration;
} else if (typeof self !== 'undefined') {
  self.MimirMigration = MimirMigration;
}