// 测试写日记按钮功能
console.log('🧪 测试写日记按钮功能...');

function testDiaryButtons() {
    console.log('🔍 检查按钮元素...');
    
    // 检查分析按钮
    const analyzeBtn = document.getElementById('analyzeBtn');
    console.log('分析数据按钮:', analyzeBtn ? '✅ 存在' : '❌ 不存在');
    
    // 检查导出分析按钮
    const exportAnalysisBtn = document.getElementById('exportAnalysisBtn');
    console.log('导出分析按钮:', exportAnalysisBtn ? '✅ 存在' : '❌ 不存在');
    if (exportAnalysisBtn) {
        console.log('  - 显示状态:', exportAnalysisBtn.style.display);
        console.log('  - 计算样式:', getComputedStyle(exportAnalysisBtn).display);
    }
    
    // 检查生成日记按钮
    const generateDiaryBtn = document.getElementById('generateDiaryBtn');
    console.log('生成日记按钮:', generateDiaryBtn ? '✅ 存在' : '❌ 不存在');
    if (generateDiaryBtn) {
        console.log('  - 显示状态:', generateDiaryBtn.style.display);
        console.log('  - 计算样式:', getComputedStyle(generateDiaryBtn).display);
    }
    
    // 检查分析区域
    const analysisSection = document.getElementById('analysisSection');
    console.log('分析区域:', analysisSection ? '✅ 存在' : '❌ 不存在');
    
    if (analysisSection) {
        const analysisActions = analysisSection.querySelector('.analysis-actions');
        console.log('分析操作区域:', analysisActions ? '✅ 存在' : '❌ 不存在');
        
        if (analysisActions) {
            const buttons = analysisActions.querySelectorAll('button');
            console.log(`操作按钮数量: ${buttons.length}`);
            buttons.forEach((btn, index) => {
                console.log(`  按钮 ${index + 1}: ${btn.id || '无ID'} - ${btn.textContent.trim()}`);
                console.log(`    显示状态: ${btn.style.display || '默认'}`);
                console.log(`    计算样式: ${getComputedStyle(btn).display}`);
            });
        }
    }
    
    // 检查日记区域
    const diarySection = document.getElementById('diarySection');
    console.log('日记区域:', diarySection ? '✅ 存在' : '❌ 不存在');
    if (diarySection) {
        console.log('  - 显示状态:', diarySection.style.display);
        console.log('  - 计算样式:', getComputedStyle(diarySection).display);
    }
}

function simulateAnalysis() {
    console.log('🎭 模拟分析过程...');
    
    // 模拟分析数据
    const mockData = {
        date: '2025-01-01',
        totalItems: 25,
        categories: [
            {
                name: '编程与开发',
                count: 10,
                domains: ['github.com', 'stackoverflow.com'],
                keyTitles: ['Python 教程', 'JavaScript 问题'],
                timeRange: '09:00-11:59'
            },
            {
                name: '新闻与资讯',
                count: 8,
                domains: ['mp.weixin.qq.com'],
                keyTitles: ['技术新闻', '行业动态'],
                timeRange: '08:00-09:59'
            },
            {
                name: '其他',
                count: 7,
                domains: ['unknown.com'],
                keyTitles: ['未分类内容'],
                timeRange: '12:00-13:59'
            }
        ],
        peakHours: ['08:00-09:59', '09:00-11:59'],
        topDomains: [
            { domain: 'github.com', count: 10 },
            { domain: 'mp.weixin.qq.com', count: 8 }
        ]
    };
    
    // 检查是否有MimirDashboard实例
    if (typeof window.mimirDashboard !== 'undefined') {
        console.log('✅ 找到MimirDashboard实例');
        try {
            window.mimirDashboard.displayAnalysis(mockData);
            console.log('✅ 模拟分析数据已显示');
            
            // 显示按钮
            const exportBtn = document.getElementById('exportAnalysisBtn');
            const diaryBtn = document.getElementById('generateDiaryBtn');
            
            if (exportBtn) {
                exportBtn.style.display = 'inline-block';
                console.log('✅ 导出按钮已显示');
            }
            
            if (diaryBtn) {
                diaryBtn.style.display = 'inline-block';
                console.log('✅ 生成日记按钮已显示');
            }
            
        } catch (error) {
            console.error('❌ 模拟分析失败:', error);
        }
    } else {
        console.log('❌ 未找到MimirDashboard实例');
        
        // 手动显示按钮
        const exportBtn = document.getElementById('exportAnalysisBtn');
        const diaryBtn = document.getElementById('generateDiaryBtn');
        
        if (exportBtn) {
            exportBtn.style.display = 'inline-block';
            console.log('✅ 手动显示导出按钮');
        }
        
        if (diaryBtn) {
            diaryBtn.style.display = 'inline-block';
            console.log('✅ 手动显示生成日记按钮');
        }
    }
}

function testDiaryGeneration() {
    console.log('📝 测试日记生成功能...');
    
    const diaryBtn = document.getElementById('generateDiaryBtn');
    if (diaryBtn && diaryBtn.style.display !== 'none') {
        console.log('✅ 生成日记按钮可见，尝试点击...');
        
        // 模拟点击
        diaryBtn.click();
        
        // 检查日记区域是否显示
        setTimeout(() => {
            const diarySection = document.getElementById('diarySection');
            if (diarySection && getComputedStyle(diarySection).display !== 'none') {
                console.log('✅ 日记区域已显示');
            } else {
                console.log('❌ 日记区域未显示');
            }
        }, 100);
    } else {
        console.log('❌ 生成日记按钮不可见或不存在');
    }
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testDiaryButtons,
        simulateAnalysis,
        testDiaryGeneration
    };
}

console.log('📋 写日记按钮测试准备完成');
console.log('使用方法:');
console.log('- testDiaryButtons(): 检查按钮状态');
console.log('- simulateAnalysis(): 模拟分析过程');
console.log('- testDiaryGeneration(): 测试日记生成');