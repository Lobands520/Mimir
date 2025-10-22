// Import database dependencies with service worker compatible error handling
importScripts('lib/idb.js', 'lib/error-handler-sw.js', 'lib/mimir-db.js', 'lib/db-wrapper.js', 'lib/migration.js');

// Mimir 后台服务
class MimirBackgroundService {
    constructor() {
        this.init();
    }

    init() {
        // 安装或更新时，初始化默认设置和定时任务
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Mimir 插件已安装或更新。');
            this.initializeSettings();
            this.scheduleDailyTasks();
        });

        // 监听来自前端页面的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessages(request, sender, sendResponse);
            return true; // 保持消息通道开放以进行异步响应
        });
    }

    // 初始化默认设置
    async initializeSettings() {
        try {
            // Initialize database wrapper if not already done
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }
            
            const result = await self.dbWrapper.get('mimir-config');
            if (!result['mimir-config']) {
                await self.dbWrapper.set({
                    'mimir-config': {
                        enabled: true,
                        useAIClassification: true,
                        retentionDays: 30,
                        apiKey: '',
                        apiUrl: 'https://api.openai.com/v1/chat/completions',
                        customRules: []
                    }
                });
                console.log('Mimir: 已初始化默认设置。');
            }
        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('INITIALIZE_SETTINGS', error);
            }
            console.error('Mimir: 初始化存储失败', error);
        }
    }

    // 设置定时任务（数据清理和历史备份）
    scheduleDailyTasks() {
        // 创建每日清理任务
        chrome.alarms.create('dailyCleanup', {
            delayInMinutes: 1, // 1分钟后首次执行
            periodInMinutes: 24 * 60 // 每天执行一次 (1440分钟)
        });

        // 创建历史记录备份任务 - 每小时执行一次
        chrome.alarms.create('historyBackup', {
            delayInMinutes: 5, // 5分钟后首次执行
            periodInMinutes: 60 // 每小时执行一次
        });

        // 监听闹钟事件
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === 'dailyCleanup') {
                this.cleanupOldData();
            } else if (alarm.name === 'historyBackup') {
                this.backupRecentHistory();
            }
        });
    }
    
    // 备份历史记录到IndexedDB（支持完整备份和增量备份）
    async backupRecentHistory(isFullBackup = false) {
        try {
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }

            console.log(`Mimir: 开始${isFullBackup ? '完整' : '增量'}备份历史记录...`);
            
            // 获取最后备份时间
            const lastBackupResult = await self.dbWrapper.get('mimir-last-backup');
            const lastBackupTime = isFullBackup ? 0 : (lastBackupResult['mimir-last-backup'] || 0);
            
            // 分批获取所有历史记录
            let allHistoryItems = [];
            
            if (isFullBackup) {
                // 完整备份：使用时间分段方式获取所有历史记录
                console.log('Mimir: 开始完整备份，使用时间分段获取所有历史记录...');
                
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                const maxDaysBack = 365 * 3; // 最多获取3年的历史记录
                
                for (let daysBack = 0; daysBack < maxDaysBack; daysBack += 7) { // 每次获取一周的数据
                    const endTime = now - (daysBack * oneDay);
                    const startTime = now - ((daysBack + 7) * oneDay);
                    
                    try {
                        const weeklyHistory = await chrome.history.search({
                            text: '',
                            startTime: startTime,
                            endTime: endTime,
                            maxResults: 0 // 0表示获取所有匹配的记录
                        });
                        
                        if (weeklyHistory.length > 0) {
                            allHistoryItems = allHistoryItems.concat(weeklyHistory);
                            console.log(`Mimir: 获取第${Math.floor(daysBack/7)+1}周历史记录: ${weeklyHistory.length} 条，总计: ${allHistoryItems.length} 条`);
                        } else if (daysBack > 30) {
                            // 如果连续多周没有数据，可能已经到达历史记录的开始
                            console.log(`Mimir: 第${Math.floor(daysBack/7)+1}周无历史记录，可能已获取完所有数据`);
                            break;
                        }
                    } catch (error) {
                        console.warn(`Mimir: 获取第${Math.floor(daysBack/7)+1}周历史记录失败:`, error);
                        continue;
                    }
                }
            } else {
                // 增量备份：获取自上次备份以来的记录
                console.log('Mimir: 开始增量备份...');
                
                const historyItems = await chrome.history.search({
                    text: '',
                    startTime: lastBackupTime,
                    maxResults: 0 // 获取所有匹配的记录
                });
                
                allHistoryItems = historyItems;
                console.log(`Mimir: 增量备份获取到 ${allHistoryItems.length} 条新记录`);
            }

            if (allHistoryItems.length === 0) {
                console.log('Mimir: 没有新的历史记录需要备份');
                return { success: true, totalRecords: 0, backedUpRecords: 0 };
            }

            // 过滤有效的历史记录
            const validItems = allHistoryItems.filter(item => this.isItemValid(item));
            
            if (validItems.length === 0) {
                console.log('Mimir: 没有有效的历史记录需要备份');
                return { success: true, totalRecords: allHistoryItems.length, backedUpRecords: 0 };
            }

            console.log(`Mimir: 开始处理 ${validItems.length} 条有效历史记录...`);

            // 初始化MimirDB进行历史记录存储
            const mimirDB = new MimirDB();
            await mimirDB.initialize();

            // 如果是完整备份，先检查是否已存在记录，避免重复
            const existingRecords = new Set();
            if (isFullBackup) {
                const existing = await mimirDB.getAllHistory();
                existing.forEach(record => {
                    existingRecords.add(`${record.url}-${record.timestamp}`);
                });
                console.log(`Mimir: 发现 ${existing.length} 条已存在的历史记录`);
            }

            // 批量添加历史记录到IndexedDB
            let successCount = 0;
            let skippedCount = 0;
            const processBatchSize = 100; // 每批处理100条记录
            
            for (let i = 0; i < validItems.length; i += processBatchSize) {
                const batch = validItems.slice(i, i + processBatchSize);
                
                for (const item of batch) {
                    try {
                        const historyRecord = {
                            timestamp: item.lastVisitTime,
                            date: new Date(item.lastVisitTime).toISOString().split('T')[0],
                            url: item.url,
                            title: item.title,
                            domain: new URL(item.url).hostname,
                            visitCount: item.visitCount || 1,
                            lastVisitTime: item.lastVisitTime
                        };
                        
                        // 检查是否已存在（仅在完整备份时）
                        const recordKey = `${item.url}-${item.lastVisitTime}`;
                        if (isFullBackup && existingRecords.has(recordKey)) {
                            skippedCount++;
                            continue;
                        }
                        
                        await mimirDB.addHistoryRecord(historyRecord);
                        successCount++;
                        
                    } catch (error) {
                        // 如果是重复记录错误，跳过
                        if (error.message.includes('constraint') || error.message.includes('unique')) {
                            skippedCount++;
                        } else {
                            console.warn('Mimir: 备份单条历史记录失败:', error.message);
                        }
                    }
                }
                
                // 每处理一批后显示进度
                const progress = Math.min(i + processBatchSize, validItems.length);
                console.log(`Mimir: 备份进度 ${progress}/${validItems.length} (${Math.round(progress/validItems.length*100)}%)`);
            }

            // 更新最后备份时间
            const currentTime = Date.now();
            await self.dbWrapper.set({ 
                'mimir-last-backup': currentTime,
                'mimir-backup-stats': {
                    lastBackupTime: currentTime,
                    totalProcessed: validItems.length,
                    successCount: successCount,
                    skippedCount: skippedCount,
                    isFullBackup: isFullBackup
                }
            });

            const message = `Mimir: 历史记录备份完成，成功备份 ${successCount} 条，跳过 ${skippedCount} 条，共处理 ${validItems.length} 条记录`;
            console.log(message);
            
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logInfo(`History backup completed: ${successCount} new records, ${skippedCount} skipped`);
            }

            return {
                success: true,
                totalRecords: validItems.length,
                backedUpRecords: successCount,
                skippedRecords: skippedCount
            };

        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('BACKUP_RECENT_HISTORY', error);
            }
            console.error('Mimir: 历史记录备份失败', error);
            return {
                success: false,
                error: error.message,
                totalRecords: 0,
                backedUpRecords: 0
            };
        }
    }

    // 清理过期历史数据（但保留备份的历史记录）
    async cleanupOldData() {
        try {
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }
            
            const result = await self.dbWrapper.get('mimir-config');
            const retentionDays = result['mimir-config']?.retentionDays || 30;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            const allData = await self.dbWrapper.get();
            const keysToDelete = [];
            
            for (const key in allData) {
                // 只清理缓存的分析和日记数据，不清理历史记录备份
                if (key.startsWith('classified-') || key.startsWith('diary-')) {
                    const dateStr = key.split('-').slice(1).join('-');
                    const itemDate = new Date(dateStr);
                    if (itemDate < cutoffDate) {
                        keysToDelete.push(key);
                    }
                }
            }
            
            if (keysToDelete.length > 0) {
                await self.dbWrapper.remove(keysToDelete);
                console.log(`Mimir: 已清理 ${keysToDelete.length} 天的过期缓存数据。`);
            }
        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('CLEANUP_OLD_DATA', error);
            }
            console.error('Mimir: 清理数据失败', error);
        }
    }

    // 统一处理所有消息
    handleMessages(request, sender, sendResponse) {
        switch (request.action) {
            case 'test':
                // Simple test action for debugging
                sendResponse({ success: true, message: 'Service worker is working' });
                break;
            case 'getDailyHistory':
                this.getDailyHistory(request.date).then(sendResponse);
                break;
            case 'getYearData':
                this.getYearData(request.year).then(sendResponse);
                break;
            case 'getAvailableYears':
                this.getAvailableYears().then(sendResponse);
                break;
            // 新增：为设置页面提供智能建议所需的数据
            case 'getSuggestionData':
                this.getSuggestionData().then(sendResponse);
                break;
            // 新增：从仪表盘打开设置页面
            case 'openOptionsPage':
                chrome.runtime.openOptionsPage();
                break;
            // 新增：数据迁移
            case 'startMigration':
                this.startMigration().then(sendResponse);
                break;
            // 新增：手动备份历史记录
            case 'backupHistory':
                this.backupRecentHistory().then((result) => {
                    if (result.success) {
                        sendResponse({ 
                            success: true, 
                            message: `历史记录备份完成，成功备份 ${result.backedUpRecords} 条记录`,
                            ...result
                        });
                    } else {
                        sendResponse({ success: false, error: result.error });
                    }
                }).catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
                break;
            // 新增：完整备份历史记录
            case 'fullBackupHistory':
                this.backupRecentHistory(true).then((result) => {
                    if (result.success) {
                        sendResponse({ 
                            success: true, 
                            message: `完整备份完成，成功备份 ${result.backedUpRecords} 条记录，跳过 ${result.skippedRecords} 条重复记录`,
                            ...result
                        });
                    } else {
                        sendResponse({ success: false, error: result.error });
                    }
                }).catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
                break;
            // 新增：获取备份状态
            case 'getBackupStatus':
                this.getBackupStatus().then(sendResponse);
                break;
            default:
                console.warn('Mimir:收到未知请求', request);
                sendResponse({ error: 'Unknown action' });
                break;
        }
    }

    // 获取单日历史记录 (直接从浏览器API获取，这是最可靠的数据源)
    async getDailyHistory(date) {
        try {
            const targetDate = new Date(date);
            const startTime = new Date(targetDate.setHours(0, 0, 0, 0)).getTime();
            const endTime = new Date(targetDate.setHours(23, 59, 59, 999)).getTime();

            const historyItems = await chrome.history.search({
                text: '',
                startTime: startTime,
                endTime: endTime,
                maxResults: 10000 // 单日足够大
            });

            return historyItems
                .filter(item => this.isItemValid(item))
                .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
                .map(item => ({...item, timestamp: item.lastVisitTime }));

        } catch (error) {
            console.error('Mimir: 获取单日历史记录失败', error);
            return [];
        }
    }

    // 获取年度历史记录
    async getYearData(year) {
        try {
            const startTime = new Date(`${year}-01-01T00:00:00.000Z`).getTime();
            const endTime = new Date(`${year}-12-31T23:59:59.999Z`).getTime();

            const historyItems = await chrome.history.search({
                text: '',
                startTime,
                endTime,
                maxResults: 0 // 获取所有匹配项
            });
            
            return historyItems
                .filter(item => this.isItemValid(item))
                .map(item => ({...item, timestamp: item.lastVisitTime })); // 添加timestamp字段
        } catch (error) {
            console.error('Mimir: 获取年度历史记录失败', error);
            return [];
        }
    }
    
    // 获取有记录的年份列表
    async getAvailableYears() {
        try {
            // 获取更多历史记录来分析年份分布
            const historyItems = await chrome.history.search({ 
                text: '', 
                maxResults: 10000,
                startTime: new Date('2020-01-01').getTime() // 从2020年开始
            });
            
            if (historyItems.length === 0) return [new Date().getFullYear()];
            
            // 统计每年的记录数量
            const yearCounts = {};
            historyItems.forEach(item => {
                const year = new Date(item.lastVisitTime).getFullYear();
                yearCounts[year] = (yearCounts[year] || 0) + 1;
            });
            
            // 返回有记录的年份，按年份倒序排列
            const availableYears = Object.keys(yearCounts)
                .map(year => parseInt(year))
                .filter(year => year >= 2020) // 只返回2020年及以后的年份
                .sort((a, b) => b - a);
            
            // 确保当前年份在列表中
            const currentYear = new Date().getFullYear();
            if (!availableYears.includes(currentYear)) {
                availableYears.unshift(currentYear);
            }
            
            console.log('可用年份:', availableYears, '年份记录数:', yearCounts);
            return availableYears;
        } catch (error) {
            console.error('Mimir: 获取年份列表失败', error);
            return [new Date().getFullYear()];
        }
    }

    // 新增：获取智能建议数据
    async getSuggestionData() {
        try {
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }
            
            // 并行获取最近1000条历史记录和用户配置
            const [history, configResult] = await Promise.all([
                chrome.history.search({ text: '', maxResults: 1000, startTime: 0 }),
                self.dbWrapper.get('mimir-config')
            ]);

            const config = configResult['mimir-config'] || {};
            // 提供内置的规则和用户自定义的规则
            const response = {
                history: history,
                builtInRules: this.getBuiltInDomainRules(),
                customRules: config.customRules || []
            };
            return response;
        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('GET_SUGGESTION_DATA', error);
            }
            console.error("Mimir: 获取建议数据失败:", error);
            return { history: [], builtInRules: [], customRules: [] };
        }
    }

    // 辅助函数：判断历史记录条目是否有效
    isItemValid(item) {
        const excludedPrefixes = ['chrome://', 'chrome-extension://', 'about:', 'file://'];
        const excludedTitles = ['新标签页', 'New Tab', 'about:blank'];

        if (!item.url || !item.title || item.title.trim() === '') return false;
        if (excludedPrefixes.some(p => item.url.startsWith(p))) return false;
        if (excludedTitles.includes(item.title)) return false;

        return true;
    }

    // 新增：辅助函数，提供内置的域名->分类的规则
    getBuiltInDomainRules() {
        const domainMapping = {
            '编程与开发': ['github.com', 'gitlab.com', 'stackoverflow.com', 'pypi.org', 'npmjs.com', 'docs.python.org', 'developer.mozilla.org', 'go.dev', 'kaggle.com', 'aistudio.google.com', 'ai.google.dev', 'console.cloud.google.com', 'ollama.com', 'openwebui.com', 'cloud.google.com', 'console.aws.amazon.com', 'vercel.com', 'netlify.com', 'heroku.com', 'docker.com'],
            '工作与生产力': ['docs.google.com', 'drive.google.com', 'notion.so', 'miro.com', 'trello.com', 'slack.com', 'mail.google.com', 'outlook.office.com', 'feishu.cn', 'dingtalk.com', 'teams.microsoft.com', 'zoom.us', 'office.com', 'sharepoint.com'],
            '新闻与资讯': ['news.ycombinator.com', 'mp.weixin.qq.com', 'zhuanlan.zhihu.com', 'blog.google', 'medium.com', 'theverge.com', 'bbc.com', 'cnn.com', 'techcrunch.com', '36kr.com', 'sspai.com', 'infoq.cn'],
            '娱乐与视频': ['bilibili.com', 'youtube.com', 'netflix.com', 'iqiyi.com', 'youku.com', 'douyin.com', 'twitch.tv', 'tiktok.com', 'spotify.com', 'music.163.com'],
            '社交与社区': ['x.com', 'twitter.com', 'weibo.com', 'reddit.com', 'discord.com', 'telegram.org', 'zhihu.com', 'v2ex.com', 'douban.com', 'facebook.com', 'instagram.com'],
            '生活与消费': ['amazon.com', 'taobao.com', 'tmall.com', 'jd.com', 'meituan.com', 'ele.me', 'ctrip.com', 'booking.com', 'dianping.com', 'xiaohongshu.com', 'pinduoduo.com', 'suning.com'],
            '学术与教育': ['arxiv.org', 'acm.org', 'ieee.org', 'springer.com', 'nature.com', 'science.org', 'coursera.org', 'edx.org', 'cnki.net', 'scholar.google.com', 'researchgate.net', 'academia.edu']
        };
        const rules = [];
        for (const category in domainMapping) {
            for (const domain of domainMapping[category]) {
                rules.push({ type: 'domain', value: domain, category: category });
            }
        }
        return rules;
    }

    // 新增：获取备份状态
    async getBackupStatus() {
        try {
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }

            const [lastBackupResult, backupStatsResult] = await Promise.all([
                self.dbWrapper.get('mimir-last-backup'),
                self.dbWrapper.get('mimir-backup-stats')
            ]);
            
            const lastBackupTime = lastBackupResult['mimir-last-backup'] || 0;
            const backupStats = backupStatsResult['mimir-backup-stats'] || {};
            
            // 获取IndexedDB中的历史记录数量
            const mimirDB = new MimirDB();
            await mimirDB.initialize();
            const allHistory = await mimirDB.getAllHistory();
            
            // 获取浏览器中的总历史记录数量（用于对比）
            let browserHistoryCount = 0;
            try {
                // 使用分段方式获取更准确的历史记录数量
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                const maxDaysBack = 365; // 获取最近一年的记录数量作为参考
                
                for (let daysBack = 0; daysBack < maxDaysBack; daysBack += 30) { // 每次获取一个月的数据
                    const endTime = now - (daysBack * oneDay);
                    const startTime = now - ((daysBack + 30) * oneDay);
                    
                    const monthlyHistory = await chrome.history.search({
                        text: '',
                        startTime: startTime,
                        endTime: endTime,
                        maxResults: 0
                    });
                    
                    browserHistoryCount += monthlyHistory.length;
                    
                    // 如果连续几个月没有数据，停止获取
                    if (monthlyHistory.length === 0 && daysBack > 90) {
                        break;
                    }
                }
                
                console.log(`Mimir: 估算浏览器历史记录数量: ${browserHistoryCount} 条`);
            } catch (error) {
                console.warn('无法获取浏览器历史记录数量:', error);
                // 如果分段获取失败，尝试直接获取
                try {
                    const directHistory = await chrome.history.search({
                        text: '',
                        maxResults: 100000 // 尝试获取更多记录
                    });
                    browserHistoryCount = directHistory.length;
                } catch (directError) {
                    console.warn('直接获取也失败:', directError);
                }
            }
            
            return {
                success: true,
                lastBackupTime: lastBackupTime,
                lastBackupDate: lastBackupTime ? new Date(lastBackupTime).toLocaleString() : '从未备份',
                totalBackedUpRecords: allHistory.length,
                browserHistoryCount: browserHistoryCount,
                backupCoverage: browserHistoryCount > 0 ? Math.round((allHistory.length / browserHistoryCount) * 100) : 0,
                lastBackupStats: backupStats,
                isBackupEnabled: true,
                needsFullBackup: allHistory.length < browserHistoryCount * 0.8 // 如果备份覆盖率低于80%，建议完整备份
            };
        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('GET_BACKUP_STATUS', error);
            }
            return {
                success: false,
                error: error.message,
                lastBackupTime: 0,
                totalBackedUpRecords: 0,
                browserHistoryCount: 0,
                isBackupEnabled: false
            };
        }
    }

    // 新增：数据迁移功能
    async startMigration() {
        try {
            if (!self.dbWrapper) {
                self.dbWrapper = new DatabaseWrapper();
                await self.dbWrapper.initialize();
            }
            
            console.log('开始数据迁移...');
            
            // 获取chrome.storage.local中的所有数据
            const chromeStorageData = await new Promise((resolve) => {
                chrome.storage.local.get(null, resolve);
            });
            
            console.log('从chrome.storage.local获取到数据项数量:', Object.keys(chromeStorageData).length);
            
            if (Object.keys(chromeStorageData).length === 0) {
                console.log('chrome.storage.local中没有数据需要迁移');
                return { success: true, message: '没有数据需要迁移' };
            }
            
            // 使用db-wrapper的set方法将数据迁移到IndexedDB
            // db-wrapper会自动处理数据格式转换
            await self.dbWrapper.set(chromeStorageData);
            
            console.log('数据迁移完成');
            return { success: true, message: '数据迁移成功完成' };
            
        } catch (error) {
            if (self.mimirErrorHandler) {
                self.mimirErrorHandler.logError('START_MIGRATION', error);
            }
            console.error('数据迁移失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize database wrapper for service worker (but don't auto-initialize)
self.dbWrapper = new DatabaseWrapper();

// 启动后台服务
new MimirBackgroundService();
