class DataManagerUI {
  constructor() {
    this.db = new MimirDB();
    this.currentStore = 'history';
    this.currentPage = 1;
    this.pageSize = 50;
    this.searchTerm = '';
    this.filterValue = '';
    this.sortValue = 'date-desc';
    this.currentData = [];
    this.filteredData = [];
    this.currentRecord = null;
    this.init();
  }

  async init() {
    await this.db.initialize();
    this.setupEventListeners();
    await this.loadData();
  }

  setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', (event) => {
      this.searchTerm = event.target.value.trim();
      this.currentPage = 1;
      this.loadData();
    });

    document.getElementById('filterSelect').addEventListener('change', (event) => {
      this.filterValue = event.target.value;
      this.currentPage = 1;
      this.loadData();
    });

    document.getElementById('sortSelect').addEventListener('change', (event) => {
      this.sortValue = event.target.value;
      this.loadData();
    });

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        this.currentStore = button.dataset.store;
        this.currentPage = 1;
        this.loadData();
      });
    });

    document.getElementById('prevBtn').addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage -= 1;
        this.renderTableData();
      }
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
      const pageCount = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));
      if (this.currentPage < pageCount) {
        this.currentPage += 1;
        this.renderTableData();
      }
    });

    document.getElementById('exportBtn').addEventListener('click', () => this.showExportModal());
    document.getElementById('migrationBtn').addEventListener('click', () => this.openSettingsPage());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettingsPage());

    document.getElementById('closeExportModal').addEventListener('click', () => this.hideExportModal());
    document.getElementById('cancelExport').addEventListener('click', () => this.hideExportModal());
    document.getElementById('confirmExport').addEventListener('click', () => this.performExport());

    document.getElementById('closeRecordModal').addEventListener('click', () => this.hideRecordModal());
    document.getElementById('closeRecord').addEventListener('click', () => this.hideRecordModal());
    document.getElementById('deleteRecord').addEventListener('click', () => this.deleteCurrentRecord());

    document.getElementById('tableBody').addEventListener('click', (event) => this.handleTableAction(event));
    window.addEventListener('click', (event) => {
      if (event.target === document.getElementById('exportModal')) {
        this.hideExportModal();
      }
      if (event.target === document.getElementById('recordModal')) {
        this.hideRecordModal();
      }
    });
  }

  getHeadersForStore(store) {
    const map = {
      history: ['ID', '日期', '标题', '域名', 'URL', '访问次数'],
      classified_cache: ['日期', '更新时间', '版本', '大小'],
      diaries: ['日期', '标题', '字数', '创建时间', '更新时间'],
      annual_reports: ['年份', '生成时间', '更新时间', '摘要'],
      settings: ['键', '分类', '更新时间', '值']
    };

    return map[store] || ['键', '值'];
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

  async loadData() {
    this.showLoading(true);

    try {
      await this.loadStoreData();
      this.applyFilters();
      this.applySorting();
      this.renderTableStructure();
      this.renderTableData();
      this.updateRecordCount();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showMessage(`加载失败: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  applyFilters() {
    let filtered = this.currentData.slice();

    if (this.searchTerm) {
      const keyword = this.searchTerm.toLowerCase();
      filtered = filtered.filter((record) => {
        return JSON.stringify(record).toLowerCase().includes(keyword);
      });
    }

    if (this.filterValue) {
      const now = new Date();
      const today = MimirConfig.formatDateLocal(now);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now);
      monthStart.setMonth(now.getMonth() - 1);

      filtered = filtered.filter((record) => {
        const comparable = this.getComparableTimestamp(record);
        if (!comparable) {
          return false;
        }

        if (this.filterValue === 'today') {
          return MimirConfig.formatDateLocal(comparable) === today;
        }
        if (this.filterValue === 'week') {
          return comparable >= weekStart.getTime();
        }
        if (this.filterValue === 'month') {
          return comparable >= monthStart.getTime();
        }
        if (this.filterValue === 'year') {
          return new Date(comparable).getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    this.filteredData = filtered;
  }

  applySorting() {
    const [field, direction] = this.sortValue.split('-');
    const factor = direction === 'asc' ? 1 : -1;

    this.filteredData.sort((left, right) => {
      if (field === 'title') {
        return factor * this.getPrimaryText(left).localeCompare(this.getPrimaryText(right), 'zh-CN');
      }

      return factor * (this.getComparableTimestamp(left) - this.getComparableTimestamp(right));
    });
  }

  getComparableTimestamp(record) {
    if (record.timestamp) {
      return Number(record.timestamp);
    }
    if (record.lastVisitTime) {
      return Number(record.lastVisitTime);
    }
    if (record.updatedAt) {
      return Number(record.updatedAt);
    }
    if (record.createdAt) {
      return Number(record.createdAt);
    }
    if (record.generatedAt) {
      return Number(record.generatedAt);
    }
    if (record.date) {
      return MimirConfig.startOfDay(record.date);
    }
    if (record.year) {
      return new Date(`${record.year}-01-01T00:00:00`).getTime();
    }
    return 0;
  }

  getPrimaryText(record) {
    return String(record.title || record.key || record.date || record.year || '');
  }

  renderTableStructure() {
    const header = document.getElementById('tableHeader');
    header.innerHTML = `
      <tr>
        ${this.getHeadersForStore(this.currentStore).map((label) => `<th>${label}</th>`).join('')}
        <th>操作</th>
      </tr>
    `;
  }

  renderTableData() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('dataTable');
    const pageCount = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));

    if (this.currentPage > pageCount) {
      this.currentPage = pageCount;
    }

    if (this.filteredData.length === 0) {
      tableBody.innerHTML = '';
      table.style.display = 'none';
      emptyState.style.display = 'block';
      this.updatePagination(pageCount);
      return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    const start = (this.currentPage - 1) * this.pageSize;
    const rows = this.filteredData.slice(start, start + this.pageSize);
    tableBody.innerHTML = rows.map((record) => this.renderRow(record)).join('');
    this.updatePagination(pageCount);
  }

  renderRow(record) {
    const recordId = this.getRecordId(record);
    const cells = this.getCellsForRecord(record).map((cell) => `<td>${this.escapeHTML(cell)}</td>`).join('');
    return `
      <tr>
        ${cells}
        <td class="actions">
          <button class="btn-small btn-view" data-action="view" data-record-id="${this.escapeHTML(recordId)}">查看</button>
          <button class="btn-small btn-delete" data-action="delete" data-record-id="${this.escapeHTML(recordId)}">删除</button>
        </td>
      </tr>
    `;
  }

  getCellsForRecord(record) {
    switch (this.currentStore) {
      case 'history':
        return [
          record.id || '',
          record.date || '',
          record.title || '',
          record.domain || '',
          record.url || '',
          String(record.visitCount || 0)
        ];
      case 'classified_cache':
        return [
          record.date || '',
          this.formatDateTime(record.updatedAt || record.createdAt),
          record.version || '',
          `${JSON.stringify(record.data || {}).length} chars`
        ];
      case 'diaries':
        return [
          record.date || '',
          record.title || '未命名',
          String(record.wordCount || 0),
          this.formatDateTime(record.createdAt),
          this.formatDateTime(record.updatedAt)
        ];
      case 'annual_reports':
        return [
          String(record.year || ''),
          this.formatDateTime(record.generatedAt),
          this.formatDateTime(record.updatedAt),
          JSON.stringify(record.summary || {})
        ];
      case 'settings':
        return [
          record.key || '',
          record.category || '',
          this.formatDateTime(record.updatedAt),
          JSON.stringify(record.value)
        ];
      default:
        return [JSON.stringify(record)];
    }
  }

  getRecordId(record) {
    if (this.currentStore === 'history') {
      return String(record.id);
    }
    if (this.currentStore === 'annual_reports') {
      return String(record.year);
    }
    return String(record.date || record.key || '');
  }

  handleTableAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const recordId = button.dataset.recordId;
    if (button.dataset.action === 'view') {
      this.viewRecord(recordId);
      return;
    }

    if (button.dataset.action === 'delete') {
      this.currentRecord = this.currentData.find((record) => this.getRecordId(record) === String(recordId)) || null;
      this.deleteCurrentRecord();
    }
  }

  viewRecord(recordId) {
    this.currentRecord = this.currentData.find((record) => this.getRecordId(record) === String(recordId)) || null;
    if (!this.currentRecord) {
      return;
    }

    document.getElementById('recordModalTitle').textContent = `查看 ${this.getRecordId(this.currentRecord)}`;
    document.getElementById('recordDetails').innerHTML = `
      <pre style="white-space: pre-wrap; word-break: break-word;">${this.escapeHTML(JSON.stringify(this.currentRecord, null, 2))}</pre>
    `;
    document.getElementById('recordModal').classList.add('show');
  }

  hideRecordModal() {
    document.getElementById('recordModal').classList.remove('show');
    this.currentRecord = null;
  }

  async deleteCurrentRecord() {
    if (!this.currentRecord) {
      return;
    }

    const label = this.getRecordId(this.currentRecord);
    if (!confirm(`确定要删除 ${label} 吗？`)) {
      return;
    }

    try {
      switch (this.currentStore) {
        case 'history':
          await this.db.deleteHistoryRecord(this.currentRecord.id);
          break;
        case 'classified_cache':
          await this.db.deleteClassifiedData(this.currentRecord.date);
          break;
        case 'diaries':
          await this.db.deleteDiary(this.currentRecord.date);
          break;
        case 'annual_reports':
          await this.db.deleteAnnualReport(this.currentRecord.year);
          break;
        case 'settings':
          await this.db.deleteSetting(this.currentRecord.key);
          break;
        default:
          break;
      }

      this.hideRecordModal();
      await this.loadData();
      this.showMessage('删除成功');
    } catch (error) {
      this.showMessage(`删除失败: ${error.message}`);
    }
  }

  updateRecordCount() {
    document.getElementById('recordCount').textContent = `${this.filteredData.length} 条记录`;
  }

  updatePagination(pageCount) {
    document.getElementById('pageInfo').textContent = `第 ${this.currentPage} 页，共 ${pageCount} 页`;
    document.getElementById('prevBtn').disabled = this.currentPage <= 1;
    document.getElementById('nextBtn').disabled = this.currentPage >= pageCount;
  }

  showLoading(visible) {
    document.getElementById('loadingIndicator').style.display = visible ? 'flex' : 'none';
  }

  showExportModal() {
    document.getElementById('exportModal').classList.add('show');
  }

  hideExportModal() {
    document.getElementById('exportModal').classList.remove('show');
  }

  async performExport() {
    const selectedStores = Array.from(document.querySelectorAll('input[name="stores"]:checked')).map((node) => node.value);
    const format = document.querySelector('input[name="format"]:checked').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (selectedStores.length === 0) {
      this.showMessage('请至少选择一个数据表');
      return;
    }

    const exportData = await this.collectExportData(selectedStores, startDate, endDate);
    const dateSuffix = MimirConfig.formatDateLocal(new Date());

    if (format === 'json') {
      const content = JSON.stringify({
        metadata: {
          exportDate: new Date().toISOString(),
          stores: selectedStores,
          startDate: startDate || null,
          endDate: endDate || null
        },
        data: exportData
      }, null, 2);
      this.downloadFile(content, `mimir-export-${dateSuffix}.json`, 'application/json');
    } else {
      const content = this.generateCsvExport(exportData);
      this.downloadFile(content, `mimir-export-${dateSuffix}.csv`, 'text/csv');
    }

    this.hideExportModal();
    this.showMessage('导出完成');
  }

  async collectExportData(selectedStores, startDate, endDate) {
    const exportData = {};

    for (const storeName of selectedStores) {
      switch (storeName) {
        case 'history':
          if (startDate && endDate) {
            exportData[storeName] = await this.db.getHistoryByTimestampRange(
              MimirConfig.startOfDay(startDate),
              MimirConfig.endOfDay(endDate)
            );
          } else {
            exportData[storeName] = await this.db.getAllHistory();
          }
          break;
        case 'classified_cache':
          exportData[storeName] = startDate && endDate
            ? await this.db.getClassifiedDataByDateRange(startDate, endDate)
            : await this.db.getAllClassifiedData();
          break;
        case 'diaries':
          exportData[storeName] = startDate && endDate
            ? await this.db.getDiariesByDateRange(startDate, endDate)
            : await this.db.getAllDiaries();
          break;
        case 'annual_reports':
          exportData[storeName] = startDate && endDate
            ? await this.db.getAnnualReportsByYearRange(new Date(startDate).getFullYear(), new Date(endDate).getFullYear())
            : await this.db.getAllAnnualReports();
          break;
        case 'settings':
          exportData[storeName] = await this.db.getAllSettings();
          break;
        default:
          exportData[storeName] = [];
      }
    }

    return exportData;
  }

  generateCsvExport(exportData) {
    const lines = [];
    Object.entries(exportData).forEach(([storeName, records]) => {
      lines.push(`# ${storeName}`);
      if (!records.length) {
        lines.push('No data');
        lines.push('');
        return;
      }

      const columns = Object.keys(records[0]);
      lines.push(columns.join(','));
      records.forEach((record) => {
        lines.push(columns.map((column) => this.escapeCsv(record[column])).join(','));
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  openSettingsPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }

  formatDateTime(timestamp) {
    if (!timestamp) {
      return '';
    }
    return new Date(timestamp).toLocaleString();
  }

  escapeHtmlText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeHTML(value) {
    return this.escapeHtmlText(value == null ? '' : value);
  }

  escapeCsv(value) {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return `"${String(stringValue || '').replace(/"/g, '""')}"`;
  }

  showMessage(message) {
    window.alert(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DataManagerUI();
});
