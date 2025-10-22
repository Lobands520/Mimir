/**
 * Enhanced Error Handling and Recovery System for MimirDB
 * Requirements: 8.1, 8.2, 8.3, 8.4, 1.4, 3.4
 * 
 * This module provides comprehensive error handling, user-friendly error messages,
 * automatic fallback mechanisms, and detailed logging for debugging.
 */

class MimirErrorHandler {
  constructor() {
    this.logLevel = 'INFO'; // DEBUG, INFO, WARN, ERROR
    this.maxLogEntries = 1000;
    this.logStorage = 'mimir-error-logs';
    this.fallbackActive = false;
    this.errorCounts = new Map();
    this.lastErrors = new Map();
    
    this.init();
  }

  /**
   * Initialize error handler
   */
  init() {
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    // Initialize error tracking
    this.initializeErrorTracking();
    
    console.log('MimirErrorHandler initialized');
  }

  /**
   * Set up global error handlers for unhandled errors
   * Requirement 8.1: Comprehensive error handling
   */
  setupGlobalErrorHandlers() {
    // Only set up window-specific handlers if in window context
    if (typeof window !== 'undefined') {
      // Handle unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.logError('UNHANDLED_PROMISE_REJECTION', event.reason, {
          promise: event.promise,
          timestamp: Date.now()
        });
        
