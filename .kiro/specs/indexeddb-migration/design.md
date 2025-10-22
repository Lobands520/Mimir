# Design Document

## Overview

This design document outlines the migration from chrome.storage.local to IndexedDB for the Mimir dashboard plugin, with a focus on creating a visual data management interface. The core goal is to provide users with a database management UI similar to Chrome DevTools, allowing them to view, manage, and export their data in a structured way.

Key deliverables:
1. Migrate existing data to IndexedDB with the 5 Object Stores you specified
2. Create a dedicated data management interface for visualizing database contents
3. Implement data export functionality
4. Maintain existing dashboard functionality with improved performance

## Architecture

### Current Data Storage Patterns

The current system uses chrome.storage.local with these key patterns:
- `mimir-config`: User configuration and settings
- `classified-{date}`: Daily AI analysis cache (e.g., `classified-2024-08-04`)
- `diary-{date}`: Daily diary entries (e.g., `diary-2024-08-04`)
- `annual-report-{year}`: Annual reports (e.g., `annual-report-2024`)

### New Architecture: IndexedDB + Data Management UI

```
MimirDB (IndexedDB Database)
├── history (Object Store) - Raw browsing history
├── classified_cache (Object Store) - AI analysis results
├── diaries (Object Store) - Generated diary entries
├── annual_reports (Object Store) - Annual reports
└── settings (Object Store) - User configuration

Data Management Interface
├── Database Viewer - Table-like interface for each Object Store
├── Export Manager - Export data to JSON/CSV formats
├── Migration Tool - One-click migration from chrome.storage
└── Data Statistics - Visual overview of stored data
```

### Database Schema Design

#### Database Configuration
- **Database Name**: `MimirDB`
- **Version**: 1 (initial version)
- **Library**: `idb` (lightweight IndexedDB wrapper)

#### Object Stores Schema

##### 1. history Object Store
```javascript
{
  keyPath: 'id',
  autoIncrement: true,
  indexes: {
    'timestamp': { keyPath: 'timestamp', unique: false },
    'date': { keyPath: 'date', unique: false },
    'domain': { keyPath: 'domain', unique: false }
  }
}
```

**Record Structure:**
```javascript
{
  id: number,           // Auto-incrementing primary key
  timestamp: number,    // Unix timestamp
  date: string,         // YYYY-MM-DD format for easy querying
  url: string,          // Full URL
  title: string,        // Page title
  domain: string,       // Extracted domain
  visitCount: number,   // Number of visits
  lastVisitTime: number // Last visit timestamp
}
```

##### 2. classified_cache Object Store
```javascript
{
  keyPath: 'date',
  indexes: {
    'createdAt': { keyPath: 'createdAt', unique: false }
  }
}
```

**Record Structure:**
```javascript
{
  date: string,         // YYYY-MM-DD (primary key)
  data: object,         // Complete analysis result
  createdAt: number,    // Creation timestamp
  version: string       // Analysis version for future compatibility
}
```

##### 3. diaries Object Store
```javascript
{
  keyPath: 'date',
  indexes: {
    'createdAt': { keyPath: 'createdAt', unique: false },
    'updatedAt': { keyPath: 'updatedAt', unique: false }
  }
}
```

**Record Structure:**
```javascript
{
  date: string,         // YYYY-MM-DD (primary key)
  content: string,      // Markdown content
  title: string,        // Optional title
  createdAt: number,    // Creation timestamp
  updatedAt: number,    // Last update timestamp
  wordCount: number,    // Content word count
  tags: string[]        // Optional tags for categorization
}
```

##### 4. annual_reports Object Store
```javascript
{
  keyPath: 'year',
  indexes: {
    'generatedAt': { keyPath: 'generatedAt', unique: false }
  }
}
```

**Record Structure:**
```javascript
{
  year: number,         // YYYY (primary key)
  reportData: object,   // Complete report data
  generatedAt: number,  // Generation timestamp
  version: string,      // Report version
  summary: object       // Quick summary for listing
}
```

##### 5. settings Object Store
```javascript
{
  keyPath: 'key'
}
```

**Record Structure:**
```javascript
{
  key: string,          // Setting key (primary key)
  value: any,           // Setting value (any type)
  updatedAt: number,    // Last update timestamp
  category: string      // Setting category for organization
}
```

## Components and Interfaces

### 1. Core Database Layer

#### MimirDB Class
```javascript
class MimirDB {
  async initialize()           // Setup IndexedDB with idb library
  async migrate()             // One-time migration from chrome.storage
  async getStore(storeName)   // Get specific Object Store
  async exportData()          // Export all data to JSON
}
```

