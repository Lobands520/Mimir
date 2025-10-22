/**
 * Error UI Component - User-friendly error display and recovery interface
 * Requirements: 8.2 - User-friendly error messages and recovery suggestions
 * 
 * This component provides a consistent way to display errors and recovery options
 * across the Mimir application.
 */

class MimirErrorUI {
  constructor() {
    // Support both window and service worker contexts (though UI is mainly for window)
    this.errorHandler = (typeof window !== 'undefined' ? window.mimirErrorHandler : null) || 
                       (typeof self !== 'undefined' ? self.mimirErrorHandler : null);
    this.activeToasts = new Map();
    this.maxToasts = 3;
    
    this.init();
  }

  /**
   * Initialize error UI system
   */
  init() {
    this.createErrorContainer();
    this.setupStyles();
    
    // Listen for global errors if error handler is available
    if (this.errorHandler) {
      this.setupErrorHandlerIntegration();
    }
  }

  /**
   * Create error container in DOM
   */
  createErrorContainer() {
    if (document.getElementById('mimir-error-container')) {
      return; // Already exists
    }

    const container = document.createElement('div');
    container.id = 'mimir-error-container';
    container.className = 'mimir-error-container';
    
    // Insert at the beginning of body
    document.body.insertBefore(container, document.body.firstChild);
  }

  /**
   * Setup CSS styles for error UI
   */
  setupStyles() {
    if (document.getElementById('mimir-error-styles')) {
      return; // Already exists
    }

    const styles = document.createElement('style');
    styles.id = 'mimir-error-styles';
    styles.textContent = `
      .mimir-error-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        pointer-events: none;
      }

      .mimir-error-toast {
        background: #fff;
        border-left: 4px solid #e74c3c;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        margin-bottom: 10px;
        padding: 16px;
        pointer-events: auto;
        transform: translateX(100%);
        transition: transform 0.3s ease-in-out;
        max-height: 300px;
        overflow-y: auto;
      }

      .mimir-error-toast.show {
        transform: translateX(0);
      }

      .mimir-error-toast.warning {
        border-left-color: #f39c12;
      }

      .mimir-error-toast.info {
        border-left-color: #3498db;
      }

      .mimir-error-toast.success {
        border-left-color: #27ae60;
      }

      .mimir-error-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }

      .mimir-error-title {
        font-weight: bold;
        color: #2c3e50;
        margin: 0;
        font-size: 14px;
      }

      .mimir-error-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #7f8c8d;
        padding: 0;
        margin-left: 10px;
      }

      .mimir-error-close:hover {
        color: #2c3e50;
      }

      .mimir-error-message {
        color: #34495e;
        font-size: 13px;
        line-height: 1.4;
        margin-bottom: 12px;
      }

      .mimir-error-suggestions {
        margin-top: 12px;
      }

      .mimir-error-suggestions-title {
        font-weight: bold;
        color: #2c3e50;
        font-size: 12px;
        margin-bottom: 6px;
      }

      .mimir-error-suggestions-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .mimir-error-suggestions-list li {
        font-size: 12px;
        color: #7f8c8d;
        margin-bottom: 4px;
        padding-left: 16px;
        position: relative;
      }

      .mimir-error-suggestions-list li:before {
        content: "•";
        color: #3498db;
        position: absolute;
        left: 0;
      }

      .mimir-error-actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .mimir-error-action {
        background: #3498db;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .mimir-error-action:hover {
        background: #2980b9;
      }

      .mimir-error-action.secondary {
        background: #95a5a6;
      }

      .mimir-error-action.secondary:hover {
        background: #7f8c8d;
      }

      .mimir-error-details {
        margin-top: 8px;
        font-size: 11px;
        color: #95a5a6;
        font-family: monospace;
        background: #f8f9fa;
        padding: 8px;
        border-radius: 3px;
        max-height: 100px;
        overflow-y: auto;
        display: none;
      }

      .mimir-error-details.show {
        display: block;
      }
    `;
    
    document.head.appendChild(styles);
  }

  /**
   * Setup integration with error handler
   */
  setupErrorHandlerIntegration() {
    // This would be enhanced to listen for error handler events
    console.log('Error UI integrated with error handler');
  }

