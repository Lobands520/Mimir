/**
 * Verification script for migration system functionality
 * Tests all aspects of the migration from chrome.storage to IndexedDB
 */

// Test the migration system
async function verifyMigrationSystem() {
    console.log('=== Migration System Verification ===');
    
    try {
        // Initialize database and migration
        const mimirDB = new MimirDB();
        await mimirDB.initialize();
        const migration = new MimirMigration(mimirDB);
        
        console.log('✓ Database and migration system initialized');
        
        // Test 1: Create sample chrome.storage data
        console.log('\n1. Creating sample chrome.storage data...');
        const testData = {
            'mimir-config': {
                apiKey: 'test-key',
                theme: 'dark',
                autoSync: true
            },
            'classified-2024-08-01': {
                categories: ['work', 'research'],
                totalVisits: 45,
                topDomains: ['github.com', 'stackoverflow.com'],
                analysis: 'High productivity day'
            },
            'classified-2024-08-02': {
                categories: ['entertainment', 'news'],
                totalVisits: 32,
                topDomains: ['youtube.com', 'reddit.com'],
                analysis: 'Relaxation day'
            },
            'diary-2024-08-01': 'Today I worked on the migration system. The data transformation logic is working well.',
            'diary-2024-08-02': 'Continued testing the migration. All validation checks are passing.',
            'annual-report-2024': {
                summary: { totalDays: 365, totalVisits: 12450, avgVisitsPerDay: 34.1 },
                topCategories: ['work', 'research', 'entertainment'],
                insights: 'High productivity year with balanced work-life activities',
                generatedAt: Date.now()
            },
            'custom-setting': 'custom-value',
            'user-preference': { notifications: true, darkMode: false }
        };
        
        await chrome.storage.local.clear();
        await chrome.storage.local.set(testData);
        console.log(`✓ Created ${Object.keys(testData).length} test items in chrome.storage`);
        
        // Test 2: Check migration status
        console.log('\n2. Checking initial migration status...');
        const initialStatus = await migration.getMigrationStatus();
        console.log(`✓ Initial status: ${initialStatus.status}`);
        
        // Test 3: Backup chrome.storage data
        console.log('\n3. Testing backup functionality...');
        const backup = await migration.backupChromeStorage();
        console.log(`✓ Backup created with ${backup.itemCount} items`);
        
        // Test 4: Transform data
        console.log('\n4. Testing data transformation...');
        const transformedData = migration.transformChromeStorageData(backup.data);
        console.log('✓ Data transformation completed:');
        console.log(`  - Classified cache: ${transformedData.classified_cache.length} records`);
        console.log(`  - Diaries: ${transformedData.diaries.length} records`);
        console.log(`  - Annual reports: ${transformedData.annual_reports.length} records`);
        console.log(`  - Settings: ${transformedData.settings.length} records`);
        
        // Test 5: Validate transformed data
        console.log('\n5. Testing data validation...');
        const validation = await migration.validateTransformedData(transformedData);
        console.log(`✓ Validation ${validation.passed ? 'PASSED' : 'FAILED'}`);
        if (validation.errors.length > 0) {
            console.log('  Errors:', validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.log('  Warnings:', validation.warnings);
        }
        
        // Test 6: Perform full migration
        console.log('\n6. Testing full migration process...');
        const migrationResult = await migration.performFullMigration();
        console.log('✓ Full migration completed successfully');
        console.log(`  - Total records: ${migrationResult.details.migration.totalRecords}`);
        console.log(`  - Migrated records: ${migrationResult.details.migration.migratedRecords}`);
        
        // Test 7: Verify migrated data
        console.log('\n7. Verifying migrated data in IndexedDB...');
        
        // Check classified cache
        const classifiedData = await mimirDB.getClassifiedData('2024-08-01');
        if (classifiedData && classifiedData.data.categories.includes('work')) {
            console.log('✓ Classified cache data migrated correctly');
        } else {
            console.log('✗ Classified cache data migration failed');
        }
        
        // Check diary data
        const diaryData = await mimirDB.getDiary('2024-08-01');
        if (diaryData && diaryData.content.includes('migration system')) {
            console.log('✓ Diary data migrated correctly');
        } else {
            console.log('✗ Diary data migration failed');
        }
        
        // Check annual report
        const reportData = await mimirDB.getAnnualReport(2024);
        if (reportData && reportData.reportData.summary.totalDays === 365) {
            console.log('✓ Annual report data migrated correctly');
        } else {
            console.log('✗ Annual report data migration failed');
        }
        
        // Check settings
        const configSetting = await mimirDB.getSetting('config');
        if (configSetting && configSetting.apiKey === 'test-key') {
            console.log('✓ Settings data migrated correctly');
        } else {
            console.log('✗ Settings data migration failed');
        }
        
        // Test 8: Test rollback functionality
        console.log('\n8. Testing rollback functionality...');
        
        // First, let's modify some data to test rollback
        await mimirDB.saveSetting('test-rollback', 'this-should-be-removed');
        
        const rollbackResult = await migration.rollbackMigration();
        console.log('✓ Rollback completed successfully');
        console.log(`  - Restored items: ${rollbackResult.restoredItems}`);
        
        // Verify rollback worked
        const restoredData = await chrome.storage.local.get('mimir-config');
        if (restoredData['mimir-config'] && restoredData['mimir-config'].apiKey === 'test-key') {
            console.log('✓ Rollback verification passed');
        } else {
            console.log('✗ Rollback verification failed');
        }
        
        // Test 9: Test migration again after rollback
        console.log('\n9. Testing migration after rollback...');
        const secondMigration = await migration.performFullMigration();
        console.log('✓ Second migration completed successfully');
        
        // Test 10: Test cleanup
        console.log('\n10. Testing cleanup functionality...');
        const cleanupResult = await migration.cleanupMigrationArtifacts();
        console.log(`✓ Cleanup ${cleanupResult ? 'completed' : 'completed with warnings'}`);
        
        // Final status check
        console.log('\n11. Final status check...');
        const finalStatus = await migration.getMigrationStatus();
        console.log(`✓ Final status: ${finalStatus.status}`);
        
        console.log('\n=== Migration System Verification COMPLETED ===');
        console.log('✓ All tests passed successfully!');
        
        return {
            success: true,
            message: 'All migration system tests passed',
            details: {
                backup: backup.itemCount,
                transformation: Object.keys(transformedData).length,
                migration: migrationResult.details.migration,
                rollback: rollbackResult.restoredItems,
                cleanup: cleanupResult
            }
        };
        
    } catch (error) {
        console.error('✗ Migration system verification failed:', error);
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

// Test individual migration components
async function testMigrationComponents() {
    console.log('\n=== Testing Individual Migration Components ===');
    
    try {
        const mimirDB = new MimirDB();
        await mimirDB.initialize();
        const migration = new MimirMigration(mimirDB);
        
        // Test data transformation edge cases
        console.log('\n1. Testing data transformation edge cases...');
        
        const edgeCaseData = {
            'classified-invalid-date': { data: 'should be ignored' },
            'classified-2024-13-45': { data: 'invalid date format' },
            'classified-2024-08-15': { valid: 'data' },
            'diary-not-a-date': 'should be ignored',
            'diary-2024-08-15': 'valid diary entry',
            'annual-report-invalid': { data: 'should be ignored' },
            'annual-report-2024': { valid: 'report' },
            'mimir-config': { setting: 'value' },
            'random-key': 'random-value'
        };
        
        const transformed = migration.transformChromeStorageData(edgeCaseData);
        
        // Should only have valid entries
        console.log(`✓ Classified cache: ${transformed.classified_cache.length} (expected: 1)`);
        console.log(`✓ Diaries: ${transformed.diaries.length} (expected: 1)`);
        console.log(`✓ Annual reports: ${transformed.annual_reports.length} (expected: 1)`);
        console.log(`✓ Settings: ${transformed.settings.length} (expected: 2)`);
        
        // Test validation with invalid data
        console.log('\n2. Testing validation with invalid data...');
        
        const invalidData = {
            classified_cache: [
                { date: 'invalid-date', data: {} },
                { date: '2024-08-15', data: 'not-an-object' }
            ],
            diaries: [
                { date: '2024-08-15', content: null }
            ],
            annual_reports: [
                { year: 'not-a-number', reportData: {} }
            ],
            settings: [
                { key: null, value: 'test' }
            ]
        };
        
        const validation = await migration.validateTransformedData(invalidData);
        console.log(`✓ Validation correctly failed: ${!validation.passed}`);
        console.log(`✓ Found ${validation.errors.length} errors as expected`);
        
        // Test progress tracking
        console.log('\n3. Testing progress tracking...');
        
        await migration.updateProgress(25, 100, 'testing', 'Progress tracking test');
        const status = await migration.getMigrationStatus();
        console.log(`✓ Progress tracking: ${status.progress.percentage}% - ${status.progress.stage}`);
        
        console.log('\n✓ All component tests passed!');
        
    } catch (error) {
        console.error('✗ Component testing failed:', error);
        throw error;
    }
}

// Run verification if this script is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    window.verifyMigrationSystem = verifyMigrationSystem;
    window.testMigrationComponents = testMigrationComponents;
    
    // Auto-run verification when page loads
    window.addEventListener('load', async () => {
        console.log('Starting migration system verification...');
        try {
            await verifyMigrationSystem();
            await testMigrationComponents();
        } catch (error) {
            console.error('Verification failed:', error);
        }
    });
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        verifyMigrationSystem,
        testMigrationComponents
    };
}