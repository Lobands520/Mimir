class MimirPopup {
    constructor() {
        this.init();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('openDashboardBtn').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/dashboard.html') });
            window.close();
        });
        
        document.getElementById('openSettingsBtn').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
            window.close();
        });
    }

    async init() {
        await this.initializeDatabase();
        await this.loadStats();
    }

    async initializeDatabase() {
        try {
            if (!window.dbWrapper) {
                window.dbWrapper = new DatabaseWrapper();
                await window.dbWrapper.initialize();
            }
        } catch (error) {
            console.warn('初始化数据库失败:', error);
        }
    }

    async loadStats() {
        try {
            // 使用新的数据库结构获取统计信息
            const db = new MimirDB();
            await db.initialize();
            
            // 获取今日浏览数据
            const today = new Date().toISOString().split('T')[0];
            const todayData = await this.getTodayHistory(today);
            
            // 获取数据库统计
            const [historyRecords, diaryRecords, classifiedRecords, reportRecords] = await Promise.all([
                db.getAllHistory(),
                db.getAllDiaries(),
                db.getAllClassifiedData(),
                db.getAllAnnualReports()
            ]);

            // 计算记录天数（去重日期）
            const uniqueDates = new Set();
            historyRecords.forEach(record => {
                if (record.date) uniqueDates.add(record.date);
            });

            const stats = document.getElementById('stats');
            stats.innerHTML = `
                <div class="main-stats">
                    <div class="stat-item">
                        <span class="stat-number">${uniqueDates.size}</span>
                        <span class="stat-label">记录天数</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${todayData.length}</span>
                        <span class="stat-label">今日浏览</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">✓</span>
                        <span class="stat-label">隐私安全</span>
                    </div>
                </div>
                <div class="detail-stats">
                    <div class="detail-item">
                        <span class="detail-number">${diaryRecords.length}</span>
                        <span class="detail-label">日记</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-number">${classifiedRecords.length}</span>
                        <span class="detail-label">分析</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-number">${reportRecords.length}</span>
                        <span class="detail-label">报告</span>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('加载统计信息失败:', error);
            document.getElementById('stats').innerHTML = `
                <div class="stat-item">
                    <span class="stat-number">0</span>
                    <span class="stat-label">记录天数</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">0</span>
                    <span class="stat-label">今日浏览</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">✓</span>
                    <span class="stat-label">隐私安全</span>
                </div>
            `;
        }
    }

    async getTodayHistory(date) {
        try {
            // 首先尝试从数据库获取
            const db = new MimirDB();
            await db.initialize();
            
            const allHistory = await db.getAllHistory();
            const todayHistory = allHistory.filter(record => record.date === date);
            
            if (todayHistory.length > 0) {
                return todayHistory;
            }

            // 如果数据库中没有，尝试从浏览器API获取
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getDailyHistory',
                    date: date
                }, (response) => {
                    resolve(response || []);
                });
            });
        } catch (error) {
            console.error('获取今日历史失败:', error);
            return [];
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MimirPopup();
});