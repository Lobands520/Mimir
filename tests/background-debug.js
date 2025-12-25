// Debug version of background script
console.log('=== Background Debug Script Starting ===');

// Test each import individually
try {
    console.log('1. Importing idb...');
    importScripts('../lib/idb.js');
    console.log('✓ idb imported');
    
    console.log('2. Testing idb availability...');
    if (typeof idb !== 'undefined') {
        console.log('✓ idb is available');
    } else {
        console.error('✗ idb is not available');
    }
    
    console.log('3. Importing error handler...');
    importScripts('../lib/error-handler-sw.js');
    console.log('✓ error handler imported');
    
    console.log('4. Testing error handler...');
    if (typeof self.mimirErrorHandler !== 'undefined') {
        console.log('✓ error handler is available');
    } else {
        console.error('✗ error handler is not available');
    }
    
    console.log('5. Importing MimirDB...');
    importScripts('../lib/mimir-db.js');
    console.log('✓ MimirDB imported');
    
    console.log('6. Testing MimirDB...');
    if (typeof MimirDB !== 'undefined') {
        console.log('✓ MimirDB class is available');
        
        // Test creating instance
        const testDB = new MimirDB();
        console.log('✓ MimirDB instance created');
    } else {
        console.error('✗ MimirDB class is not available');
    }
    
    console.log('7. Importing DatabaseWrapper...');
    importScripts('../lib/db-wrapper.js');
    console.log('✓ DatabaseWrapper imported');
    
    console.log('8. Testing DatabaseWrapper...');
    if (typeof DatabaseWrapper !== 'undefined') {
        console.log('✓ DatabaseWrapper class is available');
        
        // Test creating instance
        const testWrapper = new DatabaseWrapper();
        console.log('✓ DatabaseWrapper instance created');
    } else {
        console.error('✗ DatabaseWrapper class is not available');
    }
    
    console.log('9. Importing Migration...');
    importScripts('../lib/migration.js');
    console.log('✓ Migration imported');
    
    console.log('10. All imports successful!');
    
} catch (error) {
    console.error('Import failed at step:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
}

// Simple service
class DebugBackgroundService {
    constructor() {
        console.log('DebugBackgroundService constructor called');
        this.init();
    }
    
    init() {
        console.log('DebugBackgroundService init called');
        
        // Set up message listener
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Message received:', request);
            
            try {
                switch (request.action) {
                    case 'test':
                        sendResponse({ success: true, message: 'Debug service working' });
                        break;
                    case 'testDB':
                        this.testDatabase().then(sendResponse);
                        break;
                    default:
                        sendResponse({ error: 'Unknown action: ' + request.action });
                }
            } catch (error) {
                console.error('Message handler error:', error);
                sendResponse({ error: error.message });
            }
            
            return true;
        });
        
        console.log('DebugBackgroundService initialized');
    }
    
    async testDatabase() {
        try {
            console.log('Testing database...');
            
            if (!self.dbWrapper) {
                console.log('Creating database wrapper...');
                self.dbWrapper = new DatabaseWrapper();
            }
            
            console.log('Initializing database wrapper...');
            await self.dbWrapper.initialize();
            
            console.log('Database test successful');
            return { success: true, message: 'Database test passed' };
            
        } catch (error) {
            console.error('Database test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Start the debug service
console.log('Starting DebugBackgroundService...');
new DebugBackgroundService();

console.log('=== Background Debug Script Complete ===');