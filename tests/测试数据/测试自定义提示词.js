// 测试自定义提示词功能

console.log('🧪 测试自定义提示词功能');

// 模拟分类数据
const mockClassifiedData = {
    date: '2025-01-01',
    totalItems: 25,
    categories: [
        {
            name: '编程与开发',
            count: 10,
            domains: ['github.com', 'stackoverflow.com'],
            keyTitles: ['React Tutorial', 'JavaScript Guide']
        },
        {
            name: '工作与生产力',
            count: 8,
            domains: ['docs.google.com', 'notion.so'],
            keyTitles: ['Project Planning', 'Meeting Notes']
        },
        {
            name: '其他',
            count: 7,
            domains: ['unknown-site.com'],
            keyTitles: ['Random Content']
        }
    ],
    peakHours: ['14:00-15:59', '20:00-21:59']
};

// 模拟提示词构建器
class PromptBuilder {
    constructor() {
        this.currentDate = '2025-01-01';
    }

    buildDiaryPrompt(classifiedData, config) {
        const customPrompt = config.customPrompt || '';

        // 基础数据上下文（始终包含）
        const dataContext = `基于以下经过分类整理的浏览数据摘要：

数据摘要：
${JSON.stringify(classifiedData, null, 2)}

分析日期：${this.currentDate}
总浏览量：${classifiedData.totalItems} 条
分类数量：${classifiedData.categories?.length || 0} 类
主要活跃时段：${classifiedData.peakHours?.join(', ') || '未知'}`;

        // 默认日记要求
        const defaultRequirements = `
日记要求：
1. 以"今天是${this.currentDate}..."开头
2. 基于分类数据分析我的兴趣焦点和活动模式
3. 从浏览习惯中洞察我的学习轨迹和思考方向
4. 提供温和的建议或启发
5. 用亲切、自然的语言，像朋友聊天一样
6. 避免过于正式的表达
7. 重点关注有意义的活动，忽略无关紧要的浏览

请生成一篇个性化的反思日记：`;

        if (customPrompt.trim()) {
            // 如果有自定义提示词，将其与数据上下文结合
            return `${dataContext}

自定义要求：
${customPrompt}

请基于以上数据和要求生成日记：`;
        } else {
            // 使用默认提示词
            return `${dataContext}${defaultRequirements}`;
        }
    }
}

// 测试不同的配置
function testPromptBuilding() {
    console.log('🚀 开始测试提示词构建...\n');
    
    const builder = new PromptBuilder();
    
    // 测试场景1: 无自定义提示词
    console.log('📝 场景1: 使用默认提示词');
    console.log('=' .repeat(50));
    const config1 = { customPrompt: '' };
    const prompt1 = builder.buildDiaryPrompt(mockClassifiedData, config1);
    console.log(prompt1.substring(0, 300) + '...\n');
    
    // 测试场景2: 有自定义提示词
    console.log('📝 场景2: 使用自定义提示词');
    console.log('=' .repeat(50));
    const config2 = { 
        customPrompt: '请用幽默风趣的语言写日记，多使用表情符号，重点关注我的学习进展和时间管理' 
    };
    const prompt2 = builder.buildDiaryPrompt(mockClassifiedData, config2);
    console.log(prompt2.substring(0, 300) + '...\n');
    
    // 测试场景3: 诗意风格
    console.log('📝 场景3: 诗意风格');
    console.log('=' .repeat(50));
    const config3 = { 
        customPrompt: '用诗意的语言描述我的数字生活，像写散文一样优美，关注内心的感受和思考' 
    };
    const prompt3 = builder.buildDiaryPrompt(mockClassifiedData, config3);
    console.log(prompt3.substring(0, 300) + '...\n');
    
    // 测试场景4: 分析导向
    console.log('📝 场景4: 分析导向');
    console.log('=' .repeat(50));
    const config4 = { 
        customPrompt: '重点分析我的时间分配和效率，给出具体的改进建议，用数据说话' 
    };
    const prompt4 = builder.buildDiaryPrompt(mockClassifiedData, config4);
    console.log(prompt4.substring(0, 300) + '...\n');
}

// 测试上下文保留
function testContextPreservation() {
    console.log('🔍 测试上下文保留...\n');
    
    const builder = new PromptBuilder();
    const config = { 
        customPrompt: '请用简洁的语言' 
    };
    
    const prompt = builder.buildDiaryPrompt(mockClassifiedData, config);
    
    // 检查是否包含关键上下文信息
    const contextChecks = [
        { key: '数据摘要', exists: prompt.includes('数据摘要') },
        { key: '分析日期', exists: prompt.includes('分析日期') },
        { key: '总浏览量', exists: prompt.includes('总浏览量') },
        { key: '分类数量', exists: prompt.includes('分类数量') },
        { key: '主要活跃时段', exists: prompt.includes('主要活跃时段') },
        { key: '自定义要求', exists: prompt.includes('自定义要求') },
        { key: '原始数据', exists: prompt.includes('编程与开发') }
    ];
    
    console.log('上下文检查结果:');
    contextChecks.forEach(check => {
        console.log(`${check.exists ? '✅' : '❌'} ${check.key}`);
    });
    
    const passedChecks = contextChecks.filter(c => c.exists).length;
    const totalChecks = contextChecks.length;
    
    console.log(`\n上下文保留率: ${passedChecks}/${totalChecks} (${(passedChecks/totalChecks*100).toFixed(1)}%)`);
}

// 对比新旧方式
function compareOldVsNew() {
    console.log('\n📊 对比新旧提示词方式...\n');
    
    const customPrompt = '请用幽默的语言写日记';
    
    // 旧方式：完全替换
    console.log('❌ 旧方式（完全替换）:');
    console.log('=' .repeat(30));
    console.log(customPrompt);
    console.log('问题：丢失了所有浏览数据上下文！\n');
    
    // 新方式：结合上下文
    console.log('✅ 新方式（保留上下文）:');
    console.log('=' .repeat(30));
    const builder = new PromptBuilder();
    const newPrompt = builder.buildDiaryPrompt(mockClassifiedData, { customPrompt });
    console.log(newPrompt.substring(0, 200) + '...');
    console.log('优势：保留了完整的数据上下文，只是改变了写作风格！');
}

// 执行所有测试
testPromptBuilding();
testContextPreservation();
compareOldVsNew();

console.log('\n✅ 所有测试完成!');