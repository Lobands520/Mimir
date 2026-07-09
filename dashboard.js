// Mimir AI日记生成器
class MimirDashboard {
    constructor() {
        this.currentDate = MimirConfig.formatDateLocal(new Date());
        this.currentData = [];
        this.currentDiary = '';

        // 网络状态监听
        this.setupNetworkMonitoring();

        // 固定分类标签集
        this.categories = MimirConfig.CATEGORIES.slice();

        // 域名映射表
        this.domainMapping = MimirConfig.clone(MimirConfig.DOMAIN_MAPPING);

        // 关键词映射表
        this.keywordMapping = MimirConfig.clone(MimirConfig.KEYWORD_MAPPING);

        // 无意义条目过滤规则
        this.filterPatterns = MimirConfig.FILTER_PATTERNS.slice();

        this.init();
    }

    setupNetworkMonitoring() {
        // 监听网络状态变化
        window.addEventListener('online', () => {
            console.log('网络连接已恢复');
            this.showAIClassificationStatus('网络连接已恢复', 'success');
        });

        window.addEventListener('offline', () => {
            console.log('网络连接已断开');
            this.showAIClassificationStatus('网络连接已断开，AI功能暂时不可用', 'warning');
        });
    }

    async init() {
        this.setupEventListeners();
        this.setToday();
        this.setupYearSelector();
        await this.loadDailyData();
        await this.loadDatabaseStats();
    }

