class MimirSettings {
    constructor() {
        // 用于存储设置和规则
        this.config = {};
        
        // 分类选项
        this.categories = [
            '编程与开发', '工作与生产力', '新闻与资讯', '娱乐与视频', 
            '社交与社区', '生活与消费', '学术与教育', 'NSFW'
        ];
        
        // 绑定所有DOM元素
        this.dom = {
            saveBtn: document.getElementById('saveBtn'),
            resetBtn: document.getElementById('resetBtn'),
            apiKey: document.getElementById('apiKey'),
            apiUrl: document.getElementById('apiUrl'),
            model: document.getElementById('model'),
            diaryModel: document.getElementById('diaryModel'),
            useAI: document.getElementById('useAIClassification'),
            customPrompt: document.getElementById('customPrompt'),
            enableDiaryComparison: document.getElementById('enableDiaryComparison'),
            enableStreaming: document.getElementById('enableStreaming'),
            rulesContainer: document.getElementById('rulesContainer'),
            addRuleBtn: document.getElementById('addRuleBtn'),
            newRuleValue: document.getElementById('newRuleValue'),
            newRuleType: document.getElementById('newRuleType'),
            newRuleCategory: document.getElementById('newRuleCategory'),
            suggestionsContainer: document.getElementById('ruleSuggestions'),
            // Migration related elements
            indexeddbStatus: document.getElementById('indexeddbStatus'),
            migrationStatus: document.getElementById('migrationStatus'),
            migrationBtn: document.getElementById('migrationBtn'),
            checkStorageBtn: document.getElementById('checkStorageBtn'),
            // Backup related elements
            backupStatus: document.getElementById('backupStatus'),
            backupCount: document.getElementById('backupCount'),
            browserHistoryCount: document.getElementById('browserHistoryCount'),
            backupCoverage: document.getElementById('backupCoverage'),
            lastBackup: document.getElementById('lastBackup'),
            backupHistoryBtn: document.getElementById('backupHistoryBtn'),
            fullBackupHistoryBtn: document.getElementById('fullBackupHistoryBtn')
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadSettings();
        // 启动时加载智能建议
        await this.loadSuggestions();
        // 检查存储状态
        await this.checkStorageStatus();
    }

    setupEventListeners() {
        this.dom.saveBtn.addEventListener('click', this.saveSettings.bind(this));
        this.dom.resetBtn.addEventListener('click', this.resetSettings.bind(this));
        this.dom.addRuleBtn.addEventListener('click', this.addCustomRule.bind(this));
        this.dom.migrationBtn.addEventListener('click', this.startMigration.bind(this));
        this.dom.checkStorageBtn.addEventListener('click', this.checkStorageStatus.bind(this));
        this.dom.backupHistoryBtn.addEventListener('click', this.backupHistory.bind(this));
        this.dom.fullBackupHistoryBtn.addEventListener('click', this.fullBackupHistory.bind(this));
        
        // 使用事件委托处理规则删除和建议点击
        this.dom.rulesContainer.addEventListener('click', this.handleRuleAction.bind(this));
        this.dom.suggestionsContainer.addEventListener('click', this.applySuggestion.bind(this));
    }

    async loadSettings() {
        try {
            const result = await window.dbWrapper.get('mimir-config');
            this.config = result['mimir-config'] || this.getDefaults();

            this.dom.apiKey.value = this.config.apiKey || '';
            this.dom.apiUrl.value = this.config.apiUrl || 'https://api.openai.com/v1/chat/completions';
            this.dom.model.value = this.config.model || 'gpt-3.5-turbo';
            this.dom.diaryModel.value = this.config.diaryModel || 'gpt-4';
            this.dom.useAI.checked = this.config.useAIClassification !== false;
            this.dom.customPrompt.value = this.config.customPrompt || '';
            this.dom.enableDiaryComparison.checked = this.config.enableDiaryComparison === true;
            this.dom.enableStreaming.checked = this.config.enableStreaming !== false;
            
            this.renderCustomRules(this.config.customRules || []);
        } catch (error) {
            console.error('加载设置失败:', error);
            this.showToast('加载设置失败', 'error');
        }
    }

    async saveSettings() {
        try {
            this.config.apiKey = this.dom.apiKey.value.trim();
            this.config.apiUrl = this.dom.apiUrl.value.trim() || 'https://api.openai.com/v1/chat/completions';
            this.config.model = this.dom.model.value.trim() || 'gpt-3.5-turbo';
            this.config.diaryModel = this.dom.diaryModel.value.trim() || 'gpt-4';
            this.config.useAIClassification = this.dom.useAI.checked;
            this.config.customPrompt = this.dom.customPrompt.value.trim();
            this.config.enableDiaryComparison = this.dom.enableDiaryComparison.checked;
            this.config.enableStreaming = this.dom.enableStreaming.checked;
            // customRules 已经在添加/删除时直接修改了 this.config.customRules

            await window.dbWrapper.set({ 'mimir-config': this.config });
            this.showToast('设置已保存');
        } catch (error) {
            console.error('保存设置失败:', error);
            this.showToast('保存设置失败', 'error');
        }
    }

    async resetSettings() {
        if (confirm('确定要重置所有设置吗？这将清除API配置和所有自定义规则！')) {
            this.config = this.getDefaults();
            await this.saveSettings();
            await this.loadSettings(); // 重新加载以刷新UI
            this.showToast('设置已重置为默认值');
        }
    }

    getDefaults() {
        return {
            apiKey: '',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            diaryModel: 'gpt-4',
            useAIClassification: true,
            customPrompt: '',
            enableDiaryComparison: false,
            enableStreaming: true,
            customRules: []
        };
    }
    
    // ======== 自定义规则管理 ========

    renderCustomRules(rules) {
        const container = this.dom.rulesContainer;
        if (!rules || rules.length === 0) {
            container.innerHTML = `<div class="placeholder" style="padding: 20px;">暂无自定义规则</div>`;
            return;
        }

        container.innerHTML = rules.map((rule, index) => `
            <div class="rule-item">
                <div class="rule-info">
                    <span class="rule-value">${rule.value}</span>
                    <span class="rule-arrow">→</span>
                    <span class="rule-category">${rule.category}</span>
                    <span class="rule-arrow">(${rule.type === 'domain' ? '域名' : '关键词'})</span>
                </div>
                <button class="btn btn-sm btn-secondary delete-rule-btn" data-index="${index}" title="删除规则">
                    &times;
                </button>
            </div>
        `).join('');
    }

    addCustomRule() {
        const value = this.dom.newRuleValue.value.trim().toLowerCase();
        if (!value) {
            this.showToast('请输入规则值', 'error');
            return;
        }

        const newRule = {
            value,
            type: this.dom.newRuleType.value,
            category: this.dom.newRuleCategory.value,
        };

        if (!this.config.customRules) this.config.customRules = [];
        
        const exists = this.config.customRules.some(r => r.value === newRule.value && r.type === newRule.type);
        if (exists) {
            this.showToast('该规则已存在', 'error');
            return;
        }

        this.config.customRules.unshift(newRule); // 添加到最前面
        this.renderCustomRules(this.config.customRules);
        this.dom.newRuleValue.value = ''; // 清空输入框
        this.showToast(`已添加规则: ${value} → ${newRule.category}`);
        this.loadSuggestions(); // 刷新建议
    }
    
    handleRuleAction(event) {
        if (event.target.classList.contains('delete-rule-btn')) {
            const index = parseInt(event.target.dataset.index, 10);
            if (confirm('确定要删除这个规则吗？')) {
                const removed = this.config.customRules.splice(index, 1);
                this.renderCustomRules(this.config.customRules);
                this.showToast(`规则 "${removed[0].value}" 已删除`);
                this.loadSuggestions(); // 刷新建议
            }
        }
    }

    // ======== 智能建议 (新功能) ========

    async loadSuggestions() {
        this.dom.suggestionsContainer.innerHTML = `<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">正在分析常用网站...</div>`;
        
        // 从 scripts/background.js 获取数据和内置规则
        const data = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'getSuggestionData' }, resolve);
        });

        if (!data || !data.history || data.history.length === 0) {
            this.dom.suggestionsContainer.innerHTML = `<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">没有足够的浏览数据来生成建议。</div>`;
            return;
        }
        
        const { history, builtInRules } = data;
        const allRules = [...(builtInRules || []), ...(this.config.customRules || [])];
        const domainCounts = {};

        for(const item of history) {
            try {
                const url = new URL(item.url);
                let domain = url.hostname.replace(/^www\./, '');
                
                // 检查是否已被任何规则覆盖
                const isCovered = allRules.some(rule => rule.type === 'domain' && domain.includes(rule.value));

                if (!isCovered) {
                    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
                }
            } catch (e) { /* ignore invalid URLs */ }
        }

        const sortedDomains = Object.entries(domainCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10) // 最多显示10个建议
            .map(entry => entry[0]);

        if (sortedDomains.length === 0) {
            this.dom.suggestionsContainer.innerHTML = `<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">🎉 太棒了！所有常用网站都已分类。</div>`;
            return;
        }
            
        this.dom.suggestionsContainer.innerHTML = sortedDomains.map(domain => 
            `<button class="suggestion-tag" data-value="${domain}">${domain}</button>`
        ).join('');
    }
    
    applySuggestion(event) {
        if (event.target.classList.contains('suggestion-tag')) {
            const value = event.target.dataset.value;
            this.dom.newRuleValue.value = value;
            this.dom.newRuleType.value = 'domain'; // 建议都是域名类型
            this.dom.newRuleValue.focus(); // 让用户可以立即编辑或确认
            this.showToast(`已填入 "${value}"，请选择分类后添加`, 'info');
        }
    }

    // ======== 数据迁移管理 ========

    async checkStorageStatus() {
        try {
            // 检查IndexedDB状态
            const isIndexedDBAvailable = await window.dbWrapper.isIndexedDBAvailable();
            this.updateStatusElement(this.dom.indexeddbStatus, 
                isIndexedDBAvailable ? '可用' : '不可用', 
                isIndexedDBAvailable ? 'success' : 'error'
            );

            // 检查迁移状态
            const migrationStatus = await window.dbWrapper.getMigrationStatus();
            let statusText, statusClass;
            
            switch (migrationStatus) {
                case 'completed':
                    statusText = '已完成';
                    statusClass = 'success';
                    this.dom.migrationBtn.style.display = 'none';
                    break;
                case 'in_progress':
                    statusText = '进行中...';
                    statusClass = 'warning';
                    this.dom.migrationBtn.style.display = 'none';
                    break;
                case 'failed':
                    statusText = '失败';
                    statusClass = 'error';
                    this.dom.migrationBtn.style.display = 'inline-block';
                    this.dom.migrationBtn.textContent = '🔄 重试迁移';
                    break;
                default:
                    statusText = '未开始';
                    statusClass = 'info';
                    if (isIndexedDBAvailable) {
                        this.dom.migrationBtn.style.display = 'inline-block';
                        this.dom.migrationBtn.textContent = '🚀 开始数据迁移';
                    }
                    break;
            }
            
            this.updateStatusElement(this.dom.migrationStatus, statusText, statusClass);
            
            // 检查历史备份状态
            await this.checkBackupStatus();
            
        } catch (error) {
            console.error('检查存储状态失败:', error);
            this.updateStatusElement(this.dom.indexeddbStatus, '检查失败', 'error');
            this.updateStatusElement(this.dom.migrationStatus, '检查失败', 'error');
            this.updateStatusElement(this.dom.backupStatus, '检查失败', 'error');
        }
    }

    updateStatusElement(element, text, className) {
        element.textContent = text;
        element.className = `status-value ${className}`;
    }

    async startMigration() {
        if (!confirm('确定要开始数据迁移吗？这个过程可能需要几分钟时间。')) {
            return;
        }

        try {
            this.dom.migrationBtn.disabled = true;
            this.dom.migrationBtn.textContent = '🔄 迁移中...';
            this.updateStatusElement(this.dom.migrationStatus, '进行中...', 'warning');

            // 设置迁移状态
            await window.dbWrapper.setMigrationStatus('in_progress');

            // 执行迁移
            const migrationResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'startMigration'
                }, resolve);
            });

            if (migrationResult.success) {
                await window.dbWrapper.setMigrationStatus('completed');
                this.updateStatusElement(this.dom.migrationStatus, '已完成', 'success');
                this.dom.migrationBtn.style.display = 'none';
                this.showToast('数据迁移完成！', 'success');
            } else {
                throw new Error(migrationResult.error || '迁移失败');
            }

        } catch (error) {
            console.error('迁移失败:', error);
            await window.dbWrapper.setMigrationStatus('failed');
            this.updateStatusElement(this.dom.migrationStatus, '失败', 'error');
            this.dom.migrationBtn.disabled = false;
            this.dom.migrationBtn.textContent = '🔄 重试迁移';
            this.showToast('迁移失败: ' + error.message, 'error');
        }
    }

    // ======== 历史备份管理 ========
    
    async checkBackupStatus() {
        try {
            const backupStatus = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getBackupStatus'
                }, resolve);
            });

            if (backupStatus.success) {
                this.updateStatusElement(this.dom.backupStatus, '正常', 'success');
                this.dom.backupCount.textContent = backupStatus.totalBackedUpRecords.toLocaleString();
                this.dom.browserHistoryCount.textContent = backupStatus.browserHistoryCount.toLocaleString();
                this.dom.backupCoverage.textContent = `${backupStatus.backupCoverage}%`;
                this.dom.lastBackup.textContent = backupStatus.lastBackupDate;
                
                // 根据备份覆盖率设置颜色
                if (backupStatus.backupCoverage >= 90) {
                    this.updateStatusElement(this.dom.backupCoverage, `${backupStatus.backupCoverage}%`, 'success');
                } else if (backupStatus.backupCoverage >= 70) {
                    this.updateStatusElement(this.dom.backupCoverage, `${backupStatus.backupCoverage}%`, 'warning');
                } else {
                    this.updateStatusElement(this.dom.backupCoverage, `${backupStatus.backupCoverage}%`, 'error');
                }
                
                // 如果需要完整备份，显示提示
                if (backupStatus.needsFullBackup) {
                    this.dom.fullBackupHistoryBtn.style.backgroundColor = '#e74c3c';
                    this.dom.fullBackupHistoryBtn.textContent = '🔄 建议进行完整备份';
                }
                
            } else {
                this.updateStatusElement(this.dom.backupStatus, '异常', 'error');
                this.dom.backupCount.textContent = '0';
                this.dom.browserHistoryCount.textContent = '0';
                this.dom.backupCoverage.textContent = '0%';
                this.dom.lastBackup.textContent = '从未备份';
            }
        } catch (error) {
            console.error('检查备份状态失败:', error);
            this.updateStatusElement(this.dom.backupStatus, '检查失败', 'error');
        }
    }

    async backupHistory() {
        if (!confirm('确定要进行增量备份吗？这将备份自上次备份以来的新历史记录。')) {
            return;
        }

        try {
            this.dom.backupHistoryBtn.disabled = true;
            this.dom.backupHistoryBtn.textContent = '💾 增量备份中...';
            this.updateStatusElement(this.dom.backupStatus, '备份中...', 'warning');

            const backupResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'backupHistory'
                }, resolve);
            });

            if (backupResult.success) {
                this.updateStatusElement(this.dom.backupStatus, '正常', 'success');
                this.showToast(`增量备份完成！${backupResult.message}`, 'success');
                // 刷新备份状态
                await this.checkBackupStatus();
            } else {
                throw new Error(backupResult.error || '备份失败');
            }

        } catch (error) {
            console.error('增量备份失败:', error);
            this.updateStatusElement(this.dom.backupStatus, '备份失败', 'error');
            this.showToast('增量备份失败: ' + error.message, 'error');
        } finally {
            this.dom.backupHistoryBtn.disabled = false;
            this.dom.backupHistoryBtn.textContent = '💾 增量备份历史记录';
        }
    }

    async fullBackupHistory() {
        const message = '确定要进行完整备份吗？\n\n这将备份您的所有历史记录，包括之前未备份的记录。\n对于大量历史记录（如您的10000+条），这个过程可能需要10-20分钟时间。\n\n建议在网络稳定且不急用电脑时进行。';
        
        if (!confirm(message)) {
            return;
        }

        try {
            this.dom.fullBackupHistoryBtn.disabled = true;
            this.dom.backupHistoryBtn.disabled = true;
            this.dom.fullBackupHistoryBtn.textContent = '🔄 完整备份中...';
            this.updateStatusElement(this.dom.backupStatus, '完整备份中...', 'warning');

            // 显示进度提示
            this.showToast('完整备份已开始，请耐心等待...', 'info');

            const backupResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'fullBackupHistory'
                }, resolve);
            });

            if (backupResult.success) {
                this.updateStatusElement(this.dom.backupStatus, '正常', 'success');
                this.showToast(`完整备份成功！${backupResult.message}`, 'success');
                
                // 重置按钮样式
                this.dom.fullBackupHistoryBtn.style.backgroundColor = '';
                this.dom.fullBackupHistoryBtn.textContent = '🔄 完整备份所有历史记录';
                
                // 刷新备份状态
                await this.checkBackupStatus();
            } else {
                throw new Error(backupResult.error || '完整备份失败');
            }

        } catch (error) {
            console.error('完整备份失败:', error);
            this.updateStatusElement(this.dom.backupStatus, '备份失败', 'error');
            this.showToast('完整备份失败: ' + error.message, 'error');
        } finally {
            this.dom.fullBackupHistoryBtn.disabled = false;
            this.dom.backupHistoryBtn.disabled = false;
            if (this.dom.fullBackupHistoryBtn.textContent.includes('备份中')) {
                this.dom.fullBackupHistoryBtn.textContent = '🔄 完整备份所有历史记录';
            }
        }
    }

    showToast(message, type = 'success') {
        // 移除现有的toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // 触发动画
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // 3秒后开始退出动画
        setTimeout(() => {
            toast.classList.remove('show');
            // 动画完成后移除元素
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new MimirSettings();
});
