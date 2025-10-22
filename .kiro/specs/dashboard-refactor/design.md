# Design Document

## Overview

This design document outlines the comprehensive refactoring of the Mimir Dashboard browser extension. The refactoring transforms the current left-right grid layout into a modern single-column flow layout, implements modular JavaScript architecture, enhances data visualization capabilities, and introduces collapsible UI components for better space management.

The design follows a component-based approach with clear separation of concerns, making the codebase more maintainable and extensible while preserving all existing functionality.

## Architecture

### High-Level Architecture

The refactored dashboard follows a modular architecture pattern:

┌─────────────────────────────────────────────────────────────┐ │ Presentation Layer │ ├─────────────────────────────────────────────────────────────┤ │ HTML Templates │ CSS Components │ UI Event Handlers │ ├─────────────────────────────────────────────────────────────┤ │ Application Layer │ ├─────────────────────────────────────────────────────────────┤ │ UIManager │ StateService │ DataProcessor │ ReportGen │ ├─────────────────────────────────────────────────────────────┤ │ Service Layer │ ├─────────────────────────────────────────────────────────────┤ │ ApiService │ StorageService │ ├─────────────────────────────────────────────────────────────┤ │ Data Layer │ ├─────────────────────────────────────────────────────────────┤ │ Chrome Storage API │ Chrome Runtime API │ └─────────────────────────────────────────────────────────────┘


### Core Design Principles

1. **Single Responsibility**: Each module handles one specific concern
2. **Dependency Injection**: Services are injected rather than directly instantiated
3. **State-Driven UI**: UI updates are triggered by state changes
4. **Component Reusability**: CSS and JS components can be reused across different sections
5. **Progressive Enhancement**: Core functionality works without advanced features

## Components and Interfaces

### JavaScript Modules

#### 1. StateService
Manages all application state in a centralized manner.

