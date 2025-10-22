// 测试每日视图布局修复
console.log('🔧 测试每日视图布局修复...');

// 模拟分类数据
const mockClassifiedData = {
    date: '2025-01-01',
    totalItems: 50,
    categories: [
        {
            name: '编程与开发',
            count: 15,
            domains: ['github.com', 'stackoverflow.com', 'docs.python.org'],
            keyTitles: ['Python 文档', 'GitHub 仓库', 'Stack Overflow 问题'],
            timeRange: '09:00-11:59'
        },
        {
            name: '工作与生产力',
            count: 10,
            domains: ['docs.google.com', 'mail.google.com'],
            keyTitles: ['工作文档', '邮件处理'],
            timeRange: '14:00-15:59'
        },
        {
            name: '新闻与资讯',
            count: 16,
            domains: ['mp.weixin.qq.com', 'news.ycombinator.com'],
            keyTitles: ['技术新闻', '行业资讯', '产品发布'],
            timeRange: '08:00-09:59'
        },
        {
            name: '娱乐与视频',
            count: 5,
            domains: ['bilibili.com', 'youtube.com'],
            keyTitles: ['技术视频', '娱乐内容'],
            timeRange: '20:00-21:59'
        },
        {
            name: '其他',
            count: 4,
            domains: ['unknown.com', 'random.site'],
            keyTitles: ['未分类内容'],
            timeRange: '12:00-13:59'
        }
    ],
    peakHours: ['08:00-09:59', '14:00-15:59', '20:00-21:59'],
    topDomains: [
        { domain: 'mp.weixin.qq.com', count: 16 },
        { domain: 'github.com', count: 8 },
        { domain: 'docs.google.com', count: 6 },
        { domain: 'stackoverflow.com', count: 4 },
        { domain: 'bilibili.com', count: 3 }
    ]
};

// 测试函数
function testDailyViewLayout() {
    console.log('📊 测试数据概览卡片...');
    
    // 检查数据概览网格
    const dataOverview = document.querySelector('.data-overview');
    if (dataOverview) {
        console.log('✅ 数据概览容器存在');
        const overviewCards = dataOverview.querySelectorAll('.overview-card');
        console.log(`📈 概览卡片数量: ${overviewCards.length}`);
    } else {
        console.log('❌ 数据概览容器不存在');
    }
    
    console.log('🏗️ 测试主内容网格...');
    
    // 检查主内容网格
    const mainGrid = document.querySelector('.main-content-grid');
    if (mainGrid) {
        console.log('✅ 主内容网格存在');
        const historySection = mainGrid.querySelector('.history-section');
        const analysisSection = mainGrid.querySelector('.analysis-section');
        
        if (historySection) console.log('✅ 历史记录区域存在');
        if (analysisSection) console.log('✅ 分析结果区域存在');
    } else {
        console.log('❌ 主内容网格不存在');
    }
    
    console.log('🎯 测试分类卡片布局...');
    
    // 检查分类网格
    const categoriesGrid = document.querySelector('.categories-grid');
    if (categoriesGrid) {
        console.log('✅ 分类网格存在');
        const categoryCards = categoriesGrid.querySelectorAll('.category-card');
        console.log(`🏷️ 分类卡片数量: ${categoryCards.length}`);
        
        // 检查每个卡片的结构
        categoryCards.forEach((card, index) => {
            const header = card.querySelector('.category-header');
            const meta = card.querySelector('.category-meta');
            const keyTitles = card.querySelector('.key-titles');
            const domains = card.querySelector('.main-domains');
            
            console.log(`卡片 ${index + 1}:`);
            console.log(`  - 标题区域: ${header ? '✅' : '❌'}`);
            console.log(`  - 元数据区域: ${meta ? '✅' : '❌'}`);
            console.log(`  - 关键标题: ${keyTitles ? '✅' : '❌'}`);
            console.log(`  - 主要域名: ${domains ? '✅' : '❌'}`);
        });
    } else {
        console.log('❌ 分类网格不存在');
    }
    
    console.log('📱 测试响应式布局...');
    
    // 检查响应式样式
    const viewportWidth = window.innerWidth;
    console.log(`当前视口宽度: ${viewportWidth}px`);
    
    if (viewportWidth <= 480) {
        console.log('📱 移动设备布局');
    } else if (viewportWidth <= 768) {
        console.log('📱 平板设备布局');
    } else if (viewportWidth <= 1200) {
        console.log('💻 小屏桌面布局');
    } else {
        console.log('🖥️ 大屏桌面布局');
    }
}

// 测试CSS变量
function testCSSVariables() {
    console.log('🎨 测试CSS变量...');
    
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    const cssVars = [
        '--color-primary',
        '--color-success',
        '--bg-card',
        '--text-primary',
        '--border-color',
        '--shadow-md',
        '--border-radius-lg'
    ];
    
    cssVars.forEach(varName => {
        const value = computedStyle.getPropertyValue(varName);
        console.log(`${varName}: ${value || '未定义'}`);
    });
}

// 模拟displayAnalysis函数测试
function testDisplayAnalysis() {
    console.log('🧪 测试displayAnalysis函数...');
    
    const analysisContent = document.getElementById('analysisContent');
    if (!analysisContent) {
        console.log('❌ analysisContent 元素不存在');
        return;
    }
    
    // 生成测试HTML
    let html = `
        <div class="analysis-summary">
            <div class="summary-item">
                <div class="summary-label">总浏览量</div>
                <div class="summary-value">${mockClassifiedData.totalItems} 条</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">分类数量</div>
                <div class="summary-value">${mockClassifiedData.categories.length} 类</div>
            </div>
        </div>
        <div class="categories-grid">
    `;
    
    mockClassifiedData.categories.forEach((category, index) => {
        const isOtherCategory = category.name === '其他';
        const percentage = Math.round(category.count / mockClassifiedData.totalItems * 100);
        
        html += `
            <div class="category-card" data-category="${category.name}">
                <div class="category-header">
                    <h4>${category.name}${isOtherCategory ? ' ⚠️' : ''}</h4>
                    <span class="percentage">${percentage}%</span>
                </div>
                
                <div class="category-meta">
                    <span class="category-count">${category.count} 条记录</span>
                    <span class="category-time">${category.timeRange}</span>
                </div>
                
                <ul class="key-titles">
                    ${category.keyTitles.map(title =>
                        `<li title="${title}">${title}</li>`
                    ).join('')}
                </ul>
                
                <div class="main-domains">
                    <h5>主要网站</h5>
                    <div class="domain-list">
                        ${category.domains.map(domain =>
                            `<span class="domain-tag">${domain}</span>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    analysisContent.innerHTML = html;
    console.log('✅ 测试HTML已插入');
    
    // 测试布局
    setTimeout(() => {
        testDailyViewLayout();
    }, 100);
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testDailyViewLayout,
        testCSSVariables,
        testDisplayAnalysis,
        mockClassifiedData
    };
}

console.log('🎯 每日视图布局修复测试准备完成');
console.log('使用方法:');
console.log('- testDailyViewLayout(): 测试布局结构');
console.log('- testCSSVariables(): 测试CSS变量');
console.log('- testDisplayAnalysis(): 测试分析显示');