#### Data Access Methods
```javascript
// Simplified API matching current usage patterns
async getClassifiedData(date)     // Replace chrome.storage.local.get(`classified-${date}`)
async saveClassifiedData(date, data)  // Replace chrome.storage.local.set()
async getDiary(date)              // Replace chrome.storage.local.get(`diary-${date}`)
async saveDiary(date, content)    // Replace chrome.storage.local.set()
async getSettings()               // Replace chrome.storage.local.get('mimir-config')
async saveSettings(config)        // Replace chrome.storage.local.set()
```

### 2. Data Management Interface

#### Database Viewer Component
- **Table View**: Display each Object Store as a sortable, filterable table
- **Record Details**: Click to view/edit individual records
- **Search**: Full-text search across all Object Stores
- **Pagination**: Handle large datasets efficiently

#### Export Manager Component
- **Format Selection**: JSON, CSV export options
- **Date Range Filter**: Export specific time periods
- **Object Store Selection**: Export specific tables
- **Download Handler**: Generate and download export files

#### Migration Dashboard Component
- **Migration Status**: Show current migration state
- **Progress Indicator**: Real-time migration progress
- **Data Preview**: Before/after comparison
- **Rollback Option**: Revert to chrome.storage if needed

## User Interface Design

### Data Management Page (`data-manager.html`)

#### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│ Mimir Data Manager                                      │
├─────────────────────────────────────────────────────────┤
│ [Export Data] [Migration Status] [Settings]            │
├─────────────────────────────────────────────────────────┤
│ Object Store Tabs:                                     │
│ [History] [Classified Cache] [Diaries] [Reports] [Settings] │
├─────────────────────────────────────────────────────────┤
│ Search: [________________] [Filter ▼] [Sort ▼]         │
├─────────────────────────────────────────────────────────┤
│ Data Table:                                            │
│ ┌─────────┬─────────────┬─────────────┬─────────────┐   │
│ │ Date    │ Title       │ Domain      │ Actions     │   │
│ ├─────────┼─────────────┼─────────────┼─────────────┤   │
│ │ 2024-08 │ GitHub...   │ github.com  │ [View][Del] │   │
│ │ 2024-08 │ Stack...    │ stackoverflow │ [View][Del] │   │
│ └─────────┴─────────────┴─────────────┴─────────────┘   │
├─────────────────────────────────────────────────────────┤
│ Pagination: [<] 1 2 3 ... 10 [>]                      │
└─────────────────────────────────────────────────────────┘
```

#### Export Dialog
```
┌─────────────────────────────────────┐
│ Export Data                         │
├─────────────────────────────────────┤
│ Format: ○ JSON ○ CSV               │
│ Date Range: [2024-01-01] to [2024-12-31] │
│ Object Stores:                      │
│ ☑ History ☑ Diaries ☑ Reports     │
│ ☐ Classified Cache ☐ Settings      │
├─────────────────────────────────────┤
│ [Cancel] [Export]                   │
└─────────────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Database Foundation
1. **Install idb library** and create basic MimirDB class
2. **Create Object Stores** with the exact schema you specified
3. **Implement basic CRUD operations** for each store
4. **Add data validation** and error handling

### Phase 2: Migration System
1. **Build migration tool** to transfer chrome.storage data
2. **Create backup mechanism** before migration
3. **Implement data transformation** logic
4. **Add migration progress tracking**

### Phase 3: Data Management Interface
1. **Create data-manager.html** page with table views
2. **Implement Object Store tabs** and data display
3. **Add search and filtering** capabilities
4. **Build export functionality** (JSON/CSV)

### Phase 4: Integration
1. **Update existing code** to use IndexedDB instead of chrome.storage
2. **Add navigation** to data manager from main dashboard
3. **Implement fallback mechanisms** for compatibility
4. **Add performance monitoring**

## File Structure

### New Files to Create
```
├── data-manager.html          # Data management interface
├── data-manager.css           # Styling for data manager
├── data-manager.js            # Data manager functionality
├── lib/
│   ├── idb.js                # idb library (from CDN or local)
│   ├── mimir-db.js           # Core database class
│   └── migration.js          # Migration utilities
```

### Modified Files
```
├── manifest.json             # Add data manager page permissions
├── dashboard.js              # Update to use IndexedDB
├── background.js             # Update storage operations
├── settings.js               # Update settings storage
└── popup.js                  # Update popup data access
```

## Success Criteria

### Functional Requirements Met
- ✅ All existing data migrated to IndexedDB without loss
- ✅ Data management interface provides table-like view of all Object Stores
- ✅ Export functionality works for JSON and CSV formats
- ✅ Existing dashboard functionality preserved
- ✅ Performance improved for date range queries

### User Experience Goals
- ✅ One-click migration process
- ✅ Visual feedback during migration
- ✅ Intuitive data management interface
- ✅ Fast search and filtering
- ✅ Easy data export process

### Technical Achievements
- ✅ IndexedDB properly configured with 5 Object Stores
- ✅ Efficient indexing for common query patterns
- ✅ Backward compatibility maintained
- ✅ Error handling and recovery mechanisms
- ✅ Clean separation between database layer and UI