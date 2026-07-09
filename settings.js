class MimirSettings {
  constructor() {
    this.config = MimirConfig.mergeConfig({});
    this.dom = this.collectDom();
    this.init();
  }

  collectDom() {
    return {
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
      indexeddbStatus: document.getElementById('indexeddbStatus'),
      migrationStatus: document.getElementById('migrationStatus'),
      migrationBtn: document.getElementById('migrationBtn'),
      checkStorageBtn: document.getElementById('checkStorageBtn'),
      backupStatus: document.getElementById('backupStatus'),
      backupCount: document.getElementById('backupCount'),
      browserHistoryCount: document.getElementById('browserHistoryCount'),
      backupCoverage: document.getElementById('backupCoverage'),
      lastBackup: document.getElementById('lastBackup'),
      backupHistoryBtn: document.getElementById('backupHistoryBtn'),
      fullBackupHistoryBtn: document.getElementById('fullBackupHistoryBtn')
    };
  }

  async init() {
    if (window.dbWrapper) {
      await window.dbWrapper.initialize();
    }

    this.setupEventListeners();
    await this.loadSettings();
    await this.loadSuggestions();
    await this.checkStorageStatus();
  }

  setupEventListeners() {
    this.dom.saveBtn.addEventListener('click', () => this.saveSettings());
    this.dom.resetBtn.addEventListener('click', () => this.resetSettings());
    this.dom.addRuleBtn.addEventListener('click', () => this.addCustomRule());
    this.dom.migrationBtn.addEventListener('click', () => this.startMigration());
    this.dom.checkStorageBtn.addEventListener('click', () => this.checkStorageStatus());
    this.dom.backupHistoryBtn.addEventListener('click', () => this.backupHistory());
    this.dom.fullBackupHistoryBtn.addEventListener('click', () => this.fullBackupHistory());
    this.dom.rulesContainer.addEventListener('click', (event) => this.handleRuleAction(event));
    this.dom.suggestionsContainer.addEventListener('click', (event) => this.applySuggestion(event));
  }

  renderForm() {
    this.dom.apiKey.value = this.config.apiKey || '';
    this.dom.apiUrl.value = this.config.apiUrl || MimirConfig.DEFAULT_CONFIG.apiUrl;
    this.dom.model.value = this.config.model || MimirConfig.DEFAULT_CONFIG.model;
    this.dom.diaryModel.value = this.config.diaryModel || MimirConfig.DEFAULT_CONFIG.diaryModel;
    this.dom.useAI.checked = this.config.useAIClassification !== false;
    this.dom.customPrompt.value = this.config.customPrompt || '';
    this.dom.enableDiaryComparison.checked = this.config.enableDiaryComparison === true;
    this.dom.enableStreaming.checked = this.config.enableStreaming !== false;
    this.renderCustomRules(this.config.customRules || []);
  }

  collectConfigFromForm() {
    return MimirConfig.mergeConfig({
      apiKey: this.dom.apiKey.value.trim(),
      apiUrl: this.dom.apiUrl.value.trim() || MimirConfig.DEFAULT_CONFIG.apiUrl,
      model: this.dom.model.value.trim() || MimirConfig.DEFAULT_CONFIG.model,
      diaryModel: this.dom.diaryModel.value.trim() || MimirConfig.DEFAULT_CONFIG.diaryModel,
      useAIClassification: this.dom.useAI.checked,
      customPrompt: this.dom.customPrompt.value.trim(),
      enableDiaryComparison: this.dom.enableDiaryComparison.checked,
      enableStreaming: this.dom.enableStreaming.checked,
      customRules: this.config.customRules || []
    });
  }

  async loadSettings() {
    const result = await window.dbWrapper.get('mimir-config');
    this.config = MimirConfig.mergeConfig(result['mimir-config'] || {});
    this.renderForm();
  }

  async saveSettings() {
    try {
      this.config = this.collectConfigFromForm();
      await window.dbWrapper.set({ 'mimir-config': this.config });
      this.showToast('设置已保存');
      await this.loadSuggestions();
    } catch (error) {
      this.showToast(`保存设置失败: ${error.message}`, 'error');
    }
  }

  async resetSettings() {
    if (!confirm('确定要重置所有设置吗？')) {
      return;
    }

    this.config = MimirConfig.mergeConfig({});
    this.renderForm();
    await window.dbWrapper.set({ 'mimir-config': this.config });
    this.showToast('已恢复默认设置');
    await this.loadSuggestions();
  }

  renderCustomRules(rules) {
    if (!rules || rules.length === 0) {
      this.dom.rulesContainer.innerHTML = '<div class="placeholder" style="padding: 20px;">暂无自定义规则</div>';
      return;
    }

    this.dom.rulesContainer.innerHTML = rules.map((rule, index) => `
      <div class="rule-item">
        <div class="rule-info">
          <span class="rule-value">${rule.value}</span>
          <span class="rule-arrow">→</span>
          <span class="rule-category">${rule.category}</span>
          <span class="rule-arrow">(${rule.type === 'domain' ? '域名' : '关键词'})</span>
        </div>
        <button class="btn btn-sm btn-secondary delete-rule-btn" data-index="${index}" title="删除规则">&times;</button>
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
      value: value,
      type: this.dom.newRuleType.value,
      category: this.dom.newRuleCategory.value
    };

    const exists = (this.config.customRules || []).some((rule) => {
      return rule.value === newRule.value && rule.type === newRule.type;
    });

    if (exists) {
      this.showToast('该规则已存在', 'error');
      return;
    }

    this.config.customRules = [newRule].concat(this.config.customRules || []);
    this.dom.newRuleValue.value = '';
    this.renderCustomRules(this.config.customRules);
    this.showToast(`已添加规则: ${newRule.value}`);
  }

  handleRuleAction(event) {
    const button = event.target.closest('.delete-rule-btn');
    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);
    if (!confirm('确定要删除这个规则吗？')) {
      return;
    }

    this.config.customRules.splice(index, 1);
    this.renderCustomRules(this.config.customRules);
    this.showToast('规则已删除');
    this.loadSuggestions();
  }

  async loadSuggestions() {
    this.dom.suggestionsContainer.innerHTML = '<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">正在分析常用网站...</div>';

    try {
      const data = await MimirCoreClient.send('getSuggestionData');
      if (!data || !Array.isArray(data.history) || data.history.length === 0) {
        this.dom.suggestionsContainer.innerHTML = '<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">没有足够的浏览数据来生成建议。</div>';
        return;
      }

      const allRules = (data.builtInRules || []).concat(this.config.customRules || []);
      const uncoveredDomains = {};

      data.history.forEach((item) => {
        try {
          const domain = MimirConfig.normalizeDomain(new URL(item.url).hostname);
          const covered = allRules.some((rule) => {
            return rule.type === 'domain' && domain.includes(rule.value);
          });

          if (!covered) {
            uncoveredDomains[domain] = (uncoveredDomains[domain] || 0) + 1;
          }
        } catch (_error) {
        }
      });

      const suggestions = Object.entries(uncoveredDomains)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([domain]) => domain);

      if (suggestions.length === 0) {
        this.dom.suggestionsContainer.innerHTML = '<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">🎉 常用网站已经有分类规则了。</div>';
        return;
      }

      this.dom.suggestionsContainer.innerHTML = suggestions.map((domain) => {
        return `<button class="suggestion-tag" data-value="${domain}">${domain}</button>`;
      }).join('');
    } catch (error) {
      this.dom.suggestionsContainer.innerHTML = `<div class="placeholder" style="width: 100%; padding: 10px; font-size: 13px;">建议加载失败: ${error.message}</div>`;
    }
  }

  applySuggestion(event) {
    const button = event.target.closest('.suggestion-tag');
    if (!button) {
      return;
    }

    this.dom.newRuleValue.value = button.dataset.value;
    this.dom.newRuleType.value = 'domain';
    this.dom.newRuleValue.focus();
    this.showToast(`已填入 ${button.dataset.value}`);
  }

  updateStatusElement(element, text, className) {
    element.textContent = text;
    element.className = `status-value ${className}`;
  }

  async checkStorageStatus() {
    try {
      const [indexedDBAvailable, migrationStatus, backupStatus] = await Promise.all([
        window.dbWrapper.isIndexedDBAvailable(),
        window.dbWrapper.getMigrationStatus(),
        MimirCoreClient.send('getBackupStatus')
      ]);

      this.updateStatusElement(
        this.dom.indexeddbStatus,
        indexedDBAvailable ? '可用' : '不可用',
        indexedDBAvailable ? 'success' : 'error'
      );

      if (migrationStatus === 'completed') {
        this.updateStatusElement(this.dom.migrationStatus, '已完成', 'success');
        this.dom.migrationBtn.style.display = 'none';
      } else if (migrationStatus === 'failed') {
        this.updateStatusElement(this.dom.migrationStatus, '失败', 'error');
        this.dom.migrationBtn.style.display = 'inline-block';
        this.dom.migrationBtn.textContent = '🔄 重试迁移';
      } else if (migrationStatus === 'in_progress') {
        this.updateStatusElement(this.dom.migrationStatus, '进行中', 'warning');
        this.dom.migrationBtn.style.display = 'none';
      } else {
        this.updateStatusElement(this.dom.migrationStatus, '未开始', 'info');
        this.dom.migrationBtn.style.display = indexedDBAvailable ? 'inline-block' : 'none';
        this.dom.migrationBtn.textContent = '🚀 开始数据迁移';
      }

      if (!backupStatus || !backupStatus.success) {
        throw new Error((backupStatus && backupStatus.error) || '无法读取备份状态');
      }

      this.updateStatusElement(this.dom.backupStatus, '正常', 'success');
      this.dom.backupCount.textContent = backupStatus.totalBackedUpRecords.toLocaleString();
      this.dom.browserHistoryCount.textContent = backupStatus.browserHistoryCount.toLocaleString();
      this.dom.lastBackup.textContent = backupStatus.lastBackupDate;

      const coverageClass = backupStatus.backupCoverage >= 90
        ? 'success'
        : backupStatus.backupCoverage >= 70
          ? 'warning'
          : 'error';

      this.updateStatusElement(this.dom.backupCoverage, `${backupStatus.backupCoverage}%`, coverageClass);

      if (backupStatus.needsFullBackup) {
        this.dom.fullBackupHistoryBtn.style.backgroundColor = '#e74c3c';
        this.dom.fullBackupHistoryBtn.textContent = '🔄 建议进行完整备份';
      } else {
        this.dom.fullBackupHistoryBtn.style.backgroundColor = '';
        this.dom.fullBackupHistoryBtn.textContent = '🔄 完整备份所有历史记录';
      }
    } catch (error) {
      this.updateStatusElement(this.dom.indexeddbStatus, '检查失败', 'error');
      this.updateStatusElement(this.dom.migrationStatus, '检查失败', 'error');
      this.updateStatusElement(this.dom.backupStatus, '检查失败', 'error');
      this.showToast(`存储状态检查失败: ${error.message}`, 'error');
    }
  }

  async startMigration() {
    if (!confirm('确定要开始数据迁移吗？')) {
      return;
    }

    this.dom.migrationBtn.disabled = true;
    this.dom.migrationBtn.textContent = '🔄 迁移中...';
    this.updateStatusElement(this.dom.migrationStatus, '进行中', 'warning');

    try {
      const result = await MimirCoreClient.send('startMigration');
      if (!result.success) {
        throw new Error(result.error || '迁移失败');
      }

      this.showToast(result.message || '迁移完成');
      await this.checkStorageStatus();
    } catch (error) {
      this.updateStatusElement(this.dom.migrationStatus, '失败', 'error');
      this.showToast(`迁移失败: ${error.message}`, 'error');
    } finally {
      this.dom.migrationBtn.disabled = false;
    }
  }

  async backupHistory() {
    if (!confirm('确定要进行增量备份吗？')) {
      return;
    }

    await this.runBackupAction('backupHistory', this.dom.backupHistoryBtn, '💾 增量备份中...');
  }

  async fullBackupHistory() {
    if (!confirm('确定要进行完整备份吗？这可能需要较长时间。')) {
      return;
    }

    this.dom.backupHistoryBtn.disabled = true;
    await this.runBackupAction('fullBackupHistory', this.dom.fullBackupHistoryBtn, '🔄 完整备份中...');
    this.dom.backupHistoryBtn.disabled = false;
    await this.checkStorageStatus();
  }

  async runBackupAction(action, button, pendingText) {
    button.disabled = true;
    button.textContent = pendingText;
    this.updateStatusElement(this.dom.backupStatus, '备份中', 'warning');

    try {
      const result = await MimirCoreClient.send(action);
      if (!result.success) {
        throw new Error(result.error || '备份失败');
      }

      this.showToast(result.message || '备份完成');
      await this.checkStorageStatus();
    } catch (error) {
      this.updateStatusElement(this.dom.backupStatus, '备份失败', 'error');
      this.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
      if (button === this.dom.backupHistoryBtn) {
        button.textContent = '💾 增量备份历史记录';
      }
    }
  }

  showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MimirSettings();
});
