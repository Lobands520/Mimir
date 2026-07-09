class MimirPopup {
  constructor() {
    this.init();
  }

  async init() {
    if (window.dbWrapper) {
      await window.dbWrapper.initialize();
    }

    this.setupEventListeners();
    await this.renderStats();
  }

  setupEventListeners() {
    document.getElementById('openDashboardBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      window.close();
    });

    document.getElementById('openSettingsBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
      window.close();
    });
  }

  async renderStats() {
    const statsRoot = document.getElementById('stats');

    try {
      const db = new MimirDB();
      await db.initialize();

      const today = MimirConfig.formatDateLocal(new Date());
      const [historyRecords, diaries, classified, reports] = await Promise.all([
        db.getAllHistory(),
        db.getAllDiaries(),
        db.getAllClassifiedData(),
        db.getAllAnnualReports()
      ]);

      const uniqueDates = new Set(historyRecords.map((record) => record.date).filter(Boolean));
      const todayCount = historyRecords.filter((record) => record.date === today).length;

      statsRoot.innerHTML = `
        <div class="main-stats">
          <div class="stat-item">
            <span class="stat-number">${uniqueDates.size}</span>
            <span class="stat-label">记录天数</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${todayCount}</span>
            <span class="stat-label">今日浏览</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">✓</span>
            <span class="stat-label">本地保存</span>
          </div>
        </div>
        <div class="detail-stats">
          <div class="detail-item">
            <span class="detail-number">${diaries.length}</span>
            <span class="detail-label">日记</span>
          </div>
          <div class="detail-item">
            <span class="detail-number">${classified.length}</span>
            <span class="detail-label">分析</span>
          </div>
          <div class="detail-item">
            <span class="detail-number">${reports.length}</span>
            <span class="detail-label">报告</span>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Failed to render popup stats:', error);
      statsRoot.innerHTML = `
        <div class="stat-item">
          <span class="stat-number">-</span>
          <span class="stat-label">读取失败</span>
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MimirPopup();
});