  /**
   * Show error toast with recovery suggestions
   * Requirement 8.2: User-friendly error messages and recovery suggestions
   */
  showError(error, options = {}) {
    const config = {
      title: 'Error',
      type: 'error',
      duration: 0, // 0 = persistent
      showSuggestions: true,
      showActions: true,
      ...options
    };

    const toast = this.createErrorToast(error, config);
    this.displayToast(toast, config);
    
    return toast.id;
  }

  /**
   * Show warning toast
   */
  showWarning(message, options = {}) {
    const config = {
      title: 'Warning',
      type: 'warning',
      duration: 8000,
      ...options
    };

    const error = { message, suggestions: options.suggestions || [] };
    const toast = this.createErrorToast(error, config);
    this.displayToast(toast, config);
    
    return toast.id;
  }

  /**
   * Show info toast
   */
  showInfo(message, options = {}) {
    const config = {
      title: 'Information',
      type: 'info',
      duration: 5000,
      ...options
    };

    const error = { message, suggestions: options.suggestions || [] };
    const toast = this.createErrorToast(error, config);
    this.displayToast(toast, config);
    
    return toast.id;
  }

  /**
   * Show success toast
   */
  showSuccess(message, options = {}) {
    const config = {
      title: 'Success',
      type: 'success',
      duration: 3000,
      ...options
    };

    const error = { message, suggestions: [] };
    const toast = this.createErrorToast(error, config);
    this.displayToast(toast, config);
    
    return toast.id;
  }

  /**
   * Create error toast element
   */
  createErrorToast(error, config) {
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `mimir-error-toast ${config.type}`;
    
    // Header
    const header = document.createElement('div');
    header.className = 'mimir-error-header';
    
    const title = document.createElement('h4');
    title.className = 'mimir-error-title';
    title.textContent = config.title;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mimir-error-close';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => this.dismissToast(toastId);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    toast.appendChild(header);
    
    // Message
    const message = document.createElement('div');
    message.className = 'mimir-error-message';
    message.textContent = error.message || 'An unknown error occurred';
    toast.appendChild(message);
    
    // Suggestions
    if (config.showSuggestions && error.suggestions && error.suggestions.length > 0) {
      const suggestionsContainer = document.createElement('div');
      suggestionsContainer.className = 'mimir-error-suggestions';
      
      const suggestionsTitle = document.createElement('div');
      suggestionsTitle.className = 'mimir-error-suggestions-title';
      suggestionsTitle.textContent = 'Recovery Suggestions:';
      suggestionsContainer.appendChild(suggestionsTitle);
      
      const suggestionsList = document.createElement('ul');
      suggestionsList.className = 'mimir-error-suggestions-list';
      
      error.suggestions.forEach(suggestion => {
        const li = document.createElement('li');
        li.textContent = suggestion;
        suggestionsList.appendChild(li);
      });
      
      suggestionsContainer.appendChild(suggestionsList);
      toast.appendChild(suggestionsContainer);
    }
    
    // Actions
    if (config.showActions) {
      const actions = this.createErrorActions(error, toastId);
      if (actions) {
        toast.appendChild(actions);
      }
    }
    
    // Error details (hidden by default)
    if (error.originalError || error.stack) {
      const details = document.createElement('div');
      details.className = 'mimir-error-details';
      details.textContent = error.stack || error.originalError?.stack || 'No additional details available';
      toast.appendChild(details);
    }
    
    return { element: toast, id: toastId };
  }

  /**
   * Create action buttons for error toast
   */
  createErrorActions(error, toastId) {
    const actions = document.createElement('div');
    actions.className = 'mimir-error-actions';
    
    let hasActions = false;
    
    // Retry action for retryable errors
    if (error.operation && this.isRetryableOperation(error.operation)) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'mimir-error-action';
      retryBtn.textContent = 'Retry';
      retryBtn.onclick = () => {
        this.dismissToast(toastId);
        this.retryOperation(error.operation);
      };
      actions.appendChild(retryBtn);
      hasActions = true;
    }
    