    // 设置年份选择器
    setupYearSelector() {
        const yearInput = document.getElementById('yearInput');
        if (!yearInput) return;

        const currentYear = new Date().getFullYear();
        const startYear = 2020; // 可以根据需要调整起始年份

        // 清空现有选项
        yearInput.innerHTML = '';

        // 添加年份选项（从当前年份到起始年份）
        for (let year = currentYear; year >= startYear; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) {
                option.selected = true;
            }
            yearInput.appendChild(option);
        }
    }

    setupEventListeners() {
        // 安全地添加事件监听器
        const addListener = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, handler.bind(this));
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        };

        addListener('dateInput', 'change', this.loadDailyData);
        addListener('prevDayBtn', 'click', this.goToPreviousDay);
        addListener('nextDayBtn', 'click', this.goToNextDay);
        addListener('todayBtn', 'click', this.setToday);
        addListener('analyzeBtn', 'click', this.analyzeData);
        addListener('generateDiaryBtn', 'click', this.generateDiary);
        addListener('refreshBtn', 'click', this.loadDailyData);
        addListener('settingsBtn', 'click', this.openSettings);
        addListener('dataManagerBtn', 'click', this.openDataManager);
        addListener('closeErrorBtn', 'click', this.closeError);
        addListener('exportAnalysisBtn', 'click', this.exportAnalysis);
        addListener('copyBtn', 'click', this.copyDiary);
        addListener('saveBtn', 'click', this.saveDiary);

        // 年度报告相关事件监听器
        addListener('dailyViewBtn', 'click', this.switchToDailyView);
        addListener('annualViewBtn', 'click', this.switchToAnnualView);
        addListener('yearInput', 'change', this.onYearChange);
        addListener('currentYearBtn', 'click', this.setCurrentYear);
        addListener('generateAnnualBtn', 'click', this.generateAnnualReport);
        addListener('exportAnnualBtn', 'click', this.exportAnnualReport);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeError();
            }
        });
    }



    setToday() {
        const dateInput = document.getElementById('dateInput');
        const today = MimirConfig.formatDateLocal(new Date());
        dateInput.value = today;
        this.currentDate = today;
        this.loadDailyData();
    }

    // 前一天
    goToPreviousDay() {
        const dateInput = document.getElementById('dateInput');
        const currentDate = new Date(dateInput.value);
        currentDate.setDate(currentDate.getDate() - 1);
        const newDate = MimirConfig.formatDateLocal(currentDate);
        dateInput.value = newDate;
        this.loadDailyData();
    }

    // 后一天
    goToNextDay() {
        const dateInput = document.getElementById('dateInput');
        const currentDate = new Date(dateInput.value);
        const today = MimirConfig.formatDateLocal(new Date());
        
        // 不能超过今天
        if (dateInput.value >= today) {
            this.showError('不能选择未来的日期');
            return;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
        const newDate = MimirConfig.formatDateLocal(currentDate);
        dateInput.value = newDate;
        this.loadDailyData();
    }

    async loadDailyData() {
        try {
            this.currentDate = document.getElementById('dateInput').value;

            // 显示加载状态
            this.showLoading();

            // 获取数据 - 优先从数据库获取，如果没有则从浏览器API获取
            this.currentData = await this.getDailyHistoryFromDatabase(this.currentDate);
            
            // 如果数据库中没有数据，尝试从浏览器API获取
            if (this.currentData.length === 0) {
                this.currentData = await this.getDailyHistory(this.currentDate);
            }

            // 更新UI
            this.updateOverview();
            this.renderHistoryList();

            // 加载并显示分析数据
            await this.loadAnalysisData();

            // 加载并显示日记数据
            await this.loadDiaryData();

        } catch (error) {
            this.showError('加载数据失败: ' + error.message);
        }
    }

    // 从数据库获取历史记录
    async getDailyHistoryFromDatabase(date) {
        try {
            // 初始化数据库
            if (!window.dbWrapper) {
                await this.initializeDatabase();
            }

            // 从IndexedDB获取历史记录
            const db = new MimirDB();
            await db.initialize();
            
            // 获取指定日期的历史记录
            const allHistory = await db.getAllHistory();
            const dailyHistory = allHistory.filter(record => record.date === date);
            
            console.log(`从数据库获取到 ${dailyHistory.length} 条 ${date} 的历史记录`);
            return dailyHistory;
            
        } catch (error) {
            console.warn('从数据库获取历史记录失败:', error);
            return [];
        }
    }

    // 加载分析数据
    async loadAnalysisData() {
        try {
            const classifiedKey = `classified-${this.currentDate}`;
            const classifiedResult = await window.dbWrapper.get(classifiedKey);
            const analysisSection = document.getElementById('analysisSection');
            
            if (classifiedResult[classifiedKey]) {
                // 有分析数据，显示分析结果
                analysisSection.style.display = 'block';
                this.displayAnalysis(classifiedResult[classifiedKey]);
                this.showAnalysisButtons();
            } else {
                // 没有当前日期的分析数据，显示占位符
                analysisSection.style.display = 'block';
                const analysisContent = document.getElementById('analysisContent');
                analysisContent.innerHTML = `
                    <div class="placeholder">
                        <p>🔍</p>
                        <p>选择日期后点击"分析数据"按钮，AI将为您整理和分类浏览记录</p>
                    </div>
                `;
                // 隐藏分析按钮
                document.getElementById('exportAnalysisBtn').style.display = 'none';
            }
        } catch (error) {
            console.warn('加载分析数据失败:', error);
        }
    }

    // 加载日记数据
    async loadDiaryData() {
        try {
            const diaryKey = `diary-${this.currentDate}`;
            const diaryResult = await window.dbWrapper.get(diaryKey);
            const diarySection = document.getElementById('diarySection');
            
            if (diaryResult[diaryKey]) {
                // 有日记数据，显示日记内容
                diarySection.style.display = 'block';
                this.displayDiary(diaryResult[diaryKey]);
                // 显示操作按钮
                const diaryActions = document.getElementById('diaryActions');
                if (diaryActions) {
                    diaryActions.style.display = 'flex';
                }
            } else {
                // 没有当前日期的日记数据，隐藏日记区域
                // 但如果用户刚完成分析，可能想要生成日记，所以保持隐藏状态
                diarySection.style.display = 'none';
            }
        } catch (error) {
            console.warn('加载日记数据失败:', error);
        }
    }

    // 初始化数据库连接
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

    // 加载数据库统计信息
    async loadDatabaseStats() {
        try {
            await this.initializeDatabase();
            
            const db = new MimirDB();
            await db.initialize();
            
            // 获取各类数据的统计
            const [historyRecords, diaryRecords, classifiedRecords, reportRecords] = await Promise.all([
                db.getAllHistory(),
                db.getAllDiaries(),
                db.getAllClassifiedData(),
                db.getAllAnnualReports()
            ]);
            
            // 显示统计信息
            this.displayDatabaseStats({
                historyCount: historyRecords.length,
                diaryCount: diaryRecords.length,
                classifiedCount: classifiedRecords.length,
                reportCount: reportRecords.length
            });
            
        } catch (error) {
            console.warn('加载数据库统计失败:', error);
        }
    }

    // 显示数据库统计信息
    displayDatabaseStats(stats) {
        // 在页面顶部添加数据库统计信息
        const statsContainer = document.getElementById('statsContainer');
        if (statsContainer) {
            const dbStatsHTML = `
                <div class="database-stats">
                    <h4>📊 数据库统计</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-number">${stats.historyCount.toLocaleString()}</span>
                            <span class="stat-label">历史记录</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${stats.diaryCount}</span>
                            <span class="stat-label">日记</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${stats.classifiedCount}</span>
                            <span class="stat-label">分类缓存</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${stats.reportCount}</span>
                            <span class="stat-label">年度报告</span>
                        </div>
                    </div>
                </div>
            `;
            
            // 如果已经存在数据库统计，则更新；否则添加
            const existingStats = statsContainer.querySelector('.database-stats');
            if (existingStats) {
                existingStats.outerHTML = dbStatsHTML;
            } else {
                statsContainer.insertAdjacentHTML('beforeend', dbStatsHTML);
            }
        }
    }

    async getDailyHistory(date) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getDailyHistory',
                date: date
            }, (response) => {
                resolve(response || []);
            });
        });
    }

    updateOverview() {
        const pageCount = this.currentData.length;
        const domains = new Set(this.currentData.map(item => new URL(item.url).hostname));
        const domainCount = domains.size;

        // 计算活跃时段
        let activeTime = '暂无数据';
        if (this.currentData.length > 0) {
            const timestamps = this.currentData.map(item => item.timestamp);
            const avgTime = new Date(timestamps.reduce((a, b) => a + b, 0) / timestamps.length);
            activeTime = avgTime.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        document.getElementById('pageCount').textContent = pageCount;
        document.getElementById('domainCount').textContent = domainCount;
        document.getElementById('activeTime').textContent = activeTime;
    }

    renderHistoryList() {
        const historyList = document.getElementById('historyList');

        if (this.currentData.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    📭 今天还没有浏览记录
                </div>
            `;
            return;
        }

        const historyHTML = this.currentData.map(item => `
            <div class="history-item">
                <div class="history-time">${new Date(item.timestamp).toLocaleTimeString('zh-CN')}</div>
                <div class="history-content">
                    <div class="history-title">${item.title}</div>
                    <div class="history-url">${item.url}</div>
                </div>
            </div>
        `).join('');

        historyList.innerHTML = historyHTML;
    }

    // 主要功能：数据分析
    async analyzeData() {
        try {
            if (this.currentData.length === 0) {
                this.showError('今天没有浏览数据，无法进行分析');
                return;
            }

            // 检查网络连接
            if (!navigator.onLine) {
                this.showError('网络连接不可用，请检查网络设置后重试');
                return;
            }

            // 获取设置
            const settings = await window.dbWrapper.get('mimir-config');
            const config = settings['mimir-config'] || {};

            if (!config.apiKey) {
                this.showError('请先在设置中配置API Key');
                this.openSettings();
                return;
            }

            if (!config.apiUrl) {
                this.showError('请先在设置中配置API地址');
                this.openSettings();
                return;
            }

            // 显示分析加载状态
            this.showAnalysisLoading();

            // 数据分类与整合（使用小模型）
            const classifiedData = await this.classifyBrowsingData(this.currentData, config);

            // 显示分析结果
            this.displayAnalysis(classifiedData);

            // 保存分类数据
            const classifiedKey = `classified-${this.currentDate}`;
            await window.dbWrapper.set({ [classifiedKey]: classifiedData });

            // 显示导出和生成日记按钮
            this.showAnalysisButtons();

        } catch (error) {
            this.showError('数据分析失败: ' + error.message);
            this.hideAnalysisLoading();
        }
    }

    // 生成日记（自动包含数据分析）
    async generateDiary() {
        try {
            // 检查是否已有分析数据
            const classifiedKey = `classified-${this.currentDate}`;
            const result = await window.dbWrapper.get(classifiedKey);
            let classifiedData = result[classifiedKey];

            // 如果没有分析数据，先自动进行分析
            if (!classifiedData) {
                console.log('没有分析数据，先自动进行数据分析...');
                try {
                    await this.analyzeData();
                    // 重新获取分析数据
                    const newResult = await window.dbWrapper.get(classifiedKey);
                    classifiedData = newResult[classifiedKey];
                    
                    if (!classifiedData) {
                        this.showError('数据分析失败，无法生成日记');
                        return;
                    }
                } catch (error) {
                    this.showError('自动数据分析失败: ' + error.message);
                    return;
                }
            }

            // 获取设置
            const settings = await window.dbWrapper.get('mimir-config');
            const config = settings['mimir-config'] || {};

            if (!config.apiKey) {
                this.showError('请先在设置中配置API Key');
                this.openSettings();
                return;
            }

            // 显示日记生成区域
            document.getElementById('diarySection').style.display = 'block';
            this.showDiaryLoading();

            console.log('开始生成日记...');

            // 生成反思日记（使用大模型）
            const diary = await this.generateReflectiveDiary(classifiedData, config);

            if (!diary || diary.trim() === '') {
                throw new Error('AI返回空日记内容');
            }

            console.log('日记生成成功，长度:', diary.length);

            // 显示结果（流式传输时内容已经实时显示了）
            if (config.enableStreaming === false) {
                this.displayDiary(diary);
            }
            
            // 显示操作按钮
            const diaryActions = document.getElementById('diaryActions');
            if (diaryActions) {
                diaryActions.style.display = 'flex';
            }

            // 保存日记
            const diaryKey = `diary-${this.currentDate}`;
            await window.dbWrapper.set({ [diaryKey]: diary });

        } catch (error) {
            console.error('生成日记失败:', error);
            this.showError('生成日记失败: ' + error.message);
            this.hideDiaryLoading();
        }
    }

    formatBrowsingData(data) {
        return data.map((item, index) =>
            `${index + 1}. [${new Date(item.timestamp).toLocaleTimeString('zh-CN')}] ${item.title} (${item.url})`
        ).join('\n');
    }

    // 数据预处理
    preprocessData(data) {
        return data
            .filter(item => !this.shouldFilterItem(item))
            .map(item => {
                // 从URL中提取domain
                let domain = '';
                try {
                    domain = new URL(item.url).hostname;
                } catch (error) {
                    console.warn('无法解析URL:', item.url);
                    domain = '';
                }

                return {
                    ...item,
                    domain: this.normalizeDomain(domain),
                    timeSlot: this.getTimeSlot(item.timestamp)
                };
            });
    }

    // 判断是否应该过滤掉某个条目
    shouldFilterItem(item) {
        const title = item.title || '';
        const url = item.url || '';

        return this.filterPatterns.some(pattern =>
            title.includes(pattern) || url.includes(pattern)
        );
    }

    // 规范化域名
    normalizeDomain(domain) {
        if (!domain) return '';

        // 移除 www. 前缀
        domain = domain.replace(/^www\./, '');

        // 处理特殊情况
        if (domain.includes('console.cloud.google.com')) return 'console.cloud.google.com';
        if (domain.includes('ai.google.dev')) return 'ai.google.dev';
        if (domain.includes('docs.google.com')) return 'docs.google.com';

        return domain;
    }

    // 获取时间段（2小时粒度）
    getTimeSlot(timestamp) {
        // 防御性编程：确保timestamp是有效的
        if (!timestamp || isNaN(timestamp)) {
            console.warn('无效的timestamp:', timestamp);
            return '00:00-01:59'; // 返回默认时间段
        }

        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            console.warn('无法解析的timestamp:', timestamp);
            return '00:00-01:59'; // 返回默认时间段
        }

        const hour = date.getHours();
        const slotStart = Math.floor(hour / 2) * 2;
        const slotEnd = slotStart + 1;
        return `${slotStart.toString().padStart(2, '0')}:00-${slotEnd.toString().padStart(2, '0')}:59`;
    }

    // 智能添加关键标题（去重和优化）
    addKeyTitle(categoryStats, title) {
        // 清理标题
        const cleanTitle = this.cleanTitle(title);

        // 如果标题太短或无意义，跳过
        if (cleanTitle.length < 3 || this.isUnmeaningfulTitle(cleanTitle)) {
            return;
        }

        // 检查是否已有相似标题
        const isDuplicate = categoryStats.keyTitles.some(existingTitle =>
            this.isSimilarTitle(cleanTitle, existingTitle)
        );

        if (!isDuplicate && categoryStats.keyTitles.length < 5) {
            categoryStats.keyTitles.push(cleanTitle);
        }
    }

    // 清理标题
    cleanTitle(title) {
        return title
            .replace(/\s+at\s+[a-zA-Z0-9.-]+$/gi, '') // 移除 "at domain" 后缀
            .replace(/\s*-\s*[a-zA-Z0-9.-]+\.(com|org|net|io|dev|cn)$/gi, '') // 移除 "- domain.com" 后缀
            .replace(/^[a-zA-Z0-9.-]+\.(com|org|net|io|dev|cn)\s*[-:]\s*/gi, '') // 移除域名前缀
            .replace(/\s*\|\s*[a-zA-Z0-9.-]+$/gi, '') // 移除 "| sitename" 后缀
            .replace(/\s*·\s*[a-zA-Z0-9.-]+$/gi, '') // 移除 "· sitename" 后缀
            .replace(/\s+/g, ' ') // 合并多个空格
            .trim();
    }

    // 判断是否为无意义标题
    isUnmeaningfulTitle(title) {
        const meaninglessPatterns = [
            /^(new tab|blank|untitled|loading|error|404|403|500)$/i,
            /^[a-z0-9]+$/i, // 纯字母数字
            /^[\d\s\-_]+$/, // 纯数字和符号
            /^(home|index|main|default)$/i
        ];

        return meaninglessPatterns.some(pattern => pattern.test(title));
    }

    // 判断标题是否相似
    isSimilarTitle(title1, title2) {
        // 转换为小写进行比较
        const t1 = title1.toLowerCase();
        const t2 = title2.toLowerCase();

        // 完全相同
        if (t1 === t2) return true;

        // 一个是另一个的子串
        if (t1.includes(t2) || t2.includes(t1)) return true;

        // 计算相似度（简单的词汇重叠）
        const words1 = t1.split(/\s+/).filter(w => w.length > 2);
        const words2 = t2.split(/\s+/).filter(w => w.length > 2);

        if (words1.length === 0 || words2.length === 0) return false;

        const commonWords = words1.filter(w => words2.includes(w));
        const similarity = commonWords.length / Math.max(words1.length, words2.length);

        return similarity > 0.6; // 60%以上相似度认为是重复
    }

    // 规则优先分类
    ruleBasedClassification(data) {
        const categoryStats = {};
        const domainCount = {};
        const timeSlotCount = {};

        // 初始化分类统计
        this.categories.forEach(category => {
            categoryStats[category] = {
                name: category,
                count: 0,
                domains: new Set(),
                keyTitles: [],
                items: []
            };
        });

        // 分类每个条目
        data.forEach(item => {
            const category = this.classifyItem(item);
            categoryStats[category].count++;
            categoryStats[category].domains.add(item.domain);
            categoryStats[category].items.push(item);

            // 智能收集关键标题（去重和优化）
            this.addKeyTitle(categoryStats[category], item.title);

            // 统计域名频次
            domainCount[item.domain] = (domainCount[item.domain] || 0) + 1;

            // 统计时间段
            timeSlotCount[item.timeSlot] = (timeSlotCount[item.timeSlot] || 0) + 1;
        });

        // 计算每个分类的活跃时间段
        Object.values(categoryStats).forEach(category => {
            if (category.items.length > 0) {
                const timeSlots = {};
                category.items.forEach(item => {
                    timeSlots[item.timeSlot] = (timeSlots[item.timeSlot] || 0) + 1;
                });

                const mostActiveSlot = Object.entries(timeSlots)
                    .sort(([, a], [, b]) => b - a)[0];
                category.timeRange = mostActiveSlot ? mostActiveSlot[0] : '';
            }
        });

        // 获取全局活跃时段
        const peakHours = Object.entries(timeSlotCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([slot]) => slot);

        // 获取访问最多的域名
        const topDomains = Object.entries(domainCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([domain, count]) => ({ domain, count }));

        return {
            date: this.currentDate,
            totalItems: data.length,
            categories: Object.values(categoryStats)
                .filter(cat => cat.count > 0)
                .map(cat => ({
                    name: cat.name,
                    count: cat.count,
                    domains: Array.from(cat.domains).slice(0, 10),
                    keyTitles: cat.keyTitles,
                    timeRange: cat.timeRange
                })),
            peakHours,
            topDomains
        };
    }

    // 分类单个条目
    classifyItem(item) {
        const domain = item.domain || '';
        const title = (item.title || '').toLowerCase();

        // 0. 自定义规则优先匹配
        if (this.customRules && this.customRules.length > 0) {
            for (const rule of this.customRules) {
                if (rule.type === 'domain' && domain.includes(rule.value)) {
                    console.log(`自定义域名规则匹配: ${domain} → ${rule.category}`);
                    return rule.category;
                }
                if (rule.type === 'keyword' && title.includes(rule.value)) {
                    console.log(`自定义关键词规则匹配: ${title} → ${rule.category}`);
                    return rule.category;
                }
            }
        }

        // 1. 域名优先匹配
        for (const [category, domains] of Object.entries(this.domainMapping)) {
            if (domains.some(d => domain.includes(d))) {
                return category;
            }
        }

        // 2. 关键词匹配
        for (const [category, keywords] of Object.entries(this.keywordMapping)) {
            if (keywords.some(keyword => title.includes(keyword.toLowerCase()))) {
                return category;
            }
        }

        // 3. 特殊规则处理
        if (domain.includes('zhihu.com')) {
            if (domain.includes('zhuanlan')) return '新闻与资讯';
            return '社交与社区';
        }

        if (domain.includes('slack.com') || domain.includes('discord.com')) {
            if (title.includes('文档') || title.includes('项目') || title.includes('工作')) {
                return '工作与生产力';
            }
            return '社交与社区';
        }

        // 4. 默认归类到"其他"
        return '其他';
    }

    // 解析AI响应，处理可能的JSON格式问题
    parseAIResponse(response) {
        if (!response || response.trim() === '') {
            console.error('AI响应为空');
            return null;
        }

        console.log('开始解析AI响应，长度:', response.length);

        try {
            // 首先尝试直接解析
            const result = JSON.parse(response);
            console.log('直接JSON解析成功');
            return result;
        } catch (error) {
            console.error('直接JSON解析失败:', error.message);
            console.log('原始响应前200字符:', response.substring(0, 200));

            try {
                // 尝试清理响应内容
                let cleanedResponse = response.trim();

                // 移除可能的markdown代码块标记
                cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

                // 移除可能的前后文字说明
                cleanedResponse = cleanedResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

                // 查找JSON对象的开始和结束
                const jsonStart = cleanedResponse.indexOf('{');
                const jsonEnd = cleanedResponse.lastIndexOf('}');

                if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
                    console.error('未找到有效的JSON结构');
                    console.error('搜索范围:', cleanedResponse.substring(0, 100));
                    return null;
                }

                cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);
                console.log('提取的JSON部分长度:', cleanedResponse.length);

                // 尝试修复常见的JSON问题
                cleanedResponse = cleanedResponse
                    .replace(/,\s*}/g, '}')     // 移除对象尾随逗号
                    .replace(/,\s*]/g, ']')     // 移除数组尾随逗号
                    .replace(/\n/g, '\\n')      // 转义换行符
                    .replace(/\r/g, '\\r')      // 转义回车符
                    .replace(/\t/g, '\\t')      // 转义制表符
                    .replace(/\\/g, '\\\\')     // 转义反斜杠
                    .replace(/"/g, '\\"')       // 转义引号
                    .replace(/\\"/g, '"')       // 恢复正常引号
                    .replace(/\\\\/g, '\\');    // 恢复正常反斜杠

                // 尝试逐步修复引号问题
                const lines = cleanedResponse.split('\n');
                const fixedLines = lines.map(line => {
                    // 修复标题中的引号问题
                    if (line.includes('"keyTitles"') || line.includes('"domains"')) {
                        return line.replace(/([^\\])"/g, (match, p1) => {
                            if (p1 === ':' || p1 === '[' || p1 === ',') {
                                return match;
                            }
                            return p1 + '\\"';
                        });
                    }
                    return line;
                });
                cleanedResponse = fixedLines.join('\n');

                console.log('清理后的JSON前200字符:', cleanedResponse.substring(0, 200));

                const result = JSON.parse(cleanedResponse);
                console.log('JSON清理后解析成功');
                return result;

            } catch (secondError) {
                console.error('清理后JSON解析仍失败:', secondError.message);
                console.error('最终清理后的响应前200字符:', cleanedResponse ? cleanedResponse.substring(0, 200) : 'undefined');

                // 尝试最后的修复方案：手动构建基本结构
                try {
                    console.log('尝试从响应中提取基本信息...');
                    const basicResult = this.extractBasicInfoFromResponse(response);
                    if (basicResult) {
                        console.log('成功提取基本信息');
                        return basicResult;
                    }
                } catch (extractError) {
                    console.error('提取基本信息也失败:', extractError.message);
                }

                return null;
            }
        }
    }

    // 从损坏的响应中提取基本信息
    extractBasicInfoFromResponse(response) {
        try {
            // 尝试提取日期
            const dateMatch = response.match(/"date":\s*"([^"]+)"/);
            const date = dateMatch ? dateMatch[1] : this.currentDate;

            // 尝试提取总数
            const totalMatch = response.match(/"totalItems":\s*(\d+)/);
            const totalItems = totalMatch ? parseInt(totalMatch[1]) : 0;

            // 构建基本结构
            return {
                date: date,
                totalItems: totalItems,
                categories: [],
                peakHours: [],
                topDomains: []
            };
        } catch (error) {
            console.error('提取基本信息失败:', error);
            return null;
        }
    }

    // 合并规则分类和AI分类结果
    mergeClassificationResults(ruleResult, aiResult, originalData) {
        if (!aiResult || !aiResult.categories) {
            console.log('AI结果为空，返回规则分类结果');
            return ruleResult;
        }

        console.log('开始合并分类结果...');
        console.log('规则分类类别数:', ruleResult.categories.length);
        console.log('AI分类类别数:', aiResult.categories.length);

        // 创建合并后的分类统计
        const mergedCategories = {};

        // 先添加规则分类的结果（除了"其他"）
        ruleResult.categories.forEach(category => {
            if (category.name !== '其他') {
                mergedCategories[category.name] = { ...category };
            }
        });

        // 统计AI重新分类的成功数量
        let aiReclassifiedCount = 0;
        let remainingOtherCount = 0;

        // 合并AI分类的结果
        aiResult.categories.forEach(aiCategory => {
            if (aiCategory.name === '其他') {
                remainingOtherCount += aiCategory.count;
                return;
            }

            aiReclassifiedCount += aiCategory.count;

            if (mergedCategories[aiCategory.name]) {
                // 合并到已有分类
                mergedCategories[aiCategory.name].count += aiCategory.count;
                mergedCategories[aiCategory.name].domains = [
                    ...new Set([
                        ...mergedCategories[aiCategory.name].domains,
                        ...aiCategory.domains
                    ])
                ].slice(0, 10);
                mergedCategories[aiCategory.name].keyTitles = [
                    ...mergedCategories[aiCategory.name].keyTitles,
                    ...aiCategory.keyTitles
                ].slice(0, 5);
            } else {
                // 新增分类
                mergedCategories[aiCategory.name] = aiCategory;
            }
        });

        // 处理剩余的"其他"类别
        if (remainingOtherCount > 0) {
            // 获取原始"其他"类别的详细信息
            const originalOther = ruleResult.categories.find(cat => cat.name === '其他');
            mergedCategories['其他'] = {
                name: '其他',
                count: remainingOtherCount,
                domains: originalOther?.domains || [],
                keyTitles: originalOther?.keyTitles || [],
                timeRange: originalOther?.timeRange || ''
            };
        }

        // 记录AI分类效果
        const originalOtherCount = ruleResult.categories.find(cat => cat.name === '其他')?.count || 0;
        const classificationImprovement = originalOtherCount - remainingOtherCount;

        console.log(`AI分类效果: 原始"其他"${originalOtherCount}个，成功重分类${aiReclassifiedCount}个，剩余${remainingOtherCount}个`);

        if (classificationImprovement > 0) {
            this.showAIClassificationStatus(
                `AI成功重新分类了${classificationImprovement}个条目，分类覆盖率提升${((classificationImprovement / originalOtherCount) * 100).toFixed(1)}%`,
                'success'
            );
        }

        const result = {
            date: this.currentDate,
            totalItems: originalData.length,
            categories: Object.values(mergedCategories).filter(cat => cat.count > 0),
            peakHours: ruleResult.peakHours,
            topDomains: ruleResult.topDomains,
            aiClassificationSummary: {
                originalOtherCount,
                reclassifiedCount: aiReclassifiedCount,
                remainingOtherCount,
                improvementRate: originalOtherCount > 0 ? (classificationImprovement / originalOtherCount * 100).toFixed(1) : 0
            }
        };

        console.log('分类结果合并完成');
        return result;
    }

    // 阶段一：数据分类与整合（小模型）
    async classifyBrowsingData(data, config) {
        // 加载自定义规则
        this.customRules = config.customRules || [];
        console.log(`加载了 ${this.customRules.length} 个自定义规则`);

        // 预处理数据
        const preprocessedData = this.preprocessData(data);

        // 先尝试规则分类
        const ruleBasedResult = this.ruleBasedClassification(preprocessedData);

        // 检查是否启用AI增强分类和API配置
        if (!config.useAIClassification || !config.apiKey) {
            console.log('AI增强分类已禁用或未配置API Key，使用规则分类结果');
            return ruleBasedResult;
        }

        // 检查是否需要AI增强分类
        const uncategorizedCount = ruleBasedResult.categories.find(cat => cat.name === '其他')?.count || 0;
        const coverageRate = preprocessedData.length > 0 ? (preprocessedData.length - uncategorizedCount) / preprocessedData.length : 1;

        console.log(`规则分类覆盖率: ${(coverageRate * 100).toFixed(1)}% (${preprocessedData.length - uncategorizedCount}/${preprocessedData.length})`);
        console.log(`未分类条目数: ${uncategorizedCount}`);

        // 降低阈值到60%，或者未分类条目超过3个就启用AI分类
        if (coverageRate > 0.6 && uncategorizedCount <= 3) {
            console.log('规则分类覆盖率较高且未分类条目较少，直接使用规则结果');
            return ruleBasedResult;
        }

        // 覆盖率不够，尝试使用AI增强分类
        try {
            const classificationPrompt = this.buildEnhancedClassificationPrompt(preprocessedData, ruleBasedResult);

            if (!classificationPrompt) {
                console.log('无需AI增强分类，使用规则分类结果');
                return ruleBasedResult;
            }

            const classificationConfig = {
                ...config,
                model: config.model || 'gpt-3.5-turbo',
                temperature: 0.1
            };
            
            console.log('🔍 分析模型配置:', {
                userSetModel: config.model,
                actualModel: classificationConfig.model,
                isUsingDefault: !config.model || config.model === 'gpt-3.5-turbo'
            });

            console.log('开始AI增强分类...');

            // 显示AI分类状态
            this.showAIClassificationStatus('正在调用AI进行智能分类...');

            const classificationResult = await this.callAIAPI(classificationPrompt, classificationConfig);

            if (!classificationResult || classificationResult.trim() === '') {
                console.warn('AI返回空响应，使用规则分类结果');
                this.showAIClassificationStatus('AI返回空响应，使用规则分类结果', 'warning');
                return ruleBasedResult;
            }

            console.log('AI分类原始响应:', classificationResult.substring(0, 200) + '...');

            const aiResult = this.parseAIResponse(classificationResult);

            if (!aiResult) {
                console.error('AI分类结果解析失败，使用规则分类结果');
                this.showAIClassificationStatus('AI分类结果解析失败，使用规则分类结果', 'error');
                return ruleBasedResult;
            }

            console.log('AI增强分类成功，合并结果');
            this.showAIClassificationStatus('AI分类成功，已合并结果', 'success');
            return this.mergeClassificationResults(ruleBasedResult, aiResult, preprocessedData);

        } catch (error) {
            console.error('AI分类失败，使用规则分类结果:', error);
            this.showAIClassificationStatus(`AI分类失败: ${error.message}，使用规则分类结果`, 'error');
            return ruleBasedResult;
        }
    }

    // 阶段二：日记生成与反思（大模型）
    async generateReflectiveDiary(classifiedData, config) {
        const diaryPrompt = await this.buildDiaryPrompt(classifiedData, config);

        // 使用大模型进行日记生成
        const diaryConfig = {
            ...config,
            model: config.diaryModel || config.model || 'gpt-4', // 使用大模型
            temperature: 0.7 // 适中的创造性
        };
        
        console.log('✨ 日记模型配置:', {
            userSetDiaryModel: config.diaryModel,
            userSetAnalysisModel: config.model,
            actualModel: diaryConfig.model,
            fallbackChain: 'diaryModel → model → gpt-4'
        });

        // 检查是否启用流式传输
        if (config.enableStreaming !== false) { // 默认启用流式传输
            return await this.generateDiaryWithStreaming(diaryPrompt, diaryConfig);
        } else {
            return await this.callAIAPI(diaryPrompt, diaryConfig);
        }
    }

    async generateDiaryWithStreaming(prompt, config) {
        try {
            const response = await this.callAIAPI(prompt, config, true);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            let fullContent = '';
            const diaryContent = document.getElementById('diaryContent');
            
            // 清空现有内容并显示光标
            diaryContent.innerHTML = '<span class="typing-cursor">|</span>';
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            continue;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            
                            if (delta) {
                                fullContent += delta;
                                // 实时更新显示内容
                                diaryContent.innerHTML = this.formatDiaryContent(fullContent) + '<span class="typing-cursor">|</span>';
                                // 滚动到底部
                                diaryContent.scrollTop = diaryContent.scrollHeight;
                            }
                        } catch (e) {
                            // 忽略解析错误，继续处理下一行
                            console.warn('解析流式数据失败:', e);
                        }
                    }
                }
            }
            
            // 移除光标
            diaryContent.innerHTML = this.formatDiaryContent(fullContent);
            
            return fullContent;
            
        } catch (error) {
            console.error('流式生成日记失败:', error);
            throw error;
        }
    }

    formatDiaryContent(content) {
        // 使用markdown渲染
        return this.parseMarkdown(content);
    }

    // 改进的markdown解析器
    parseMarkdown(text) {
        if (!text) return '';
        
        // 先按行分割处理，避免跨行匹配问题
        const lines = text.split('\n');
        const processedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // 处理标题（必须在行首）
            if (line.match(/^### /)) {
                line = line.replace(/^### (.*)$/, '<h3>$1</h3>');
            } else if (line.match(/^## /)) {
                line = line.replace(/^## (.*)$/, '<h2>$1</h2>');
            } else if (line.match(/^# /)) {
                line = line.replace(/^# (.*)$/, '<h1>$1</h1>');
            }
            // 处理分隔线
            else if (line.match(/^---+$/)) {
                line = '<hr>';
            } else if (line.match(/^\*\*\*+$/)) {
                line = '<hr>';
            }
            // 处理引用
            else if (line.match(/^> /)) {
                line = line.replace(/^> (.*)$/, '<blockquote>$1</blockquote>');
            }
            // 处理任务列表
            else if (line.match(/^- \[ \] /)) {
                line = line.replace(/^- \[ \] (.*)$/, '<li class="task-item"><input type="checkbox" disabled> $1</li>');
            } else if (line.match(/^- \[x\] /)) {
                line = line.replace(/^- \[x\] (.*)$/, '<li class="task-item"><input type="checkbox" checked disabled> $1</li>');
            }
            // 处理无序列表
            else if (line.match(/^[\*\-\+] /)) {
                line = line.replace(/^[\*\-\+] (.*)$/, '<li>$1</li>');
            }
            // 处理有序列表
            else if (line.match(/^\d+\. /)) {
                line = line.replace(/^\d+\. (.*)$/, '<li>$1</li>');
            }
            
            processedLines.push(line);
        }
        
        // 重新组合
        let html = processedLines.join('\n');
        
        // 处理行内格式
        // 处理粗体（避免与斜体冲突）
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        
        // 处理斜体（在粗体之后处理，避免与粗体冲突）
        // 先处理不被**包围的*文本*
        html = html.replace(/([^*]|^)\*([^*\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3');
        // 处理不被__包围的_文本_
        html = html.replace(/([^_]|^)_([^_\n]+?)_([^_]|$)/g, '$1<em>$2</em>$3');
        
        // 处理代码块
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        html = html.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
        
        // 处理链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // 将连续的<li>包装在<ul>或<ol>中
        html = html.replace(/(<li(?:\s+class="[^"]*")?>[^<]*<\/li>(?:\s*\n\s*<li(?:\s+class="[^"]*")?>[^<]*<\/li>)*)/gs, (match) => {
            if (match.includes('class="task-item"')) {
                return '<ul class="task-list">' + match + '</ul>';
            } else {
                return '<ul>' + match + '</ul>';
            }
        });
        
        // 处理段落（双换行符分隔）
        html = html.replace(/\n\n+/g, '</p>\n<p>');
        
        // 处理单个换行符
        html = html.replace(/\n/g, '<br>\n');
        
        // 包装在段落标签中
        html = '<p>' + html + '</p>';
        
        // 清理空段落和修复嵌套问题
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ul.*?<\/ul>)<\/p>/gs, '$1');
        html = html.replace(/<p>(<ol.*?<\/ol>)<\/p>/gs, '$1');
        html = html.replace(/<p>(<blockquote>.*?<\/blockquote>)<\/p>/g, '$1');
        html = html.replace(/<p>(<pre>.*?<\/pre>)<\/p>/gs, '$1');
        html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
        
        // 清理多余的<br>标签
        html = html.replace(/<br>\s*(<\/p>)/g, '$1');
        html = html.replace(/(<h[1-6]>.*?<\/h[1-6]>)<br>/g, '$1');
        html = html.replace(/(<hr>)<br>/g, '$1');
        html = html.replace(/(<\/blockquote>)<br>/g, '$1');
        html = html.replace(/(<\/ul>)<br>/g, '$1');
        html = html.replace(/(<\/ol>)<br>/g, '$1');
        html = html.replace(/(<\/pre>)<br>/g, '$1');
        
        return html;
    }

    buildEnhancedClassificationPrompt(data, ruleBasedResult) {
        // 只对"其他"类别的条目进行AI分类
        const uncategorizedItems = data.filter(item =>
            this.classifyItem(item) === '其他'
        ).map(item => ({
            title: item.title,
            domain: item.domain,
            timestamp: new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        }));

        if (uncategorizedItems.length === 0) {
            return null;
        }

        return `你是一个专业的网站分类专家。请对以下未能被规则分类的浏览记录进行智能分类。

## 分类目标
对这些"其他"类别的浏览记录进行重新分类，尽可能减少"其他"类别的条目数量。

## 预设分类体系
1. **编程与开发** - 代码、开发工具、技术文档、云服务等
2. **工作与生产力** - 办公软件、项目管理、邮件、会议等  
3. **新闻与资讯** - 新闻网站、博客、资讯平台等
4. **娱乐与视频** - 视频网站、游戏、音乐、娱乐内容等
5. **社交与社区** - 社交网络、论坛、聊天工具等
6. **生活与消费** - 购物、外卖、旅行、生活服务等
7. **学术与教育** - 学术论文、在线课程、教育资源等
8. **NSFW** - 一些R18或者私密的网站
9. **其他** - 真正无法归类的内容

## 分类策略
1. **优先考虑域名特征**：根据网站域名判断其主要功能
2. **分析页面标题**：从标题中提取关键信息判断内容类型
3. **语义理解**：理解网站的实际用途和内容性质
4. **宽松分类**：当有多个可能分类时，选择最合适的一个，避免归入"其他"

## 需要重新分类的条目
共 ${uncategorizedItems.length} 个条目：
${JSON.stringify(uncategorizedItems, null, 2)}

## 输出要求
请严格按照以下JSON格式返回，不要添加任何解释文字：

{
  "date": "${this.currentDate}",
  "totalItems": ${uncategorizedItems.length},
  "categories": [
    {
      "name": "分类名称",
      "count": 条目数量,
      "domains": ["域名列表"],
      "keyTitles": ["代表性标题列表"],
      "timeRange": "活跃时间段"
    }
  ],
  "peakHours": ["活跃时间段"],
  "topDomains": [{"domain": "域名", "count": 访问次数}],
  "reclassificationSummary": {
    "totalProcessed": ${uncategorizedItems.length},
    "successfullyClassified": 0,
    "remainingOther": 0
  }
}

注意事项：
- 尽量将条目分配到前8个类别中
- 只有真正无法判断的才归入"其他"
- 确保JSON格式正确，字符串用双引号
- 标题中的特殊字符需要正确转义`;
    }

    async buildDiaryPrompt(classifiedData, config) {
        const customPrompt = config.customPrompt || '';

        // 基础数据上下文（始终包含）
        const dataContext = `基于以下经过分类整理的浏览数据摘要：

数据摘要：
${JSON.stringify(classifiedData, null, 2)}

分析日期：${this.currentDate}
总浏览量：${classifiedData.totalItems} 条
分类数量：${classifiedData.categories?.length || 0} 类
主要活跃时段：${classifiedData.peakHours?.join(', ') || '未知'}`;

        // 获取前一天日记用于对比（如果启用了对比功能）
        let comparisonContext = '';
        if (config.enableDiaryComparison) {
            const previousDiary = await this.getPreviousDiary();
            if (previousDiary) {
                comparisonContext = `

前一天日记内容：
${previousDiary}

对比要求：请分析今天与前一天的行为模式变化，识别进步、退步或新的模式。`;
            }
        }

        // 默认认知模式分析提示词
        const defaultCognitivePrompt = `
Profile:
- language: 中文
- description: 一个客观、深刻的分析引擎，基于结构化的浏览摘要，生成一份纯文本的"认知模式快报"。分析聚焦于行为模式而非个人评价，语言冷静、克制且精确。

CoreLogic & Rules:
1. 分析框架 (MentalModels): 你必须严格使用内置的四层"思想阶梯"框架来静默分析所有活动，但不要在输出中直接提及阶梯名称。
- 阶梯一 (本能与冲动): 即时满足驱动。如：刷短视频、看八卦、冲动消费。
- 阶梯二 (规则与角色): 外部规则与社会角色驱动。如：完成工作任务、学习专业技能、处理日程。
- 阶梯三 (自我与反思): 内在探索与个人价值驱动。如：搜索哲学问题、进行自我分析、规划人生。
- 阶梯四 (整合与超越): 系统性思考与利他驱动。如：参与开源贡献、研究宏观议题。

2. 工作流 (Workflow):
- [映射]: 接收输入数据，将每一条活动无声地映射到上述思想阶梯。
- [识别]: 确定当天注意力的主导模式（活动最集中的阶梯）和次要/冲突模式（零星但关键的活动）。识别模式间的能量流动（例如，是从任务执行"泄压"到本能冲动，还是从规则执行"跃迁"到自我反思）。
- [生成]: 严格按照 [OutputFormat] 输出报告。

3. 风格戒律 (Style Commandments):
- 纯文本: 绝对禁止使用任何Markdown标记（如\`\`, \`\`, \`-\`, \`>\`）、代码块或表格。仅限纯文本、标准中文标点和空行。
- 语气: 冷静、克制、精确。多用短句和并列句，形成干脆的节奏。
- 术语: 可以刀子嘴，犀利的指出用户今天在干什么，锐评他，监督他！Roast 他！
- 证据为王: 所有分析性陈述后必须紧跟括号标注的证据。格式：\`(证据: "标题1", "标题2", ...)\`。
- 三段式洞察: 洞察点遵循"定性陈述 + 最小证据 + 开放式追问"的结构。
- 绝对禁忌: 禁止使用第一人称（我/我们）；禁止任何形式的说教、鼓励、建议或评价；结尾不追加任何总结或提问。

Initialization:
作为认知模式分析师，你将直接接收用户的结构化浏览摘要。无需欢迎语，在接收到数据后，立即开始静默分析并严格按照 [OutputFormat] 输出报告。

请基于以上数据生成认知模式快报：`;

        if (customPrompt.trim()) {
            // 如果有自定义提示词，将其与数据上下文结合
            return `${dataContext}${comparisonContext}

自定义要求：
${customPrompt}

请基于以上数据和要求生成日记：`;
        } else {
            // 使用默认的认知模式分析提示词
            return `${dataContext}${comparisonContext}${defaultCognitivePrompt}`;
        }
    }

    // 获取前一天的日记
    async getPreviousDiary() {
        try {
            const currentDate = new Date(this.currentDate);
            currentDate.setDate(currentDate.getDate() - 1);
            const previousDate = MimirConfig.formatDateLocal(currentDate);
            
            const diaryKey = `diary-${previousDate}`;
            const result = await window.dbWrapper.get(diaryKey);
            return result[diaryKey] || null;
        } catch (error) {
            console.warn('获取前一天日记失败:', error);
            return null;
        }
    }

    createFallbackClassification(data) {
        // 使用规则分类作为备选方案
        const preprocessedData = this.preprocessData(data);
        return this.ruleBasedClassification(preprocessedData);
    }

    buildPrompt(browsingData, config) {
        const customPrompt = config.customPrompt || '';

        const defaultPrompt = `
基于以下今日的浏览历史，请用中文为我写一篇温暖、深刻的反思日记。日记应该：

1. 以"今天是[日期]..."开头
2. 总结今天的主要活动和兴趣点
3. 分析我的学习轨迹和思考模式
4. 给出温和的建议或启发
5. 用亲切、自然的语言，像朋友聊天一样
6. 避免过于正式的表达

今日浏览历史：
${browsingData}

请生成一篇个性化的日记：
        `;

        return customPrompt || defaultPrompt;
    }

    async callAIAPI(prompt, config, isStreaming = false) {
        try {
            // 检查网络连接
            if (!navigator.onLine) {
                throw new Error('网络连接不可用，请检查网络设置');
            }

            // 验证配置
            if (!config.apiUrl || !config.apiKey) {
                throw new Error('API配置不完整，请检查设置');
            }

            console.log('正在调用AI API...', {
                url: config.apiUrl,
                model: config.model || 'gpt-3.5-turbo',
                streaming: isStreaming,
                configModel: config.model,
                fallbackModel: 'gpt-3.5-turbo'
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 流式传输需要更长超时时间

            const requestBody = {
                model: config.model || 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: config.temperature || 0.7,
                stream: isStreaming
            };

            const response = await fetch(config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = '无法读取错误信息';
                }

                let errorMessage = `API调用失败 (${response.status})`;

                if (response.status === 401) {
                    errorMessage = 'API密钥无效，请检查设置';
                } else if (response.status === 429) {
                    errorMessage = 'API调用频率超限，请稍后重试';
                } else if (response.status === 500) {
                    errorMessage = 'API服务器错误，请稍后重试';
                } else if (errorText) {
                    try {
                        const errorData = JSON.parse(errorText);
                        if (errorData.error && errorData.error.message) {
                            errorMessage = errorData.error.message;
                        }
                    } catch (e) {
                        errorMessage += `: ${errorText.substring(0, 200)}`;
                    }
                }

                throw new Error(errorMessage);
            }

            if (isStreaming) {
                return response; // 返回response对象用于流式处理
            }

            // 非流式处理（保持原有逻辑）
            let data;
            try {
                const responseText = await response.text();
                console.log('API响应长度:', responseText.length);

                if (!responseText.trim()) {
                    throw new Error('API返回空响应');
                }

                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('解析API响应失败:', parseError);
                throw new Error('API响应格式错误，无法解析JSON');
            }

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('API响应结构异常:', data);
                throw new Error('API返回数据结构错误');
            }

            const content = data.choices[0].message.content;
            if (!content || content.trim() === '') {
                throw new Error('API返回内容为空');
            }

            console.log('AI API调用成功，返回内容长度:', content.length);
            return content.trim();

        } catch (error) {
            console.error('AI API调用失败:', error);

            // 处理特定错误类型
            if (error.name === 'AbortError') {
                throw new Error('API调用超时，请检查网络连接或稍后重试');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error('网络连接失败，请检查网络设置或API地址是否正确');
            }

            throw error;
        }
    }

    displayDiary(diary) {
        const diaryContent = document.getElementById('diaryContent');
        diaryContent.innerHTML = this.formatDiaryContent(diary);
    }

    showDiaryLoading() {
        const diaryContent = document.getElementById('diaryContent');
        diaryContent.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <span>AI正在生成日记...</span>
            </div>
        `;
    }

    hideDiaryLoading() {
        // 流式传输时不需要隐藏加载状态，因为内容会直接替换
    }

    displayDiaryComplete(diary) {
        const diaryContent = document.getElementById('diaryContent');
        diaryContent.innerHTML = this.formatDiaryContent(diary);
        
        // 显示日记操作按钮
        const diaryActions = document.getElementById('diaryActions');
        if (diaryActions) {
            diaryActions.style.display = 'flex';
        }
    }

    showAnalysisButtons() {
        console.log('🔧 显示分析按钮...');

        const exportBtn = document.getElementById('exportAnalysisBtn');

        if (exportBtn) {
            exportBtn.style.display = 'inline-block';
            console.log('✅ 导出分析按钮已显示');
        } else {
            console.error('❌ 找不到导出分析按钮');
        }

        // 确保分析操作区域可见
        const analysisActions = document.querySelector('.analysis-actions');
        if (analysisActions) {
            analysisActions.style.display = 'flex';
            console.log('✅ 分析操作区域已显示');
        }
    }

    hideAnalysisButtons() {
        const exportBtn = document.getElementById('exportAnalysisBtn');

        if (exportBtn) exportBtn.style.display = 'none';
    }

    formatDiaryText(text) {
        return text.replace(/\n/g, '<br>');
    }

    async copyDiary() {
        try {
            const diaryKey = `diary-${this.currentDate}`;
            const result = await window.dbWrapper.get(diaryKey);
            const diary = result[diaryKey];

            if (diary) {
                await navigator.clipboard.writeText(diary);
                this.showToast('日记已复制到剪贴板');
            }
        } catch (error) {
            this.showError('复制失败: ' + error.message);
        }
    }

    async saveDiary() {
        try {
            const diaryKey = `diary-${this.currentDate}`;
            const result = await window.dbWrapper.get(diaryKey);
            const diary = result[diaryKey];

            if (diary) {
                const blob = new Blob([diary], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mimir-diary-${this.currentDate}.txt`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            this.showError('保存失败: ' + error.message);
        }
    }

    openSettings() {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    }

    openDataManager() {
        chrome.tabs.create({ url: chrome.runtime.getURL('data-manager.html') });
    }

    openDataManager() {
        chrome.tabs.create({ url: chrome.runtime.getURL('data-manager.html') });
    }

    showLoading() {
        document.getElementById('historyList').innerHTML = `
            <div class="loading">正在加载数据...</div>
        `;
    }

    showAnalysisLoading() {
        document.getElementById('analysisLoadingSpinner').style.display = 'block';
        const placeholder = document.querySelector('#analysisContent .placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }

    hideAnalysisLoading() {
        document.getElementById('analysisLoadingSpinner').style.display = 'none';
    }



    showAIClassificationStatus(message, type = 'info') {
        console.log(`AI分类状态 [${type}]: ${message}`);

        // 可以在这里添加UI状态显示
        const statusElement = document.getElementById('aiClassificationStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `ai-status ${type}`;
            statusElement.style.display = 'block';

            // 3秒后自动隐藏成功和警告消息
            if (type === 'success' || type === 'warning') {
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 3000);
            }
        }
    }



    showError(message) {
        console.error('显示错误:', message);
        const errorDiv = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');

        // 增强错误信息
        let enhancedMessage = message;
        if (message.includes('Failed to fetch')) {
            enhancedMessage = '网络连接失败，请检查：\n1. 网络连接是否正常\n2. API地址是否正确\n3. 防火墙是否阻止了请求';
        } else if (message.includes('401')) {
            enhancedMessage = 'API密钥验证失败，请检查设置中的API Key是否正确';
        } else if (message.includes('429')) {
            enhancedMessage = 'API调用频率超限，请稍后重试';
        }

        errorText.textContent = enhancedMessage;
        errorDiv.style.display = 'block';

        // 自动隐藏非关键错误
        if (!message.includes('API') && !message.includes('网络')) {
            setTimeout(() => {
                this.closeError();
            }, 5000);
        }
    }

    closeError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    displayAnalysis(classifiedData) {
        this.hideAnalysisLoading();
        const analysisContent = document.getElementById('analysisContent');

        let html = `
            <div class="analysis-summary">
                <div class="summary-item">
                    <div class="summary-label">总浏览量</div>
                    <div class="summary-value">${classifiedData.totalItems} 条</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">分类数量</div>
                    <div class="summary-value">${classifiedData.categories?.length || 0} 类</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">分类覆盖率</div>
                    <div class="summary-value">${(() => {
                const otherCategory = classifiedData.categories?.find(cat => cat.name === '其他');
                const otherCount = otherCategory?.count || 0;
                const classifiedCount = classifiedData.totalItems - otherCount;
                return classifiedData.totalItems > 0 ? (classifiedCount / classifiedData.totalItems * 100).toFixed(1) + '%' : '0%';
            })()}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">活跃时段</div>
                    <div class="summary-value">${classifiedData.peakHours?.join(', ') || '未知'}</div>
                </div>
            </div>
            
            ${this.customRules && this.customRules.length > 0 ? `
            <div class="custom-rules-summary">
                <h4>🎯 自定义规则状态</h4>
                <div class="custom-rules-stats">
                    <div class="custom-stat-item">
                        <span class="custom-stat-label">已配置规则:</span>
                        <span class="custom-stat-value">${this.customRules.length} 个</span>
                    </div>
                    <div class="custom-stat-item">
                        <span class="custom-stat-label">域名规则:</span>
                        <span class="custom-stat-value">${this.customRules.filter(r => r.type === 'domain').length} 个</span>
                    </div>
                    <div class="custom-stat-item">
                        <span class="custom-stat-label">关键词规则:</span>
                        <span class="custom-stat-value">${this.customRules.filter(r => r.type === 'keyword').length} 个</span>
                    </div>
                </div>
            </div>` : ''}
            
            ${classifiedData.aiClassificationSummary ? `
            <div class="ai-classification-summary">
                <h4>🤖 AI智能分类效果</h4>
                <div class="ai-stats">
                    <div class="ai-stat-item">
                        <span class="ai-stat-label">原始"其他"条目:</span>
                        <span class="ai-stat-value">${classifiedData.aiClassificationSummary.originalOtherCount} 个</span>
                    </div>
                    <div class="ai-stat-item">
                        <span class="ai-stat-label">AI成功重分类:</span>
                        <span class="ai-stat-value success">${classifiedData.aiClassificationSummary.reclassifiedCount} 个</span>
                    </div>
                    <div class="ai-stat-item">
                        <span class="ai-stat-label">剩余"其他":</span>
                        <span class="ai-stat-value">${classifiedData.aiClassificationSummary.remainingOtherCount} 个</span>
                    </div>
                    <div class="ai-stat-item">
                        <span class="ai-stat-label">分类改进率:</span>
                        <span class="ai-stat-value improvement">${classifiedData.aiClassificationSummary.improvementRate}%</span>
                    </div>
                </div>
            </div>` : ''}
            
            <div class="raw-data-section">
                <h4>🔍 原始分析数据 (JSON)</h4>
                <div class="json-container">
                    <pre class="json-display">${JSON.stringify(classifiedData, null, 2)}</pre>
                    <button class="copy-json-btn" data-json='${JSON.stringify(classifiedData, null, 2)}'>📋 复制JSON</button>
                </div>
            </div>
            
            <div class="categories-grid">
        `;

        classifiedData.categories?.forEach((category, index) => {
            const isOtherCategory = category.name === '其他';
            const percentage = Math.round(category.count / classifiedData.totalItems * 100);

            html += `
                <div class="category-card" data-category="${category.name}">
                    <div class="category-header">
                        <h4>${category.name}${isOtherCategory ? ' ⚠️' : ''}</h4>
                        <span class="percentage">${percentage}%</span>
                    </div>
                    
                    <div class="category-meta">
                        <span class="category-count">${category.count} 条记录</span>
                        ${category.timeRange ? `<span class="category-time">${category.timeRange}</span>` : ''}
                    </div>
                    
                    <ul class="key-titles">
                        ${category.keyTitles?.slice(0, 5).map(title =>
                `<li title="${title}">${title.length > 60 ? title.substring(0, 60) + '...' : title}</li>`
            ).join('') || '<li class="category-empty">暂无关键内容</li>'}
                    </ul>
                    
                    <div class="main-domains">
                        <h5>主要网站</h5>
                        <div class="domain-list">
                            ${category.domains?.slice(0, 6).map(domain =>
                `<span class="domain-tag">${domain}</span>`
            ).join('') || '<span class="domain-tag">无数据</span>'}
                        </div>
                    </div>
                    
                    ${isOtherCategory ? `
                    <div class="other-category-note">
                        <div class="other-note">
                            <strong>💡 提示:</strong> 这些网站未能自动分类，您可以在设置中添加自定义规则来改善分类效果。
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        html += `
            </div>
            
            <div class="top-domains">
                <h4>🏆 访问频率排行</h4>
                <div class="domains-ranking">
                    ${classifiedData.topDomains?.map((item, index) =>
            `<div class="domain-rank-item">
                            <span class="rank">#${index + 1}</span>
                            <span class="domain">${item.domain}</span>
                            <span class="count">${item.count} 次</span>
                        </div>`
        ).join('') || '<div class="no-data">无数据</div>'}
                </div>
            </div>
        `;

        analysisContent.innerHTML = html;

        // 添加复制JSON按钮的事件监听器
        const copyJsonBtn = analysisContent.querySelector('.copy-json-btn');
        if (copyJsonBtn) {
            copyJsonBtn.addEventListener('click', () => {
                const jsonData = copyJsonBtn.getAttribute('data-json');
                navigator.clipboard.writeText(jsonData).then(() => {
                    this.showToast('JSON数据已复制到剪贴板');
                }).catch(() => {
                    this.showError('复制失败');
                });
            });
        }
    }

    async exportAnalysis() {
        try {
            const classifiedKey = `classified-${this.currentDate}`;
            const result = await window.dbWrapper.get(classifiedKey);
            const classifiedData = result[classifiedKey];

            if (!classifiedData) {
                this.showError('没有可导出的分析数据');
                return;
            }

            // 创建详细的分析报告
            const report = this.generateAnalysisReport(classifiedData);

            // 导出为文本文件
            const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mimir-analysis-${this.currentDate}.txt`;
            a.click();
            URL.revokeObjectURL(url);

            this.showToast('分析报告已导出');
        } catch (error) {
            this.showError('导出失败: ' + error.message);
        }
    }

    generateAnalysisReport(data) {
        let report = `Mimir 浏览数据分析报告\n`;
        report += `=========================\n\n`;
        report += `分析日期: ${data.date}\n`;
        report += `总浏览量: ${data.totalItems} 条\n`;
        report += `分类数量: ${data.categories?.length || 0} 类\n`;
        report += `活跃时段: ${data.peakHours?.join(', ') || '未知'}\n\n`;

        report += `详细分类分析:\n`;
        report += `--------------\n`;
        data.categories?.forEach((category, index) => {
            report += `${index + 1}. ${category.name}\n`;
            report += `   浏览量: ${category.count} 条 (${Math.round(category.count / data.totalItems * 100)}%)\n`;
            report += `   主要网站: ${category.domains?.join(', ') || '无'}\n`;
            report += `   关键内容:\n`;
            category.keyTitles?.forEach(title => {
                report += `     - ${title}\n`;
            });
            if (category.timeRange) {
                report += `   访问时段: ${category.timeRange}\n`;
            }
            report += `\n`;
        });

        report += `网站访问排行:\n`;
        report += `--------------\n`;
        data.topDomains?.forEach((item, index) => {
            report += `${index + 1}. ${item.domain} - ${item.count} 次\n`;
        });

        report += `\n原始JSON数据:\n`;
        report += `==============\n`;
        report += JSON.stringify(data, null, 2);

        return report;
    }

    // 年度报告相关功能
    async switchToAnnualView() {
        document.getElementById('dailyControls').style.display = 'none';
        document.getElementById('annualControls').style.display = 'flex';
        document.getElementById('analyzeBtn').style.display = 'none';
        document.getElementById('generateAnnualBtn').style.display = 'inline-block';
        document.getElementById('dailyViewBtn').classList.remove('active');
        document.getElementById('annualViewBtn').classList.add('active');
        document.getElementById('historySection').style.display = 'none';
        document.getElementById('analysisSection').style.display = 'none';
        document.getElementById('diarySection').style.display = 'none';
        document.getElementById('annualReportSection').style.display = 'block';

        await this.loadAvailableYears();
        // 检查当前选中年份的数据
        await this.onYearChange();
    }

    async switchToDailyView() {
        document.getElementById('dailyControls').style.display = 'flex';
        document.getElementById('annualControls').style.display = 'none';
        document.getElementById('analyzeBtn').style.display = 'inline-block';
        document.getElementById('generateAnnualBtn').style.display = 'none';
        document.getElementById('dailyViewBtn').classList.add('active');
        document.getElementById('annualViewBtn').classList.remove('active');
        document.getElementById('historySection').style.display = 'block';
        document.getElementById('analysisSection').style.display = 'block';
        document.getElementById('annualReportSection').style.display = 'none';
    }

    async loadAvailableYears() {
        try {
            const years = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getAvailableYears' }, resolve);
            });

            const yearInput = document.getElementById('yearInput');
            yearInput.innerHTML = '';

            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === new Date().getFullYear()) {
                    option.selected = true;
                }
                yearInput.appendChild(option);
            });
        } catch (error) {
            console.error('加载年份失败:', error);
        }
    }

    async generateAnnualReport() {
        try {
            const year = document.getElementById('yearInput').value;

            // 显示加载状态
            document.getElementById('annualLoadingSpinner').style.display = 'block';
            document.getElementById('annualContent').innerHTML = '<div class="loading">正在生成年报...</div>';

            // 生成年度报告
            const report = await this.generateYearlyReport(year);

            // 显示报告
            this.displayAnnualReport(report);

            // 保存报告
            await window.dbWrapper.set({ [`annual-report-${year}`]: report });

        } catch (error) {
            this.showError('生成年报失败: ' + error.message);
        } finally {
            document.getElementById('annualLoadingSpinner').style.display = 'none';
        }
    }

    displayAnnualReport(report) {
        const content = document.getElementById('annualContent');

        // 计算一些额外的统计数据
        const totalHours = Math.round(report.totalItems * 2 / 60); // 假设每个页面平均2分钟
        const mostActiveCategory = report.categories[0];
        const leastActiveMonth = report.monthlyStats.reduce((min, month) =>
            month.count < min.count ? month : min, report.monthlyStats[0]);
        const mostActiveMonth = report.monthlyStats.reduce((max, month) =>
            month.count > max.count ? month : max, report.monthlyStats[0]);

        let html = `
            <!-- 年度概览卡片 -->
            <div class="annual-overview">
                <div class="annual-stat-card">
                    <h4>总浏览量</h4>
                    <div class="stat-value">${report.totalItems.toLocaleString()}</div>
                    <div class="stat-change neutral">页面访问</div>
                </div>
                <div class="annual-stat-card">
                    <h4>活跃天数</h4>
                    <div class="stat-value">${report.summary.totalDays}</div>
                    <div class="stat-change positive">共${Math.round(report.summary.totalDays / 365 * 100)}%时间</div>
                </div>
                <div class="annual-stat-card">
                    <h4>日均浏览</h4>
                    <div class="stat-value">${report.summary.avgPerDay}</div>
                    <div class="stat-change neutral">页面/天</div>
                </div>
                <div class="annual-stat-card">
                    <h4>预估时长</h4>
                    <div class="stat-value">${totalHours}h</div>
                    <div class="stat-change neutral">浏览时间</div>
                </div>
                <div class="annual-stat-card">
                    <h4>访问域名</h4>
                    <div class="stat-value">${report.topDomains.length}</div>
                    <div class="stat-change positive">个网站</div>
                </div>
                <div class="annual-stat-card">
                    <h4>主要兴趣</h4>
                    <div class="stat-value">${mostActiveCategory ? mostActiveCategory.name : '未知'}</div>
                    <div class="stat-change positive">${mostActiveCategory ? Math.round(mostActiveCategory.count / report.totalItems * 100) : 0}%占比</div>
                </div>
            </div>

            <!-- 年度洞察 -->
            <div class="annual-insights">
                <h4>💡 个性化洞察</h4>
                <ul class="insight-list">
                    <li class="insight-item">
                        🎯 <strong>兴趣画像</strong>: 您最关注${mostActiveCategory ? mostActiveCategory.name : '未知'}内容，占浏览时间的 <strong>${mostActiveCategory ? Math.round(mostActiveCategory.count / report.totalItems * 100) : 0}%</strong>，展现出${this.getPersonalityType(report)}的特质
                    </li>
                    <li class="insight-item">
                        📊 <strong>活跃度评估</strong>: 您是一位${this.getActivityLevel(report.summary.avgPerDay)}的互联网用户，在${report.summary.totalDays}个活跃日中，日均浏览 <strong>${report.summary.avgPerDay}</strong> 个页面
                    </li>
                    <li class="insight-item">
                        🌐 <strong>探索广度</strong>: 您访问了 <strong>${report.topDomains.length}</strong> 个不同网站，属于${this.getExplorationLevel(report.topDomains.length)}类型，最偏爱的网站是 <strong>${report.topDomains[0] ? report.topDomains[0].domain : '未知'}</strong>
                    </li>
                    <li class="insight-item">
                        📈 <strong>时间分布</strong>: 最活跃的月份是 <strong>${mostActiveMonth.month}</strong> (${mostActiveMonth.count}次浏览)，预估总浏览时长约 <strong>${totalHours}</strong> 小时
                    </li>
                    <li class="insight-item">
                        🏆 <strong>年度成就</strong>: 您在${report.year}年的数字足迹遍布${report.topDomains.length}个网站，累计浏览${report.totalItems.toLocaleString()}个页面，相当于阅读了${Math.round(report.totalItems / 10)}本书的信息量！
                    </li>
                </ul>
            </div>

            <!-- 月度趋势图 -->
            <div class="annual-trends">
                <h4>📈 月度浏览趋势</h4>
                <div class="monthly-chart">
                    <div class="chart-bars">
                        ${report.monthlyStats.map(month => {
            const maxCount = Math.max(...report.monthlyStats.map(m => m.count));
            const height = (month.count / maxCount) * 100;
            return `
                                <div class="chart-bar" style="height: ${height}%">
                                    <div class="chart-bar-value">${month.count}</div>
                                    <div class="chart-bar-label">${month.month.split('-')[1]}月</div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
            </div>

            <!-- 时间分布分析 -->
            <div class="time-distribution">
                <h4>⏰ 浏览时间分布</h4>
                <div class="time-stats-grid">
                    <div class="time-stat-card">
                        <div class="time-stat-icon">🕐</div>
                        <div class="time-stat-content">
                            <div class="time-stat-title">最活跃时段</div>
                            <div class="time-stat-value">${report.summary.mostActiveHour ? report.summary.mostActiveHour.hour + ':00' : '未知'}</div>
                            <div class="time-stat-desc">${report.summary.mostActiveHour ? report.summary.mostActiveHour.count + '次浏览' : ''}</div>
                        </div>
                    </div>
                    <div class="time-stat-card">
                        <div class="time-stat-icon">📅</div>
                        <div class="time-stat-content">
                            <div class="time-stat-title">最活跃日期</div>
                            <div class="time-stat-value">${report.summary.mostActiveWeekday ? report.summary.mostActiveWeekday.weekday : '未知'}</div>
                            <div class="time-stat-desc">${report.summary.mostActiveWeekday ? report.summary.mostActiveWeekday.count + '次浏览' : ''}</div>
                        </div>
                    </div>
                    <div class="time-stat-card">
                        <div class="time-stat-icon">📊</div>
                        <div class="time-stat-content">
                            <div class="time-stat-title">浏览习惯</div>
                            <div class="time-stat-value">${this.getBrowsingPattern(report)}</div>
                            <div class="time-stat-desc">基于时间分布分析</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 分类统计 -->
            <div class="annual-categories">
                <h4>🏷️ 内容分类分布</h4>
                <div class="annual-category-grid">
                    ${report.categories.map((category, index) => {
            const percentage = ((category.count / report.totalItems) * 100).toFixed(1);
            const isTop = index < 3; // 前三名高亮显示
            const categoryIcons = {
                '编程与开发': '💻',
                '工作与生产力': '📊',
                '新闻与资讯': '📰',
                '娱乐与视频': '🎬',
                '社交与社区': '👥',
                '生活与消费': '🛒',
                '学术与教育': '📚',
                '其他': '📂'
            };
            const icon = categoryIcons[category.name] || '📂';

            return `
                            <div class="annual-category-card ${isTop ? 'top-category' : ''}">
                                <div class="annual-category-header">
                                    <div class="annual-category-name">
                                        <span class="category-icon">${icon}</span>
                                        ${category.name}
                                        ${isTop ? '<span class="top-badge">TOP ' + (index + 1) + '</span>' : ''}
                                    </div>
                                    <div class="annual-category-count">${category.count.toLocaleString()}次</div>
                                </div>
                                <div class="annual-category-percentage">
                                    <div class="percentage-bar">
                                        <div class="percentage-fill" style="width: ${percentage}%"></div>
                                    </div>
                                    <span class="percentage-text">${percentage}%</span>
                                </div>
                                <div class="annual-category-domains">
                                    <strong>主要网站:</strong> ${category.domains.slice(0, 3).join(', ')}
                                    ${category.domains.length > 3 ? `<span class="more-domains"> 等${category.domains.length}个网站</span>` : ''}
                                </div>
                                ${category.keyTitles && category.keyTitles.length > 0 ? `
                                <div class="annual-category-topics">
                                    <strong>热门话题:</strong> ${category.keyTitles.slice(0, 2).join(', ')}
                                </div>
                                ` : ''}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>

            <!-- 年度成就 -->
            <div class="annual-achievements">
                <h4>🏆 年度成就</h4>
                <div class="achievements-grid">
                    ${this.generateAchievements(report).map(achievement => `
                        <div class="achievement-card">
                            <div class="achievement-icon">${achievement.icon}</div>
                            <div class="achievement-content">
                                <div class="achievement-title">${achievement.title}</div>
                                <div class="achievement-desc">${achievement.description}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 热门网站排行 -->
            <div class="annual-top-domains">
                <h4>🌐 热门网站 TOP 10</h4>
                <div class="domains-ranking">
                    ${report.topDomains.slice(0, 10).map((domain, index) => `
                        <div class="domain-rank-item">
                            <div class="rank">${index + 1}</div>
                            <div class="domain">${domain.domain}</div>
                            <div class="count">${domain.count} 次访问</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        content.innerHTML = html;
        document.getElementById('exportAnnualBtn').style.display = 'inline-block';
    }

    async exportAnnualReport() {
        try {
            const year = document.getElementById('yearInput').value;
            await this.exportYearlyReport(year, 'markdown');
        } catch (error) {
            this.showError('导出失败: ' + error.message);
        }
    }

    async setCurrentYear() {
        const currentYear = new Date().getFullYear();
        document.getElementById('yearInput').value = currentYear;
    }

    async onYearChange() {
        // 年份变更时的处理 - 检查该年份是否有数据和已有报告
        const year = document.getElementById('yearInput').value;
        const generateBtn = document.getElementById('generateAnnualBtn');

        try {
            // 首先检查是否已有该年份的报告
            const reportKey = `annual-report-${year}`;
            const existingReport = await window.dbWrapper.get(reportKey);
            
            if (existingReport[reportKey]) {
                // 如果已有报告，直接显示
                console.log(`找到${year}年的已有报告，直接显示`);
                this.displayAnnualReport(existingReport[reportKey]);
                document.getElementById('exportAnnualBtn').style.display = 'inline-block';
                generateBtn.textContent = `🔄 重新生成${year}年报告`;
                generateBtn.disabled = false;
                generateBtn.style.opacity = '1';
                return;
            }

            // 如果没有已有报告，检查该年份的数据量
            const yearData = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getYearData', year: year }, resolve);
            });

            const dataCount = yearData ? yearData.length : 0;

            // 清空报告显示区域
            const annualContent = document.getElementById('annualContent');
            annualContent.innerHTML = `
                <div class="placeholder">
                    <p>📊</p>
                    <p>选择年份后点击"生成年度报告"按钮，系统将为您生成详细的年度浏览分析</p>
                    <div class="tips">
                        <h4>💡 使用提示</h4>
                        <ul>
                            <li>确保已授予浏览器历史记录权限</li>
                            <li>年度报告需要一定的浏览数据积累</li>
                            <li>如果某年份显示"无数据"，请选择其他年份</li>
                        </ul>
                    </div>
                </div>
            `;
            document.getElementById('exportAnnualBtn').style.display = 'none';

            if (dataCount === 0) {
                generateBtn.textContent = `📊 ${year}年无数据`;
                generateBtn.disabled = true;
                generateBtn.style.opacity = '0.5';
            } else {
                generateBtn.textContent = `📊 生成年度报告 (${dataCount}条记录)`;
                generateBtn.disabled = false;
                generateBtn.style.opacity = '1';
            }
        } catch (error) {
            console.error('检查年份数据失败:', error);
            generateBtn.textContent = '📊 生成年度报告';
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
        }
    }

    // 生成年度报告
    async generateYearlyReport(year) {
        try {
            console.log(`开始生成${year}年度报告...`);

            // 获取年度数据
            const yearData = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getYearData', year: year }, resolve);
            });

            console.log(`获取到年度数据: ${yearData ? yearData.length : 0} 条`);

            // 调试：检查数据格式
            if (yearData && yearData.length > 0) {
                console.log('年度数据样本:', yearData[0]);
                const hasTimestamp = yearData.filter(item => item.timestamp).length;
                const hasLastVisitTime = yearData.filter(item => item.lastVisitTime).length;
                console.log(`有timestamp字段的项目: ${hasTimestamp}, 有lastVisitTime字段的项目: ${hasLastVisitTime}`);
            }

            if (!yearData || yearData.length === 0) {
                // 如果是当前年份，提供更友好的提示
                const currentYear = new Date().getFullYear();
                if (parseInt(year) === currentYear) {
                    throw new Error(`${year}年暂无足够的浏览数据。请确保：\n1. 已授予浏览器历史记录权限\n2. 有一定的浏览记录积累\n3. 浏览器历史记录未被清除`);
                } else {
                    throw new Error(`${year}年没有浏览数据，请检查浏览器历史记录权限或选择其他年份`);
                }
            }

            // 如果数据量很少，给出警告但继续处理
            if (yearData.length < 50) {
                console.warn(`${year}年数据量较少(${yearData.length}条)，报告可能不够详细`);
                this.showAIClassificationStatus(`${year}年数据量较少(${yearData.length}条)，报告可能不够详细`, 'warning');
            }

            // 使用规则分类处理年度数据
            console.log('开始预处理数据...');
            const processedData = this.preprocessData(yearData);
            console.log(`预处理完成，处理后数据量: ${processedData.length}`);

            console.log('开始规则分类...');
            const classifiedResult = this.ruleBasedClassification(processedData);
            console.log('规则分类完成，分类数量:', classifiedResult.categories.length);

            // 生成年度统计 - 使用处理过的数据
            console.log('开始生成年度统计...');
            const yearlyStats = this.generateYearlyStats(processedData, classifiedResult);
            console.log('年度统计生成完成');

            return {
                year: year,
                totalItems: processedData.length, // 使用处理后的数据长度
                dateRange: this.getYearDateRange(yearData), // 使用原始数据获取时间范围
                categories: classifiedResult.categories,
                monthlyStats: yearlyStats.monthlyStats,
                topDomains: classifiedResult.topDomains,
                summary: yearlyStats.summary,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('生成年度报告失败:', error);
            throw error;
        }
    }

    // 生成年度统计数据
    generateYearlyStats(yearData, classifiedResult) {
        // 按月份统计
        const monthlyStats = {};
        const monthlyCategories = {};
        const hourlyStats = {};
        const weekdayStats = {};

        yearData.forEach(item => {
            // 防御性编程：确保timestamp有效
            const timestamp = item.timestamp || item.lastVisitTime;
            if (!timestamp || isNaN(timestamp)) {
                console.warn('跳过无效timestamp的项目:', item);
                return;
            }

            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                console.warn('跳过无法解析时间的项目:', item);
                return;
            }

            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            const hour = date.getHours();
            const weekday = date.getDay(); // 0=Sunday, 1=Monday, etc.

            // 月度统计
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = 0;
                monthlyCategories[monthKey] = {};
            }
            monthlyStats[monthKey]++;

            // 小时统计
            hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;

            // 星期统计
            weekdayStats[weekday] = (weekdayStats[weekday] || 0) + 1;

            // 分类统计 - 数据已经预处理过，可以直接分类
            const category = this.classifyItem(item);
            monthlyCategories[monthKey][category] = (monthlyCategories[monthKey][category] || 0) + 1;
        });

        // 生成摘要
        const validDates = yearData
            .map(item => {
                const timestamp = item.timestamp || item.lastVisitTime;
                if (!timestamp || isNaN(timestamp)) return null;

                const date = new Date(timestamp);
                if (isNaN(date.getTime())) return null;

                return item.date || MimirConfig.formatDateLocal(date);
            })
            .filter(date => date !== null);

        const totalDays = new Set(validDates).size;
        const avgPerDay = Math.round(yearData.length / totalDays);
        const mostActiveMonth = Object.entries(monthlyStats).sort(([, a], [, b]) => b - a)[0];

        // 找出最活跃的时间段
        const mostActiveHour = Object.entries(hourlyStats).sort(([, a], [, b]) => b - a)[0];
        const mostActiveWeekday = Object.entries(weekdayStats).sort(([, a], [, b]) => b - a)[0];

        const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

        const summary = {
            totalDays,
            avgPerDay,
            mostActiveMonth: mostActiveMonth ? {
                month: mostActiveMonth[0],
                count: mostActiveMonth[1]
            } : null,
            mostActiveHour: mostActiveHour ? {
                hour: parseInt(mostActiveHour[0]),
                count: mostActiveHour[1]
            } : null,
            mostActiveWeekday: mostActiveWeekday ? {
                weekday: weekdayNames[parseInt(mostActiveWeekday[0])],
                count: mostActiveWeekday[1]
            } : null,
            topCategory: classifiedResult.categories.length > 0 ? classifiedResult.categories[0] : null
        };

        return {
            monthlyStats: Object.entries(monthlyStats).map(([month, count]) => ({
                month,
                count,
                categories: monthlyCategories[month]
            })),
            hourlyStats,
            weekdayStats,
            summary
        };
    }

    // 获取年度数据的日期范围
    getYearDateRange(yearData) {
        if (yearData.length === 0) return null;

        // 防御性编程：过滤无效的timestamp
        const validTimestamps = yearData
            .map(item => item.timestamp || item.lastVisitTime)
            .filter(timestamp => timestamp && !isNaN(timestamp) && timestamp > 0);

        if (validTimestamps.length === 0) {
            console.warn('没有有效的timestamp数据');
            return null;
        }

        const minDate = new Date(Math.min(...validTimestamps));
        const maxDate = new Date(Math.max(...validTimestamps));

        // 检查日期是否有效
        if (isNaN(minDate.getTime()) || isNaN(maxDate.getTime())) {
            console.warn('无法创建有效的日期范围');
            return null;
        }

        return {
            start: MimirConfig.formatDateLocal(minDate),
            end: MimirConfig.formatDateLocal(maxDate)
        };
    }

    // 获取个性类型
    getPersonalityType(report) {
        const topCategory = report.categories[0];
        if (!topCategory) return '多元探索者';

        const percentage = (topCategory.count / report.totalItems) * 100;

        switch (topCategory.name) {
            case '编程与开发':
                return percentage > 30 ? '技术专家' : '技术爱好者';
            case '娱乐与视频':
                return percentage > 40 ? '娱乐达人' : '休闲爱好者';
            case '新闻与资讯':
                return percentage > 25 ? '信息收集者' : '资讯关注者';
            case '社交与社区':
                return percentage > 20 ? '社交活跃者' : '社区参与者';
            case '学术与教育':
                return percentage > 15 ? '学习型人才' : '知识探索者';
            case '工作与生产力':
                return percentage > 20 ? '效率专家' : '职场精英';
            default:
                return '多元探索者';
        }
    }

    // 获取活跃度等级
    getActivityLevel(avgDaily) {
        if (avgDaily > 200) return '超级活跃';
        if (avgDaily > 100) return '高度活跃';
        if (avgDaily > 50) return '中等活跃';
        return '轻度使用';
    }

    // 获取探索广度等级
    getExplorationLevel(domainCount) {
        if (domainCount > 100) return '探索达人';
        if (domainCount > 50) return '广泛涉猎';
        if (domainCount > 20) return '适度探索';
        return '专注型';
    }

    // 获取浏览模式
    getBrowsingPattern(report) {
        if (!report.summary.mostActiveHour) return '随机型';

        const hour = report.summary.mostActiveHour.hour;

        if (hour >= 6 && hour < 9) return '早鸟型';
        if (hour >= 9 && hour < 12) return '上午高效型';
        if (hour >= 12 && hour < 14) return '午休型';
        if (hour >= 14 && hour < 18) return '下午专注型';
        if (hour >= 18 && hour < 22) return '晚间活跃型';
        if (hour >= 22 || hour < 6) return '夜猫子型';

        return '均衡型';
    }

    // 生成年度成就
    generateAchievements(report) {
        const achievements = [];

        // 浏览量成就
        if (report.totalItems >= 10000) {
            achievements.push({
                icon: '🚀',
                title: '浏览达人',
                description: `年度浏览量突破${Math.floor(report.totalItems / 1000)}K，您是真正的信息探索者！`
            });
        } else if (report.totalItems >= 5000) {
            achievements.push({
                icon: '📚',
                title: '知识猎手',
                description: `年度浏览${report.totalItems}个页面，相当于阅读了${Math.round(report.totalItems / 10)}本书的信息量`
            });
        }

        // 活跃度成就
        if (report.summary.totalDays >= 300) {
            achievements.push({
                icon: '⭐',
                title: '全年无休',
                description: `${report.summary.totalDays}天的活跃记录，您的学习热情令人敬佩！`
            });
        } else if (report.summary.totalDays >= 200) {
            achievements.push({
                icon: '💪',
                title: '坚持不懈',
                description: `保持了${report.summary.totalDays}天的浏览活跃度，持续学习的好习惯！`
            });
        }

        // 探索广度成就
        if (report.topDomains.length >= 100) {
            achievements.push({
                icon: '🌍',
                title: '网络探险家',
                description: `足迹遍布${report.topDomains.length}个网站，您的好奇心覆盖了整个互联网！`
            });
        } else if (report.topDomains.length >= 50) {
            achievements.push({
                icon: '🔍',
                title: '信息搜寻者',
                description: `探索了${report.topDomains.length}个不同网站，展现出广泛的兴趣爱好`
            });
        }

        // 专业度成就
        const topCategory = report.categories[0];
        if (topCategory) {
            const percentage = (topCategory.count / report.totalItems * 100).toFixed(1);
            if (topCategory.name === '编程与开发' && percentage > 30) {
                achievements.push({
                    icon: '👨‍💻',
                    title: '代码大师',
                    description: `${percentage}%的时间专注于编程开发，技术实力不容小觑！`
                });
            } else if (topCategory.name === '学术与教育' && percentage > 20) {
                achievements.push({
                    icon: '🎓',
                    title: '学术精英',
                    description: `${percentage}%的浏览时间用于学术研究，求知欲旺盛！`
                });
            } else if (topCategory.name === '新闻与资讯' && percentage > 25) {
                achievements.push({
                    icon: '📰',
                    title: '资讯达人',
                    description: `${percentage}%的时间关注新闻资讯，时刻把握时代脉搏！`
                });
            }
        }

        // 时间管理成就
        if (report.summary.mostActiveHour && report.summary.mostActiveHour.hour >= 6 && report.summary.mostActiveHour.hour < 9) {
            achievements.push({
                icon: '🌅',
                title: '早起鸟儿',
                description: '最活跃时段在早晨，早起的鸟儿有虫吃！'
            });
        } else if (report.summary.mostActiveHour && report.summary.mostActiveHour.hour >= 22) {
            achievements.push({
                icon: '🦉',
                title: '夜猫子',
                description: '深夜时分依然活跃，夜深人静正是思考的好时光'
            });
        }

        // 如果没有特殊成就，添加一个通用成就
        if (achievements.length === 0) {
            achievements.push({
                icon: '🎯',
                title: '数字生活记录者',
                description: `在${report.year}年留下了${report.totalItems}个数字足迹，每一次点击都是成长的见证`
            });
        }

        return achievements;
    }

    // 导出年度报告
    async exportYearlyReport(year, format = 'markdown') {
        try {
            const reportKey = `annual-report-${year}`;
            const result = await window.dbWrapper.get(reportKey);
            const report = result[reportKey];

            if (!report) {
                throw new Error('请先生成年度报告');
            }

            let content = '';

            if (format === 'markdown') {
                content = this.formatAnnualReportAsMarkdown(report);
            } else {
                content = JSON.stringify(report, null, 2);
            }

            // 创建下载
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Mimir年度报告-${year}.${format === 'markdown' ? 'md' : 'json'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('导出年度报告失败:', error);
            throw error;
        }
    }

    // 将年度报告格式化为Markdown
    formatAnnualReportAsMarkdown(report) {
        let md = `# Mimir ${report.year}年度浏览报告\n\n`;
        md += `> 生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}\n\n`;

        // 概览
        md += `## 📊 年度概览\n\n`;
        md += `- **总浏览量**: ${report.totalItems.toLocaleString()} 个页面\n`;
        md += `- **活跃天数**: ${report.summary.totalDays} 天\n`;
        md += `- **日均浏览**: ${report.summary.avgPerDay} 个页面\n`;
        if (report.summary.mostActiveMonth) {
            md += `- **最活跃月份**: ${report.summary.mostActiveMonth.month} (${report.summary.mostActiveMonth.count} 个页面)\n`;
        }

        // 添加更多有趣的统计
        const totalHours = Math.round(report.totalItems * 2 / 60);
        const activeDaysPercentage = Math.round(report.summary.totalDays / 365 * 100);
        md += `- **预估浏览时长**: ${totalHours} 小时\n`;
        md += `- **年度活跃度**: ${activeDaysPercentage}% (${report.summary.totalDays}/365天)\n`;

        // 添加浏览习惯洞察
        const topCategory = report.categories[0];
        if (topCategory) {
            const percentage = ((topCategory.count / report.totalItems) * 100).toFixed(1);
            md += `- **主要兴趣**: ${topCategory.name} (${percentage}%)\n`;
        }
        md += `\n`;

        // 分类统计
        md += `## 🏷️ 内容分类\n\n`;
        report.categories.forEach((category, index) => {
            const percentage = ((category.count / report.totalItems) * 100).toFixed(1);
            md += `**${category.name}**: ${category.count} 个页面 (${percentage}%)\n\n`;

            if (category.keyTitles && category.keyTitles.length > 0) {
                md += `代表内容: ${category.keyTitles.slice(0, 3).join(', ')}\n\n`;
            }

            if (category.domains && category.domains.length > 0) {
                md += `主要网站: ${category.domains.slice(0, 5).join(', ')}\n\n`;
            }
        });

        // 添加个性化洞察
        md += `## 💡 个性化洞察\n\n`;

        // 浏览习惯分析 (重用之前声明的topCategory变量)
        const secondCategory = report.categories[1];
        if (topCategory && secondCategory) {
            const topPercentage = ((topCategory.count / report.totalItems) * 100).toFixed(1);
            const secondPercentage = ((secondCategory.count / report.totalItems) * 100).toFixed(1);
            md += `🎯 **兴趣偏好**: 您最关注${topCategory.name}内容，占浏览时间的${topPercentage}%，其次是${secondCategory.name}(${secondPercentage}%)\n\n`;
        }

        // 活跃度分析
        const avgDaily = report.summary.avgPerDay;
        let activityLevel = '';
        if (avgDaily > 200) activityLevel = '超级活跃';
        else if (avgDaily > 100) activityLevel = '高度活跃';
        else if (avgDaily > 50) activityLevel = '中等活跃';
        else activityLevel = '轻度使用';

        md += `📊 **活跃度评估**: 您是一位${activityLevel}的互联网用户，日均浏览${avgDaily}个页面\n\n`;

        // 探索广度分析
        const domainCount = report.topDomains.length;
        let explorationLevel = '';
        if (domainCount > 100) explorationLevel = '探索达人';
        else if (domainCount > 50) explorationLevel = '广泛涉猎';
        else if (domainCount > 20) explorationLevel = '适度探索';
        else explorationLevel = '专注型';

        md += `🌐 **探索广度**: 您访问了${domainCount}个不同网站，属于${explorationLevel}类型\n\n`;

        // 月度趋势
        md += `## 📈 月度趋势\n\n`;
        md += `| 月份 | 浏览量 | 主要分类 |\n`;
        md += `|------|--------|----------|\n`;

        report.monthlyStats.forEach(month => {
            const topCategory = Object.entries(month.categories)
                .sort(([, a], [, b]) => b - a)[0];
            md += `| ${month.month} | ${month.count} | ${topCategory ? topCategory[0] : '-'} |\n`;
        });
        md += `\n`;

        // 添加趋势分析
        const monthlyData = report.monthlyStats.map(m => m.count);
        const maxMonth = report.monthlyStats.find(m => m.count === Math.max(...monthlyData));
        const minMonth = report.monthlyStats.find(m => m.count === Math.min(...monthlyData));

        if (maxMonth && minMonth) {
            md += `📊 **趋势洞察**: ${maxMonth.month}是您最活跃的月份(${maxMonth.count}次浏览)，${minMonth.month}相对较少(${minMonth.count}次浏览)\n\n`;
        }

        // 时间分布分析
        md += `## ⏰ 浏览时间分布\n\n`;

        if (report.summary.mostActiveHour) {
            md += `🕐 **最活跃时段**: ${report.summary.mostActiveHour.hour}:00 (${report.summary.mostActiveHour.count}次浏览)\n\n`;
        }

        if (report.summary.mostActiveWeekday) {
            md += `📅 **最活跃日期**: ${report.summary.mostActiveWeekday.weekday} (${report.summary.mostActiveWeekday.count}次浏览)\n\n`;
        }

        md += `🎯 **浏览模式**: 您是${this.getBrowsingPattern(report)}用户\n\n`;

        // 年度成就
        md += `## 🏆 年度成就\n\n`;
        const achievements = this.generateAchievements(report);
        achievements.forEach(achievement => {
            md += `${achievement.icon} **${achievement.title}**: ${achievement.description}\n\n`;
        });

        // 热门网站
        md += `## 🌐 热门网站\n\n`;
        report.topDomains.slice(0, 10).forEach((domain, index) => {
            md += `${index + 1}. **${domain.domain}** - ${domain.count} 次访问\n`;
        });
        md += `\n`;

        md += `---\n`;
        md += `*本报告由 Mimir 个人记忆仪表盘生成*\n`;

        return md;
    }
}

// 初始化仪表盘
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new MimirDashboard();
});
