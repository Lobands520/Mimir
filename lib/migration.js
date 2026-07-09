class MimirMigration {
  constructor(dbWrapper) {
    this.dbWrapper = dbWrapper || new DatabaseWrapper();
    this.statusKey = 'mimir-migration-status';
  }

  async getStatus() {
    await this.dbWrapper.initialize();
    return this.dbWrapper.getMigrationStatus();
  }

  async setStatus(status) {
    await this.dbWrapper.initialize();
    await this.dbWrapper.setMigrationStatus(status);
  }

  async backupChromeStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve({
          timestamp: Date.now(),
          itemCount: Object.keys(result).length,
          data: result
        });
      });
    });
  }

  async migrate() {
    await this.setStatus('in_progress');

    try {
      const backup = await this.backupChromeStorage();
      const filteredData = {};

      Object.entries(backup.data).forEach(([key, value]) => {
        if (!key.startsWith('mimir-migration-')) {
          filteredData[key] = value;
        }
      });

      await this.dbWrapper.set(filteredData);
      await this.setStatus('completed');
      return {
        success: true,
        itemCount: Object.keys(filteredData).length
      };
    } catch (error) {
      await this.setStatus('failed');
      return {
        success: false,
        error: error.message
      };
    }
  }
}

if (typeof window !== 'undefined') {
  window.MimirMigration = MimirMigration;
} else if (typeof self !== 'undefined') {
  self.MimirMigration = MimirMigration;
}