    // Rollback action for migration errors
    if (error.canRollback) {
      const rollbackBtn = document.createElement('button');
      rollbackBtn.className = 'mimir-error-action';
      rollbackBtn.textContent = 'Rollback';
      rollbackBtn.onclick = () => {
        this.dismissToast(toastId);
        this.performRollback();
      };
      actions.appendChild(rollbackBtn);
      hasActions = true;
    }
    
    // Show details action
    if (error.originalError || error.stack) {
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'mimir-error-action secondary';
      detailsBtn.textContent = 'Show Details';
      detailsBtn.onclick = () => {
        const details = document.querySelector(`#${toastId} .mimir-error-details`);
        if (details) {
          details.classList.toggle('show');
          detailsBtn.textContent = details.classList.contains('show') ? 'Hide Details' : 'Show Details';
        }
      };
      actions.appendChild(detailsBtn);
      hasActions = true;
    }
    
    return hasActions ? actions : null;
  }

  /**
   * Display toast with animation
   */
  displayToast(toast, config) {
    const container = document.getElementById('mimir-error-container');
    if (!container) {
      console.error('Error container not found');
      return;
    }
    
    // Remove oldest toast if we have too many
    if (this.activeToasts.size >= this.maxToasts) {
      const oldestToastId = this.activeToasts.keys().next().value;
      this.dismissToast(oldestToastId);
    }
    
    // Add to container
    container.appendChild(toast.element);
    
    // Trigger animation
    setTimeout(() => {
      toast.element.classList.add('show');
    }, 10);
    
    // Store reference
    this.activeToasts.set(toast.id, {
      element: toast.element,
      config,
      timestamp: Date.now()
    });
    
    // Auto-dismiss if duration is set
    if (config.duration > 0) {
      setTimeout(() => {
        this.dismissToast(toast.id);
      }, config.duration);
    }
  }

  /**
   * Dismiss toast
   */
  dismissToast(toastId) {
    const toast = this.activeToasts.get(toastId);
    if (!toast) return;
    
    toast.element.classList.remove('show');
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.activeToasts.delete(toastId);
    }, 300);
  }

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    for (const toastId of this.activeToasts.keys()) {
      this.dismissToast(toastId);
    }
  }

  /**
   * Check if operation is retryable
   */
  isRetryableOperation(operation) {
    const retryableOperations = [
      'DATABASE_GET',
      'DATABASE_SET',
      'DATABASE_INITIALIZATION',
      'MIGRATION_STEP'
    ];
    
    return retryableOperations.some(op => operation.includes(op));
  }

  /**
   * Retry operation (placeholder - would be enhanced with actual retry logic)
   */
  retryOperation(operation) {
    console.log('Retrying operation:', operation);
    this.showInfo('Retrying operation...', { duration: 2000 });
    
    // This would be enhanced to actually retry the failed operation
    // For now, just show a message
  }

  /**
   * Perform rollback (placeholder - would integrate with migration system)
   */
  performRollback() {
    console.log('Performing rollback...');
    this.showInfo('Starting rollback process...', { duration: 3000 });
    
    // This would be enhanced to actually perform rollback
    // For now, just show a message
  }

  /**
   * Show migration error with specific recovery options
   */
  showMigrationError(error) {
    const suggestions = error.suggestions || [
      'Try the migration again after closing other browser tabs',
      'Check if you have sufficient storage space',
      'Use the rollback feature to restore your original data'
    ];
    
    return this.showError(error, {
      title: 'Migration Error',
      suggestions,
      showActions: true
    });
  }

  /**
   * Show database error with fallback information
   */
  showDatabaseError(error) {
    const suggestions = error.suggestions || [
      'The system will automatically use backup storage',
      'Try refreshing the page to reinitialize the database',
      'Check browser storage permissions'
    ];
    
    return this.showError(error, {
      title: 'Database Error',
      suggestions,
      showActions: true
    });
  }
}

// Create global instance (only in window context)
if (typeof window !== 'undefined') {
  window.mimirErrorUI = new MimirErrorUI();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MimirErrorUI;
} else if (typeof window !== 'undefined') {
  window.MimirErrorUI = MimirErrorUI;
}