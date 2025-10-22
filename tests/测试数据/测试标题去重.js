// 测试标题去重和优化功能

console.log('🧪 测试标题去重和优化功能');

// 模拟重复和相似的标题数据
const testTitles = [
    'infinity backroom story at DuckDuckGo',
    'infinity backroom story at DuckDuckGo', // 完全重复
    'n8n at DuckDuckGo',
    'n8n at DuckDuckGo', // 完全重复
    'JavaScript Tutorial - Learn JS',
    'JavaScript Tutorial - Complete Guide', // 相似
    'GitHub - user/repo',
    'GitHub - another/project', // 相似但不同
    'New Tab', // 无意义
    'Loading...', // 无意义
    'abc123', // 无意义
    'Python编程教程',
    'Python编程入门教程', // 相似
    'React开发指南',
    'Vue.js文档'
];

// 模拟分类统计对象
class MockCategoryStats {
    constructor() {
        this.keyTitles = [];
    }
}

// 模拟标题处理方法
class TitleProcessor {
    // 清理标题
    cleanTitle(title) {
        return title
            .replace(/\s+at\s+\w+\.\w+$/gi, '') // 移除 "at domain.com" 后缀
            .replace(/\s*-\s*\w+\.\w+$/gi, '') // 移除 "- domain.com" 后缀
            .replace(/^\w+\.\w+\s*[-:]\s*/gi, '') // 移除域名前缀
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

    // 智能添加关键标题
    addKeyTitle(categoryStats, title) {
        console.log(`\n🔍 处理标题: "${title}"`);
        
        // 清理标题
        const cleanTitle = this.cleanTitle(title);
        console.log(`   清理后: "${cleanTitle}"`);
        
        // 如果标题太短或无意义，跳过
        if (cleanTitle.length < 3) {
            console.log(`   ❌ 跳过: 标题太短`);
            return;
        }
        
        if (this.isUnmeaningfulTitle(cleanTitle)) {
            console.log(`   ❌ 跳过: 无意义标题`);
            return;
        }
        
        // 检查是否已有相似标题
        const similarTitle = categoryStats.keyTitles.find(existingTitle => 
            this.isSimilarTitle(cleanTitle, existingTitle)
        );
        
        if (similarTitle) {
            console.log(`   ❌ 跳过: 与"${similarTitle}"相似`);
            return;
        }
        
        if (categoryStats.keyTitles.length >= 5) {
            console.log(`   ❌ 跳过: 已达到最大数量(5个)`);
            return;
        }
        
        categoryStats.keyTitles.push(cleanTitle);
        console.log(`   ✅ 添加成功`);
    }
}

// 运行测试
function runTitleDeduplicationTest() {
    console.log('🚀 开始测试标题去重...\n');
    
    const processor = new TitleProcessor();
    const categoryStats = new MockCategoryStats();
    
    console.log('📋 原始标题列表:');
    testTitles.forEach((title, index) => {
        console.log(`${index + 1}. ${title}`);
    });
    
    console.log('\n🔄 处理过程:');
    testTitles.forEach(title => {
        processor.addKeyTitle(categoryStats, title);
    });
    
    console.log('\n📊 最终结果:');
    console.log(`原始标题数量: ${testTitles.length}`);
    console.log(`最终保留数量: ${categoryStats.keyTitles.length}`);
    console.log(`去重率: ${((testTitles.length - categoryStats.keyTitles.length) / testTitles.length * 100).toFixed(1)}%`);
    
    console.log('\n✨ 最终关键标题:');
    categoryStats.keyTitles.forEach((title, index) => {
        console.log(`${index + 1}. ${title}`);
    });
    
    console.log('\n✅ 测试完成!');
}

// 测试清理功能
function testTitleCleaning() {
    console.log('\n🧹 测试标题清理功能...');
    
    const processor = new TitleProcessor();
    const testCases = [
        'infinity backroom story at DuckDuckGo',
        'n8n at DuckDuckGo',
        'JavaScript Tutorial - github.com',
        'github.com: user/repo',
        'Python   编程    教程',
        'React开发指南'
    ];
    
    testCases.forEach(title => {
        const cleaned = processor.cleanTitle(title);
        console.log(`"${title}" → "${cleaned}"`);
    });
}

// 测试相似度判断
function testSimilarityDetection() {
    console.log('\n🔍 测试相似度判断...');
    
    const processor = new TitleProcessor();
    const testPairs = [
        ['JavaScript Tutorial', 'JavaScript Tutorial'], // 完全相同
        ['JavaScript Tutorial', 'JavaScript Tutorial - Complete Guide'], // 相似
        ['Python编程教程', 'Python编程入门教程'], // 相似
        ['GitHub - user/repo', 'GitHub - another/project'], // 相似但不同
        ['React开发指南', 'Vue.js文档'] // 不相似
    ];
    
    testPairs.forEach(([title1, title2]) => {
        const similar = processor.isSimilarTitle(title1, title2);
        console.log(`"${title1}" vs "${title2}": ${similar ? '相似' : '不相似'}`);
    });
}

// 执行所有测试
runTitleDeduplicationTest();
testTitleCleaning();
testSimilarityDetection();