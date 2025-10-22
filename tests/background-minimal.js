// Minimal background script for testing
console.log('Background script starting...');

try {
    // Test basic imports
    console.log('Testing idb import...');
    importScripts('lib/idb.js');
    console.log('✓ idb imported successfully');
    
    console.log('Testing error handler import...');
    importScripts('lib/error-handler-sw.js');
    console.log('✓ error handler imported successfully');
    
    console.log('Testing database imports...');
    importScripts('lib/mimir-db.js', 'lib/db-wrapper.js', 'lib/migration.js');
    console.log('✓ database imports successful');
    
} catch (error) {
    console.error('Import error:', error);
}

// Simple message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    
    if (request.action === 'test') {
        sendResponse({ success: true, message: 'Service worker is working' });
    } else {
        sendResponse({ error: 'Unknown action' });
    }
    
    return true;
});

console.log('Background script initialized successfully');