        // Prevent default browser error handling
        event.preventDefault();
      });

      // Handle general JavaScript errors
      window.addEventListener('error', (event) => {
        this.logError('JAVASCRIPT_ERROR', event.error, {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          timestamp: Date.now()
        });
      });
    }
  }

  /**
   * Initialize error tracking and recovery state
   */
  async initializeErrorTracking() {
    try {
      // Load previous error statistics
      const errorStats = await this.getStoredErrorStats();
      if (errorStats) {
        this.errorCounts = new Map(errorStats.counts || []);
        this.lastErrors = new Map(errorStats.lastErrors || []);
      }
    } catch (error) {
      console.warn('Failed to load error statistics:', error);
    }
  }

  /**
   * Enhanced database operation wrapper with comprehensive error handling
   * Requirement 8.1, 8.2: Proper error handling and user-friendly messages
   */
  async executeWithErrorHandling(operation, operationName, fallbackFn = null) {
    const startTime = Date.now();
    let attempt = 0;
    const maxRetries = 3;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        
        // Log operation start for debugging
        this.logDebug(`Starting ${operationName} (attempt ${attempt})`);
        
        // Execute the operation
        const result = await operation();
        
        // Log successful operation
        const duration = Date.now() - startTime;
        this.logInfo(`${operationName} completed successfully in ${duration}ms`);
        
        // Reset error count on success
        this.resetErrorCount(operationName);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Increment error count
        this.incrementErrorCount(operationName);
        
        // Log the error with context
        this.logError(operationName, error, {
          attempt,
          duration,
          maxRetries,
          timestamp: Date.now()
        });
        
        // Check if we should retry
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          this.logWarn(`Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delay);
          continue;
        }
        
        // If all retries failed or error is not retryable
        if (fallbackFn && this.shouldUseFallback(operationName, error)) {
          this.logWarn(`Using fallback for ${operationName}`);
          try {
            const fallbackResult = await fallbackFn();
            this.logInfo(`Fallback for ${operationName} succeeded`);
            return fallbackResult;
          } catch (fallbackError) {
            this.logError(`${operationName}_FALLBACK`, fallbackError);
            throw this.createUserFriendlyError(operationName, error, fallbackError);
          }
        }
        
        // Throw user-friendly error
        throw this.createUserFriendlyError(operationName, error);
      }
    }
  }

  /**
   * Create user-friendly error messages with recovery suggestions
   * Requirement 8.2: User-friendly error messages and recovery suggestions
   */
  createUserFriendlyError(operationName, originalError, fallbackError = null) {
    const errorInfo = this.analyzeError(originalError);
    const suggestions = this.getRecoverySuggestions(operationName, errorInfo);
    
    const userError = new Error(errorInfo.userMessage);
    userError.name = 'MimirUserError';
    userError.operation = operationName;
    userError.originalError = originalError;
    userError.fallbackError = fallbackError;
    userError.suggestions = suggestions;
    userError.errorCode = errorInfo.code;
    userError.severity = errorInfo.severity;
    userError.timestamp = Date.now();
    
    return userError;
  }

  /**
   * Analyze error and provide categorization
   * Requirement 8.1: Detailed error analysis
   */
  analyzeError(error) {
    const errorMessage = error.message || error.toString();
    const errorName = error.name || 'UnknownError';
    
    // Database-specific errors
    if (errorMessage.includes('IndexedDB') || errorMessage.includes('IDBDatabase')) {
      return {
        code: 'DATABASE_ERROR',
        severity: 'HIGH',
        userMessage: 'Database operation failed. Your data may be temporarily unavailable.',
        category: 'DATABASE'
      };
    }
    
    // Storage quota errors
    if (errorMessage.includes('QuotaExceededError') || errorMessage.includes('quota')) {
      return {
        code: 'STORAGE_QUOTA_EXCEEDED',
        severity: 'HIGH',
        userMessage: 'Storage space is full. Please free up space or export your data.',
        category: 'STORAGE'
      };
    }
    
    // Network/API errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('NetworkError')) {
      return {
        code: 'NETWORK_ERROR',
        severity: 'MEDIUM',
        userMessage: 'Network connection failed. Please check your internet connection.',
        category: 'NETWORK'
      };
    }
    
    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
      return {
        code: 'PERMISSION_ERROR',
        severity: 'HIGH',
        userMessage: 'Permission denied. Please check browser settings and permissions.',
        category: 'PERMISSION'
      };
    }
    
    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return {
        code: 'VALIDATION_ERROR',
        severity: 'MEDIUM',
        userMessage: 'Data validation failed. Please check your input and try again.',
        category: 'VALIDATION'
      };
    }
    
    // Migration errors
    if (errorMessage.includes('migration') || errorMessage.includes('Migration')) {
      return {
        code: 'MIGRATION_ERROR',
        severity: 'HIGH',
        userMessage: 'Data migration failed. Your original data is safe and can be restored.',
        category: 'MIGRATION'
      };
    }
    
    // Generic error
    return {
      code: 'UNKNOWN_ERROR',
      severity: 'MEDIUM',
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      category: 'UNKNOWN'
    };
  }

  /**
   * Get recovery suggestions based on error type and operation
   * Requirement 8.2: Recovery suggestions
   */
  getRecoverySuggestions(operationName, errorInfo) {
    const suggestions = [];
    
    switch (errorInfo.category) {
      case 'DATABASE':
        suggestions.push('Try refreshing the page to reinitialize the database');
        suggestions.push('Check if you have sufficient storage space available');
        suggestions.push('Clear browser cache and cookies for this site');
        if (operationName.includes('migration')) {
          suggestions.push('Use the rollback feature to restore your original data');
        }
        break;
        
      case 'STORAGE':
        suggestions.push('Export your data to free up space');
        suggestions.push('Delete old or unnecessary data');
        suggestions.push('Check browser storage settings and increase quota if possible');
        suggestions.push('Use the data cleanup feature to remove expired entries');
        break;
        
      case 'NETWORK':
        suggestions.push('Check your internet connection');
        suggestions.push('Try again in a few moments');
        suggestions.push('Disable VPN or proxy if you are using one');
        suggestions.push('Check if the API service is available');
        break;
        
      case 'PERMISSION':
        suggestions.push('Check browser permissions for this site');
        suggestions.push('Enable storage permissions in browser settings');
        suggestions.push('Try using an incognito/private window');
        suggestions.push('Disable browser extensions that might block storage');
        break;
        
      case 'VALIDATION':
        suggestions.push('Check that all required fields are filled correctly');
        suggestions.push('Verify date formats are correct (YYYY-MM-DD)');
        suggestions.push('Ensure data types match expected formats');
        break;
        
      case 'MIGRATION':
        suggestions.push('Use the rollback feature to restore your data');
        suggestions.push('Check that you have sufficient storage space');
        suggestions.push('Try the migration again after clearing browser cache');
        suggestions.push('Export your data as a backup before retrying');
        break;
        
      default:
        suggestions.push('Try refreshing the page');
        suggestions.push('Clear browser cache and try again');
        suggestions.push('Check browser console for more details');
        suggestions.push('Contact support if the problem persists');
    }
    
    return suggestions;
  }

  /**
   * Determine if an error is retryable
   * Requirement 8.3: Automatic retry logic
   */
  isRetryableError(error) {
    const errorMessage = error.message || error.toString();
    
    // Non-retryable errors
    const nonRetryablePatterns = [
      'QuotaExceededError',
      'permission',
      'denied',
      'validation',
      'invalid',
      'NotFoundError',
      'ConstraintError'
    ];
    
    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }
    
    // Retryable errors (temporary issues)
    const retryablePatterns = [
      'network',
      'timeout',
      'connection',
      'TransactionInactiveError',
      'AbortError'
    ];
    
    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }
    
    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Determine if fallback should be used
   * Requirement 8.3: Automatic fallback logic
   */
  shouldUseFallback(operationName, error) {
    // Always use fallback for critical operations
    const criticalOperations = [
      'getSettings',
      'saveSettings',
      'getClassifiedData',
      'saveClassifiedData',
      'getDiary',
      'saveDiary'
    ];
    
    if (criticalOperations.some(op => operationName.includes(op))) {
      return true;
    }
    
    // Use fallback if error count is high
    const errorCount = this.getErrorCount(operationName);
    if (errorCount >= 3) {
      return true;
    }
    
    // Use fallback for database errors
    const errorMessage = error.message || error.toString();
    if (errorMessage.includes('IndexedDB') || errorMessage.includes('IDBDatabase')) {
      return true;
    }
    
    return false;
  }

  /**
   * Logging methods with different levels
   * Requirement 8.4: Logging system for debugging
   */
  logDebug(message, data = null) {
    if (this.shouldLog('DEBUG')) {
      this.writeLog('DEBUG', message, data);
    }
  }

  logInfo(message, data = null) {
    if (this.shouldLog('INFO')) {
      this.writeLog('INFO', message, data);
    }
  }

  logWarn(message, data = null) {
    if (this.shouldLog('WARN')) {
      this.writeLog('WARN', message, data);
      console.warn(`[Mimir] ${message}`, data);
    }
  }

  logError(operation, error, context = null) {
    if (this.shouldLog('ERROR')) {
      const errorData = {
        operation,
        message: error.message || error.toString(),
        name: error.name,
        stack: error.stack,
        context,
        timestamp: Date.now()
      };
      
      this.writeLog('ERROR', `${operation} failed`, errorData);
      console.error(`[Mimir] ${operation} failed:`, error, context);
      
      // Store last error for this operation
      this.lastErrors.set(operation, errorData);
    }
  }

  /**
   * Write log entry to storage
   */
  async writeLog(level, message, data = null) {
    try {
      const logEntry = {
        level,
        message,
        data,
        timestamp: Date.now(),
        url: typeof window !== 'undefined' ? window.location.href : 'service-worker',
        userAgent: navigator.userAgent
      };
      
      // Get existing logs
      const existingLogs = await this.getStoredLogs();
      
      // Add new log entry
      existingLogs.push(logEntry);
      
      // Trim logs if too many
      if (existingLogs.length > this.maxLogEntries) {
        existingLogs.splice(0, existingLogs.length - this.maxLogEntries);
      }
      
      // Store logs
      await this.storeLogs(existingLogs);
      
    } catch (error) {
      // Fallback to console if storage fails
      console.error('[Mimir] Failed to write log:', error);
    }
  }

  /**
   * Check if message should be logged based on level
   */
  shouldLog(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Error counting methods
   */
  incrementErrorCount(operation) {
    const current = this.errorCounts.get(operation) || 0;
    this.errorCounts.set(operation, current + 1);
    this.saveErrorStats();
  }

  resetErrorCount(operation) {
    this.errorCounts.set(operation, 0);
    this.saveErrorStats();
  }

  getErrorCount(operation) {
    return this.errorCounts.get(operation) || 0;
  }

  /**
   * Storage methods for logs and error statistics
   */
  async getStoredLogs() {
    try {
      const result = await chrome.storage.local.get(this.logStorage);
      return result[this.logStorage] || [];
    } catch (error) {
      console.warn('Failed to get stored logs:', error);
      return [];
    }
  }

  async storeLogs(logs) {
    try {
      await chrome.storage.local.set({ [this.logStorage]: logs });
    } catch (error) {
      console.error('Failed to store logs:', error);
    }
  }

  async getStoredErrorStats() {
    try {
      const result = await chrome.storage.local.get('mimir-error-stats');
      return result['mimir-error-stats'];
    } catch (error) {
      console.warn('Failed to get error stats:', error);
      return null;
    }
  }

  async saveErrorStats() {
    try {
      const stats = {
        counts: Array.from(this.errorCounts.entries()),
        lastErrors: Array.from(this.lastErrors.entries()),
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({ 'mimir-error-stats': stats });
    } catch (error) {
      console.warn('Failed to save error stats:', error);
    }
  }

  /**
   * Public methods for error reporting and recovery
   */
  async getErrorReport() {
    const logs = await this.getStoredLogs();
    const errorLogs = logs.filter(log => log.level === 'ERROR');
    
    return {
      totalErrors: errorLogs.length,
      recentErrors: errorLogs.slice(-10),
      errorCounts: Object.fromEntries(this.errorCounts),
      lastErrors: Object.fromEntries(this.lastErrors),
      fallbackActive: this.fallbackActive,
      timestamp: Date.now()
    };
  }

  async clearLogs() {
    try {
      await chrome.storage.local.remove([this.logStorage, 'mimir-error-stats']);
      this.errorCounts.clear();
      this.lastErrors.clear();
      console.log('Error logs cleared');
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  /**
   * Set fallback status
   */
  setFallbackActive(active) {
    this.fallbackActive = active;
    this.logInfo(`Fallback mode ${active ? 'activated' : 'deactivated'}`);
  }

  /**
   * Utility method for sleep/delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set log level
   */
  setLogLevel(level) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level)) {
      this.logLevel = level;
      this.logInfo(`Log level set to ${level}`);
    }
  }
}

// Create global instance (only in window context)
if (typeof window !== 'undefined') {
  window.mimirErrorHandler = new MimirErrorHandler();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MimirErrorHandler;
} else if (typeof window !== 'undefined') {
  window.MimirErrorHandler = MimirErrorHandler;
}