```javascript
class StateService {
    constructor() {
        this.state = {
            currentDate: new Date().toISOString().split('T')[0],
            currentView: 'daily', // 'daily' | 'annual'
            historyData: [],
            analysisResult: null,
            diaryContent: null,
            isLoading: false,
            error: null
        };
        this.subscribers = [];
    }

    setState(updates) { /* Update state and notify subscribers */ }
    getState() { /* Return current state */ }
    subscribe(callback) { /* Subscribe to state changes */ }
}
2. UIManager
Handles all DOM manipulation and UI rendering.

class UIManager {
    constructor(stateService) {
        this.stateService = stateService;
        this.templates = new TemplateEngine();
    }

    renderDataOverview(data) { /* Render overview cards */ }
    renderHistoryList(data) { /* Render browsing history */ }
    renderAnalysisSection(data) { /* Render analysis with visualizations */ }
    renderDiarySection(content) { /* Render diary content */ }
    showLoading(section) { /* Show loading spinner */ }
    showError(message) { /* Display error message */ }
}
3. DataProcessor
Processes and analyzes browsing data.

class DataProcessor {
    constructor() {
        this.categories = [...];
        this.domainMapping = {...};
        this.keywordMapping = {...};
    }

    preprocessData(rawData) { /* Clean and normalize data */ }
    classifyData(data) { /* Apply rule-based classification */ }
    generateStatistics(data) { /* Calculate statistics */ }
    createVisualizationData(data) { /* Prepare data for charts */ }
}
4. ApiService
Handles all external API communications.

class ApiService {
    constructor(config) {
        this.config = config;
    }

    async classifyWithAI(data) { /* AI classification */ }
    async generateDiary(analysisData) { /* AI diary generation */ }
    async checkNetworkStatus() { /* Network connectivity check */ }
}
5. ReportGenerator
Generates annual reports and exports.

class ReportGenerator {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
    }

    async generateAnnualReport(year) { /* Generate annual report */ }
    exportAnalysis(data, format) { /* Export analysis data */ }
    exportDiary(content, format) { /* Export diary content */ }
}
CSS Component System
Base Components
/* Base card component */
.card {
    background-color: var(--bg-card);
    border-radius: var(--border-radius-lg);
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: var(--shadow-md);
    border: 1px solid var(--border-color);
}

/* Card modifiers */
.card--collapsible { /* Collapsible card styles */ }
.card--analysis { /* Analysis-specific styles */ }
.card--diary { /* Diary-specific styles */ }
Layout Components
/* Main flow layout */
.main-content-flow {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
}

/* Collapsible card */
.collapsible-card {
    background-color: var(--bg-card);
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-md);
    margin-bottom: 24px;
}

.collapsible-card-header {
    padding: 20px 24px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
}

.collapsible-card-content {
    padding: 24px;
}
HTML Structure
New Layout Structure
<main class="main-content-flow">
    <!-- Data Overview (unchanged) -->
    <div id="dataOverview" class="data-overview">...</div>
    
    <!-- Collapsible History Section -->
    <details class="collapsible-card" open>
        <summary class="collapsible-card-header">
            <h3>今日浏览历史</h3>
            <span class="collapsible-indicator">▼</span>
        </summary>
        <div class="collapsible-card-content">
            <div id="historyList" class="history-list">...</div>
        </div>
    </details>
    
    <!-- Enhanced Analysis Section -->
    <div id="analysisSection" class="card card--analysis">
        <div class="analysis-grid">
            <div class="analysis-summary">...</div>
            <div class="analysis-visualizations">
                <div class="timeline-chart">...</div>
                <div class="category-pie-chart">...</div>
                <div class="keyword-cloud">...</div>
            </div>
        </div>
    </div>
    
    <!-- Diary Section -->
    <div id="diarySection" class="card card--diary">...</div>
</main>
Data Models
State Model
const AppState = {
    currentDate: String,        // ISO date string
    currentView: String,        // 'daily' | 'annual'
    historyData: Array,         // Raw browsing history
    analysisResult: {
        date: String,
        totalItems: Number,
        categories: Array,
        peakHours: Array,
        topDomains: Array,
        visualizations: {
            timeline: Array,
            categoryDistribution: Array,
            keywordCloud: Array
        }
    },
    diaryContent: String,
    isLoading: Boolean,
    error: String | null
};
Analysis Data Model
const AnalysisResult = {
    date: String,
    totalItems: Number,
    categories: [{
        name: String,
        count: Number,
        percentage: Number,
        domains: Array,
        keyTitles: Array,
        timeRange: String
    }],
    peakHours: Array,
    topDomains: [{
        domain: String,
        count: Number
    }],
    visualizations: {
        timeline: [{
            hour: Number,
            count: Number
        }],
        categoryDistribution: [{
            category: String,
            value: Number,
            color: String
        }],
        keywordCloud: [{
            word: String,
            frequency: Number,
            size: Number
        }]
    }
};
Error Handling
Error Categories
Network Errors: API connectivity issues
Data Errors: Invalid or corrupted data
UI Errors: DOM manipulation failures
Storage Errors: Chrome storage API failures
Error Handling Strategy
class ErrorHandler {
    static handle(error, context) {
        console.error(`Error in ${context}:`, error);
        
        switch (error.type) {
            case 'NETWORK_ERROR':
                UIManager.showError('网络连接失败，请检查网络设置');
                break;
            case 'API_ERROR':
                UIManager.showError('API调用失败，请检查配置');
                break;
            case 'DATA_ERROR':
                UIManager.showError('数据处理失败，请刷新重试');
                break;
            default:
                UIManager.showError('发生未知错误，请重试');
        }
    }
}
Testing Strategy
Unit Testing
StateService: Test state management and subscription system
DataProcessor: Test data classification and statistics generation
UIManager: Test DOM manipulation and template rendering
ApiService: Test API calls with mocked responses
Integration Testing
Data Flow: Test complete data processing pipeline
UI Updates: Test state-driven UI updates
Error Scenarios: Test error handling across modules
Manual Testing
Layout Responsiveness: Test on different screen sizes
Collapsible Functionality: Test expand/collapse behavior
Data Visualization: Test chart rendering and interactions
Performance: Test with large datasets
Enhanced Data Visualization
Timeline Chart
24小时时间轴图表，显示浏览活动的高峰和低谷：

class TimelineChart {
    constructor(container) {
        this.container = container;
    }
    
    render(data) {
        // Create 24-hour timeline with activity bars
        const hours = Array.from({length: 24}, (_, i) => i);
        const chartData = hours.map(hour => ({
            hour,
            count: data.filter(item => 
                new Date(item.timestamp).getHours() === hour
            ).length
        }));
        
        this.renderBars(chartData);
    }
}
Category Pie Chart
使用CSS和SVG实现的分类占比图：

.pie-chart {
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: conic-gradient(
        var(--color-primary) 0deg 120deg,
        var(--color-success) 120deg 200deg,
        var(--color-warning) 200deg 280deg,
        var(--color-secondary) 280deg 360deg
    );
}
Keyword Cloud
从浏览内容中提取关键词并生成词云：

class KeywordCloud {
    constructor(container) {
        this.container = container;
    }
    
    generateKeywords(titles) {
        // Extract and rank keywords from titles
        const words = titles
            .join(' ')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .reduce((acc, word) => {
                acc[word] = (acc[word] || 0) + 1;
                return acc;
            }, {});
            
        return Object.entries(words)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 20);
    }
    
    render(keywords) {
        // Render keywords with size based on frequency
    }
}
Performance Optimizations
Lazy Loading
延迟加载大型数据集
按需渲染可视化组件
虚拟滚动处理长列表
Caching Strategy
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.maxAge = 5 * 60 * 1000; // 5 minutes
    }
    
    set(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }
        
        return item.data;
    }
}
Memory Management
及时清理事件监听器
避免内存泄漏
优化DOM操作
Responsive Design
Breakpoints
/* Mobile First Approach */
.main-content-flow {
    padding: 16px;
}

@media (min-width: 768px) {
    .main-content-flow {
        padding: 24px;
    }
    
    .analysis-grid {
        grid-template-columns: 1fr 1fr;
    }
}

@media (min-width: 1024px) {
    .analysis-grid {
        grid-template-columns: 1fr 2fr;
    }
}
Touch-Friendly Design
增大点击目标尺寸
优化触摸交互
支持手势操作
Migration Strategy
Phase 1: Layout Refactoring
更新HTML结构为单列布局
重构CSS组件系统
实现可折叠功能
Phase 2: JavaScript Modularization
拆分MimirDashboard类
实现状态管理系统
创建模板引擎
Phase 3: Enhanced Visualizations
实现时间轴图表
添加分类饼图
创建关键词云
Phase 4: Testing and Optimization
单元测试覆盖
性能优化
用户体验改进
Security Considerations
Data Privacy
本地数据处理优先
最小化API数据传输
用户数据加密存储
API Security
API密钥安全存储
请求频率限制
错误信息脱敏
Content Security Policy
严格的CSP策略
防止XSS攻击
安全的第三方资源加载