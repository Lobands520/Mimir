// Data Manager JavaScript - Complete Data Visualization and Table Functionality
class DataManagerUI {
    constructor() {
        this.currentStore = 'history';
        this.currentPage = 1;
        this.pageSize = 50;
        this.searchTerm = '';
        this.filterValue = '';
        this.sortValue = 'date-desc';
        this.currentData = [];
        this.filteredData = [];
        this.currentRecord = null;
        
        // Initialize database connection
        this.db = new MimirDB();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTabNavigation();
        this.setupModals();
        this.loadInitialData();
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.debounceSearch();
        });

        // Filter select
        const filterSelect = document.getElementById('filterSelect');
        filterSelect.addEventListener('change', (e) => {
            this.filterValue = e.target.value;
            this.loadData();
        });

        // Sort select
        const sortSelect = document.getElementById('sortSelect');
        sortSelect.addEventListener('change', (e) => {
            this.sortValue = e.target.value;
            this.loadData();
        });

        // Pagination buttons
        document.getElementById('prevBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadData();
            }
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            this.currentPage++;
            this.loadData();
        });

        // Header action buttons
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.showExportModal();
        });

        document.getElementById('migrationBtn').addEventListener('click', () => {
            this.showMigrationStatus();
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all tabs
                tabButtons.forEach(tab => tab.classList.remove('active'));
                
                // Add active class to clicked tab
                e.target.classList.add('active');
                
                // Update current store and load data
                this.currentStore = e.target.dataset.store;
                this.currentPage = 1;
                this.loadData();
            });
        });
    }

    setupModals() {
        // Export modal
        const exportModal = document.getElementById('exportModal');
        const closeExportModal = document.getElementById('closeExportModal');
        const cancelExport = document.getElementById('cancelExport');
        const confirmExport = document.getElementById('confirmExport');

        closeExportModal.addEventListener('click', () => {
            exportModal.classList.remove('show');
        });

        cancelExport.addEventListener('click', () => {
            exportModal.classList.remove('show');
        });

        confirmExport.addEventListener('click', () => {
            this.performExport();
        });

        // Record detail modal
        const recordModal = document.getElementById('recordModal');
        const closeRecordModal = document.getElementById('closeRecordModal');
        const closeRecord = document.getElementById('closeRecord');
        const deleteRecord = document.getElementById('deleteRecord');

        closeRecordModal.addEventListener('click', () => {
            recordModal.classList.remove('show');
        });

        closeRecord.addEventListener('click', () => {
            recordModal.classList.remove('show');
        });

        deleteRecord.addEventListener('click', () => {
            this.deleteCurrentRecord();
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === exportModal) {
                exportModal.classList.remove('show');
            }
            if (e.target === recordModal) {
                recordModal.classList.remove('show');
            }
        });
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.currentPage = 1;
            this.loadData();
        }, 300);
    }

    async loadInitialData() {
        this.showLoading(true);
        try {
            // Initialize database connection
            await this.db.initialize();
            await this.loadData();
        } catch (error) {
            console.error('Failed to initialize database:', error);
            this.showError('Failed to initialize database connection');
            this.showLoading(false);
        }
    }

    async loadData() {
        this.showLoading(true);
        
        try {
            // Load data from the current Object Store
            await this.loadStoreData();
            
            // Apply search and filtering
            this.applyFilters();
            
            // Apply sorting
            this.applySorting();
            
            // Render table structure and data
            this.renderTableStructure();
            this.renderTableData();
            
            // Update UI elements
            this.updateRecordCount(this.filteredData.length);
            this.updatePagination(this.filteredData.length);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to load ${this.currentStore} data: ${error.message}`);
            this.renderEmptyState();
        } finally {
            this.showLoading(false);
        }
    }

    async loadStoreData() {
        switch (this.currentStore) {
            case 'history':
                this.currentData = await this.db.getAllHistory();
                break;
            case 'classified_cache':
                this.currentData = await this.db.getAllClassifiedData();
                break;
            case 'diaries':
                this.currentData = await this.db.getAllDiaries();
                break;
            case 'annual_reports':
                this.currentData = await this.db.getAllAnnualReports();
                break;
            case 'settings':
                this.currentData = await this.db.getAllSettings();
                break;
            default:
                this.currentData = [];
        }
    }

    renderTableStructure() {
        const tableHeader = document.getElementById('tableHeader');
        const headers = this.getHeadersForStore(this.currentStore);
        
        tableHeader.innerHTML = `
            <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
                <th>Actions</th>
            </tr>
        `;
    }

    getHeadersForStore(store) {
        const headerMap = {
            history: ['ID', '日期', '标题', '域名', 'URL', '访问次数'],
            classified_cache: ['日期', '创建时间', '版本', '数据大小'],
            diaries: ['日期', '标题', '字数', '创建时间', '更新时间'],
            annual_reports: ['年份', '生成时间', '版本', '摘要'],
            settings: ['键', '类别', '更新时间', '值']
        };
        
        return headerMap[store] || ['键', '值'];
    }

    applyFilters() {
        let filtered = [...this.currentData];
        
        // Apply search filter
        if (this.searchTerm) {
            filtered = this.searchInData(filtered, this.searchTerm);
        }
        
        // Apply date/time filter
        if (this.filterValue) {
            filtered = this.applyDateFilter(filtered, this.filterValue);
        }
        
        this.filteredData = filtered;
    }

    searchInData(data, searchTerm) {
        const term = searchTerm.toLowerCase();
        
        return data.filter(record => {
            // Convert record to searchable string
            const searchableFields = this.getSearchableFields(record);
            return searchableFields.some(field => 
                String(field).toLowerCase().includes(term)
            );
        });
    }

    getSearchableFields(record) {
        switch (this.currentStore) {
            case 'history':
                return [record.title, record.url, record.domain, record.date];
            case 'classified_cache':
                return [record.date, JSON.stringify(record.data)];
            case 'diaries':
                return [record.date, record.title, record.content, record.tags?.join(' ')];
            case 'annual_reports':
                return [record.year, JSON.stringify(record.reportData), JSON.stringify(record.summary)];
            case 'settings':
                return [record.key, record.category, JSON.stringify(record.value)];
            default:
                return Object.values(record);
        }
    }

    applyDateFilter(data, filterValue) {
        const now = new Date();
        let startDate, endDate;
        
        switch (filterValue) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear() + 1, 0, 1);
                break;
            default:
                return data;
        }
        
        return data.filter(record => {
            const recordDate = this.getRecordDate(record);
            return recordDate >= startDate && recordDate < endDate;
        });
    }

    getRecordDate(record) {
        switch (this.currentStore) {
            case 'history':
                return new Date(record.timestamp);
            case 'classified_cache':
                return new Date(record.date);
            case 'diaries':
                return new Date(record.date);
            case 'annual_reports':
                return new Date(record.year, 0, 1);
            case 'settings':
                return new Date(record.updatedAt);
            default:
                return new Date();
        }
    }

    applySorting() {
        const [field, direction] = this.sortValue.split('-');
        
        this.filteredData.sort((a, b) => {
            let aValue, bValue;
            
            switch (field) {
                case 'date':
                    aValue = this.getRecordDate(a);
                    bValue = this.getRecordDate(b);
                    break;
                case 'title':
                    aValue = this.getRecordTitle(a);
                    bValue = this.getRecordTitle(b);
                    break;
                default:
                    aValue = a[field] || '';
                    bValue = b[field] || '';
            }
            
            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    getRecordTitle(record) {
        switch (this.currentStore) {
            case 'history':
                return record.title || '';
            case 'classified_cache':
                return record.date || '';
            case 'diaries':
                return record.title || record.date || '';
            case 'annual_reports':
                return record.year?.toString() || '';
            case 'settings':
                return record.key || '';
            default:
                return '';
        }
    }

    renderTableData() {
        const tableBody = document.getElementById('tableBody');
        const dataTable = document.getElementById('dataTable');
        const emptyState = document.getElementById('emptyState');
        
        if (this.filteredData.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        // Render table rows
        tableBody.innerHTML = pageData.map(record => this.renderTableRow(record)).join('');
        
        // Attach event handlers for the new rows
        this.attachRowEventHandlers();
        
        // Show table, hide empty state
        dataTable.style.display = 'table';
        emptyState.style.display = 'none';
        
        // Add click handlers for view/delete buttons
        this.attachRowEventHandlers();
    }

    renderTableRow(record) {
        const cells = this.getTableCells(record);
        const recordId = this.getRecordId(record);
        
        return `
            <tr data-record-id="${recordId}">
                ${cells.map(cell => `<td>${this.formatCellValue(cell)}</td>`).join('')}
                <td class="actions">
                    <button class="btn-small btn-view" data-action="view" data-record-id="${recordId}">👁️ 查看</button>
                    <button class="btn-small btn-delete" data-action="delete" data-record-id="${recordId}">🗑️ 删除</button>
                </td>
            </tr>
        `;
    }

    getTableCells(record) {
        switch (this.currentStore) {
            case 'history':
                return [
                    record.id,
                    record.date,
                    record.title,
                    record.domain,
                    record.url,
                    record.visitCount
                ];
            case 'classified_cache':
                return [
                    record.date,
                    new Date(record.createdAt).toLocaleString(),
                    record.version,
                    this.getDataSize(record.data)
                ];
            case 'diaries':
                return [
                    record.date,
                    record.title || '(No title)',
                    record.wordCount,
                    new Date(record.createdAt).toLocaleString(),
                    new Date(record.updatedAt).toLocaleString()
                ];
            case 'annual_reports':
                return [
                    record.year,
                    new Date(record.generatedAt).toLocaleString(),
                    record.version,
                    this.getSummaryPreview(record.summary)
                ];
            case 'settings':
                return [
                    record.key,
                    record.category,
                    new Date(record.updatedAt).toLocaleString(),
                    this.formatSettingValue(record.value)
                ];
            default:
                return Object.values(record);
        }
    }

    getRecordId(record) {
        switch (this.currentStore) {
            case 'history':
                return record.id;
            case 'classified_cache':
                return record.date;
            case 'diaries':
                return record.date;
            case 'annual_reports':
                return record.year;
            case 'settings':
                return record.key;
            default:
                return JSON.stringify(record);
        }
    }

    formatCellValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.length > 50) {
            return value.substring(0, 50) + '...';
        }
        return String(value);
    }

    getDataSize(data) {
        return `${JSON.stringify(data).length} chars`;
    }

    getSummaryPreview(summary) {
        if (!summary || typeof summary !== 'object') return 'No summary';
        const keys = Object.keys(summary);
        return keys.length > 0 ? `${keys.length} items` : 'Empty';
    }

    formatSettingValue(value) {
        if (typeof value === 'object') {
            return JSON.stringify(value).substring(0, 30) + '...';
        }
        return String(value).substring(0, 30);
    }

    renderEmptyState() {
        const tableBody = document.getElementById('tableBody');
        const dataTable = document.getElementById('dataTable');
        const emptyState = document.getElementById('emptyState');
        
        tableBody.innerHTML = '';
        dataTable.style.display = 'none';
        emptyState.style.display = 'block';
    }

    attachRowEventHandlers() {
        // Use event delegation to handle button clicks
        const tableBody = document.getElementById('tableBody');
        
        // Remove existing event listener if any
        tableBody.removeEventListener('click', this.handleTableClick);
        
        // Add new event listener
        this.handleTableClick = (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const recordId = button.getAttribute('data-record-id');
            
            if (action === 'view') {
                this.viewRecord(recordId);
            } else if (action === 'delete') {
                this.confirmDeleteRecord(recordId);
            }
        };
        
        tableBody.addEventListener('click', this.handleTableClick);
    }

    showLoading(show) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const dataTable = document.getElementById('dataTable');
        const emptyState = document.getElementById('emptyState');
        
        if (show) {
            loadingIndicator.style.display = 'flex';
            dataTable.style.display = 'none';
            emptyState.style.display = 'none';
        } else {
            loadingIndicator.style.display = 'none';
        }
    }

    updateRecordCount(count) {
        const recordCount = document.getElementById('recordCount');
        recordCount.textContent = `${count} 条记录`;
    }

    updatePagination(totalRecords) {
        const totalPages = Math.ceil(totalRecords / this.pageSize);
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        pageInfo.textContent = `第 ${this.currentPage} 页，共 ${Math.max(1, totalPages)} 页`;
        prevBtn.disabled = this.currentPage <= 1;
        nextBtn.disabled = this.currentPage >= totalPages || totalPages === 0;
    }

    showExportModal() {
        const exportModal = document.getElementById('exportModal');
        
        // Set default date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
        document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
        
        exportModal.classList.add('show');
    }

    async performExport() {
        const format = document.querySelector('input[name="format"]:checked').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const selectedStores = Array.from(document.querySelectorAll('input[name="stores"]:checked'))
            .map(cb => cb.value);
        
        if (selectedStores.length === 0) {
            this.showError('Please select at least one Object Store to export');
            return;
        }
        
        try {
            // Show loading state
            const confirmBtn = document.getElementById('confirmExport');
            const originalText = confirmBtn.textContent;
            confirmBtn.textContent = 'Exporting...';
            confirmBtn.disabled = true;
            
            // Collect data from selected stores
            const exportData = await this.collectExportData(selectedStores, startDate, endDate);
            
            // Generate export file based on format
            let fileContent, fileName, mimeType;
            
            if (format === 'json') {
                const result = this.generateJSONExport(exportData, startDate, endDate);
                fileContent = result.content;
                fileName = result.fileName;
                mimeType = 'application/json';
            } else if (format === 'csv') {
                const result = this.generateCSVExport(exportData, startDate, endDate);
                fileContent = result.content;
                fileName = result.fileName;
                mimeType = 'text/csv';
            }
            
            // Download the file
            this.downloadFile(fileContent, fileName, mimeType);
            
            // Close modal and show success
            document.getElementById('exportModal').classList.remove('show');
            this.showSuccess(`Data exported successfully as ${fileName}`);
            
        } catch (error) {
            console.error('Export failed:', error);
            this.showError(`Export failed: ${error.message}`);
        } finally {
            // Reset button state
            const confirmBtn = document.getElementById('confirmExport');
            confirmBtn.textContent = 'Export';
            confirmBtn.disabled = false;
        }
    }

    async collectExportData(selectedStores, startDate, endDate) {
        const exportData = {};
        
        for (const storeName of selectedStores) {
            try {
                let storeData = [];
                
                switch (storeName) {
                    case 'history':
                        if (startDate && endDate) {
                            // Convert dates to timestamp range for history
                            const startTimestamp = new Date(startDate).getTime();
                            const endTimestamp = new Date(endDate + 'T23:59:59').getTime();
                            storeData = await this.db.getHistoryByTimestampRange(startTimestamp, endTimestamp);
                        } else {
                            storeData = await this.db.getAllHistory();
                        }
                        break;
                        
                    case 'classified_cache':
                        if (startDate && endDate) {
                            storeData = await this.db.getClassifiedDataByDateRange(startDate, endDate);
                        } else {
                            storeData = await this.db.getAllClassifiedData();
                        }
                        break;
                        
                    case 'diaries':
                        if (startDate && endDate) {
                            storeData = await this.db.getDiariesByDateRange(startDate, endDate);
                        } else {
                            storeData = await this.db.getAllDiaries();
                        }
                        break;
                        
                    case 'annual_reports':
                        if (startDate && endDate) {
                            // Extract years from date range
                            const startYear = new Date(startDate).getFullYear();
                            const endYear = new Date(endDate).getFullYear();
                            storeData = await this.db.getAnnualReportsByYearRange(startYear, endYear);
                        } else {
                            storeData = await this.db.getAllAnnualReports();
                        }
                        break;
                        
                    case 'settings':
                        // Settings don't have date filtering
                        storeData = await this.db.getAllSettings();
                        break;
                        
                    default:
                        console.warn(`Unknown store: ${storeName}`);
                        continue;
                }
                
                exportData[storeName] = storeData;
                console.log(`Collected ${storeData.length} records from ${storeName}`);
                
            } catch (error) {
                console.error(`Failed to collect data from ${storeName}:`, error);
                exportData[storeName] = [];
            }
        }
        
        return exportData;
    }

    generateJSONExport(exportData, startDate, endDate) {
        const exportObject = {
            metadata: {
                exportDate: new Date().toISOString(),
                dateRange: {
                    start: startDate || null,
                    end: endDate || null
                },
                stores: Object.keys(exportData),
                totalRecords: Object.values(exportData).reduce((sum, records) => sum + records.length, 0)
            },
            data: exportData
        };
        
        const content = JSON.stringify(exportObject, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `mimir-export-${dateStr}.json`;
        
        return { content, fileName };
    }

    generateCSVExport(exportData, startDate, endDate) {
        let csvContent = '';
        const dateStr = new Date().toISOString().split('T')[0];
        
        // If multiple stores, create separate sections
        if (Object.keys(exportData).length > 1) {
            // Multi-store CSV with sections
            csvContent += `# Mimir Data Export - ${dateStr}\n`;
            csvContent += `# Date Range: ${startDate || 'All'} to ${endDate || 'All'}\n\n`;
            
            for (const [storeName, records] of Object.entries(exportData)) {
                if (records.length === 0) continue;
                
                csvContent += `## ${storeName.toUpperCase()} (${records.length} records)\n`;
                csvContent += this.generateCSVForStore(storeName, records);
                csvContent += '\n';
            }
            
            const fileName = `mimir-export-${dateStr}.csv`;
            return { content: csvContent, fileName };
        } else {
            // Single store CSV
            const storeName = Object.keys(exportData)[0];
            const records = exportData[storeName];
            
            csvContent = this.generateCSVForStore(storeName, records);
            const fileName = `mimir-${storeName}-${dateStr}.csv`;
            return { content: csvContent, fileName };
        }
    }

    generateCSVForStore(storeName, records) {
        if (records.length === 0) {
            return 'No data available\n';
        }
        
        let csvContent = '';
        
        switch (storeName) {
            case 'history':
                csvContent += 'ID,Date,Timestamp,Title,URL,Domain,Visit Count,Last Visit Time\n';
                records.forEach(record => {
                    csvContent += [
                        record.id || '',
                        record.date || '',
                        record.timestamp || '',
                        this.escapeCSV(record.title || ''),
                        this.escapeCSV(record.url || ''),
                        record.domain || '',
                        record.visitCount || 0,
                        record.lastVisitTime || ''
                    ].join(',') + '\n';
                });
                break;
                
            case 'classified_cache':
                csvContent += 'Date,Created At,Version,Data Size,Data Preview\n';
                records.forEach(record => {
                    const dataPreview = JSON.stringify(record.data).substring(0, 100) + '...';
                    csvContent += [
                        record.date || '',
                        new Date(record.createdAt).toISOString(),
                        record.version || '',
                        JSON.stringify(record.data).length,
                        this.escapeCSV(dataPreview)
                    ].join(',') + '\n';
                });
                break;
                
            case 'diaries':
                csvContent += 'Date,Title,Word Count,Created At,Updated At,Content Preview,Tags\n';
                records.forEach(record => {
                    const contentPreview = (record.content || '').substring(0, 100) + '...';
                    const tags = (record.tags || []).join('; ');
                    csvContent += [
                        record.date || '',
                        this.escapeCSV(record.title || ''),
                        record.wordCount || 0,
                        new Date(record.createdAt).toISOString(),
                        new Date(record.updatedAt).toISOString(),
                        this.escapeCSV(contentPreview),
                        this.escapeCSV(tags)
                    ].join(',') + '\n';
                });
                break;
                
            case 'annual_reports':
                csvContent += 'Year,Generated At,Version,Summary Preview\n';
                records.forEach(record => {
                    const summaryPreview = JSON.stringify(record.summary || {}).substring(0, 100) + '...';
                    csvContent += [
                        record.year || '',
                        new Date(record.generatedAt).toISOString(),
                        record.version || '',
                        this.escapeCSV(summaryPreview)
                    ].join(',') + '\n';
                });
                break;
                
            case 'settings':
                csvContent += 'Key,Category,Updated At,Value Type,Value Preview\n';
                records.forEach(record => {
                    const valueType = typeof record.value;
                    const valuePreview = valueType === 'object' 
                        ? JSON.stringify(record.value).substring(0, 50) + '...'
                        : String(record.value).substring(0, 50);
                    csvContent += [
                        record.key || '',
                        record.category || '',
                        new Date(record.updatedAt).toISOString(),
                        valueType,
                        this.escapeCSV(valuePreview)
                    ].join(',') + '\n';
                });
                break;
                
            default:
                csvContent += 'Data\n';
                records.forEach(record => {
                    csvContent += this.escapeCSV(JSON.stringify(record)) + '\n';
                });
        }
        
        return csvContent;
    }

    escapeCSV(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    downloadFile(content, fileName, mimeType) {
        try {
            // Create blob with the content
            const blob = new Blob([content], { type: mimeType });
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`File downloaded: ${fileName}`);
        } catch (error) {
            console.error('Download failed:', error);
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }

    showMigrationStatus() {
        // This will be implemented in future tasks
        alert('Migration status will be implemented in a future task');
    }

    showSettings() {
        // This will be implemented in future tasks
        alert('Settings will be implemented in a future task');
    }

    async viewRecord(recordId) {
        try {
            const record = this.findRecordById(recordId);
            if (!record) {
                this.showError('Record not found');
                return;
            }
            
            this.currentRecord = record;
            this.showRecordDetails(record);
        } catch (error) {
            console.error('Error viewing record:', error);
            this.showError('Failed to view record');
        }
    }

    findRecordById(recordId) {
        return this.filteredData.find(record => {
            const id = this.getRecordId(record);
            return String(id) === String(recordId);
        });
    }

    showRecordDetails(record) {
        const recordModal = document.getElementById('recordModal');
        const recordModalTitle = document.getElementById('recordModalTitle');
        const recordDetails = document.getElementById('recordDetails');
        
        recordModalTitle.textContent = `${this.currentStore.replace('_', ' ').toUpperCase()} Record Details`;
        
        // Render record details with better formatting
        recordDetails.innerHTML = this.formatRecordDetails(record);
        
        recordModal.classList.add('show');
    }

    formatRecordDetails(record) {
        const fields = Object.entries(record);
        
        return fields.map(([key, value]) => {
            let formattedValue;
            
            if (value === null || value === undefined) {
                formattedValue = '<em>null</em>';
            } else if (typeof value === 'object') {
                formattedValue = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
            } else if (typeof value === 'number' && key.includes('At')) {
                // Format timestamps
                formattedValue = new Date(value).toLocaleString();
            } else if (key === 'url') {
                formattedValue = `<a href="${value}" target="_blank">${value}</a>`;
            } else {
                formattedValue = String(value);
            }
            
            return `
                <div class="record-field">
                    <div class="record-field-label">${this.formatFieldLabel(key)}:</div>
                    <div class="record-field-value">${formattedValue}</div>
                </div>
            `;
        }).join('');
    }

    formatFieldLabel(key) {
        return key.replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase())
                  .replace(/_/g, ' ');
    }

    confirmDeleteRecord(recordId) {
        const record = this.findRecordById(recordId);
        if (!record) {
            this.showError('Record not found');
            return;
        }
        
        const recordTitle = this.getRecordTitle(record) || recordId;
        if (confirm(`Are you sure you want to delete the record "${recordTitle}"? This action cannot be undone.`)) {
            this.deleteRecord(recordId);
        }
    }

    async deleteRecord(recordId) {
        try {
            // Delete from database based on store type
            switch (this.currentStore) {
                case 'history':
                    await this.db.deleteHistoryRecord(parseInt(recordId));
                    break;
                case 'classified_cache':
                    await this.db.deleteClassifiedData(recordId);
                    break;
                case 'diaries':
                    await this.db.deleteDiary(recordId);
                    break;
                case 'annual_reports':
                    await this.db.deleteAnnualReport(parseInt(recordId));
                    break;
                case 'settings':
                    await this.db.deleteSetting(recordId);
                    break;
                default:
                    throw new Error('Unknown store type');
            }
            
            // Reload data to reflect changes
            await this.loadData();
            
            // Close modal if it's open
            document.getElementById('recordModal').classList.remove('show');
            
            this.showSuccess('Record deleted successfully');
            
        } catch (error) {
            console.error('Error deleting record:', error);
            this.showError(`Failed to delete record: ${error.message}`);
        }
    }

    deleteCurrentRecord() {
        if (!this.currentRecord) {
            this.showError('No record selected');
            return;
        }
        
        const recordId = this.getRecordId(this.currentRecord);
        this.confirmDeleteRecord(recordId);
    }

    showError(message) {
        console.error(message);
        // Simple error display - could be enhanced with toast notifications
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        console.log(message);
        // Simple success display - could be enhanced with toast notifications
        alert(`Success: ${message}`);
    }
}

// Global reference for onclick handlers
let dataManager;

// Initialize the Data Manager UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    dataManager = new DataManagerUI();
});