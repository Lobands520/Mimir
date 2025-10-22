// 测试自定义分类规则功能

console.log('🧪 测试自定义分类规则功能');

// 模拟自定义规则
const customRules = [
    {
        category: '工作与生产力',
        type: 'domain',
        value: 'company.internal',
        createdAt: '2025-01-01T00:00:00.000Z'
    },
    {
        category: '编程与开发',
        type: 'domain',
        value: 'my-blog.dev',
        createdAt: '2025-01-01T00:00:00.000Z'
    },
    {
        category: '学术与教育',
        type: 'keyword',
        value: '教程',
        createdAt: '2025-01-01T00:00:00.000Z'
    },
    {
        category: '生活与消费',
        type: 'keyword',
        value: '购物',
        createdAt: '2025-01-01T00:00:00.000Z'
    }
];

// 测试数据
const testItems = [
    { title: 'Company Wiki - 项目文档', domain: 'wiki.company.internal' },
    { title: 'My Blog - JavaScript教程', domain: 'my-blog.dev' },
    { title: '淘宝购物 - 商品详情', domain: 'taobao.com' },
    { title: 'Python入门教程', domain: 'unknown-site.com' },
    { title: 'GitHub - user/repo', domain: 'github.com' },
    { title: 'Random Site', domain: 'random.example' }
];

// 模拟分类函数
function classifyItemWithCustomRules(item, customRules) {
    const domain = item.domain;
    const title = item.title.toLowerCase();
    
    console.log(`\n🔍 分类: ${item.title}`);
    console.log(`   域名: ${domain}`);
    
    // 1. 自定义规则优先匹配
    if (customRules && customRules.length > 0) {
        for (const rule of customRules) {
            if (rule.type === 'domain' && domain.includes(rule.value)) {
                console.log(`   ✅ 自定义域名规则匹配: ${rule.value} → ${rule.category}`);
                return rule.category;
            }
            if (rule.type === 'keyword' && title.includes(rule.value)) {
                console.log(`   ✅ 自定义关键词规则匹配: ${rule.value} → ${rule.category}`);
                return rule.category;
            }
        }
    }
    
    // 2. 系统默认规则（简化版）
    if (domain.includes('github.com')) {
        console.log(`   📋 系统规则匹配: github.com → 编程与开发`);
        return '编程与开发';
    }
    if (domain.includes('taobao.com')) {
        console.log(`   📋 系统规则匹配: taobao.com → 生活与消费`);
        return '生活与消费';
    }
    
    // 3. 默认分类
    console.log(`   ❓ 无匹配规则 → 其他`);
    return '其他';
}

// 运行测试
function runCustomRulesTest() {
    console.log('🚀 开始测试自定义规则...\n');
    
    console.log('📋 当前自定义规则:');
    customRules.forEach((rule, index) => {
        console.log(`${index + 1}. [${rule.category}] ${rule.type === 'domain' ? '域名' : '关键词'}: ${rule.value}`);
    });
    
    console.log('\n🎯 测试分类结果:');
    
    const results = {};
    testItems.forEach(item => {
        const category = classifyItemWithCustomRules(item, customRules);
        if (!results[category]) {
            results[category] = [];
        }
        results[category].push(item);
    });
    
    console.log('\n📊 分类统计:');
    Object.entries(results).forEach(([category, items]) => {
        console.log(`${category}: ${items.length} 个`);
        items.forEach(item => {
            console.log(`  - ${item.title}`);
        });
    });
    
    // 计算自定义规则效果
    const customRuleMatches = testItems.filter(item => {
        const category = classifyItemWithCustomRules(item, customRules);
        // 检查是否是通过自定义规则匹配的
        for (const rule of customRules) {
            if (rule.type === 'domain' && item.domain.includes(rule.value)) {
                return true;
            }
            if (rule.type === 'keyword' && item.title.toLowerCase().includes(rule.value)) {
                return true;
            }
        }
        return false;
    });
    
    console.log(`\n✨ 自定义规则效果:`);
    console.log(`- 总测试条目: ${testItems.length} 个`);
    console.log(`- 自定义规则匹配: ${customRuleMatches.length} 个`);
    console.log(`- 匹配率: ${(customRuleMatches.length / testItems.length * 100).toFixed(1)}%`);
    
    console.log('\n✅ 测试完成!');
}

// 测试规则管理功能
function testRuleManagement() {
    console.log('\n🔧 测试规则管理功能...');
    
    let rules = [...customRules];
    
    // 添加规则
    const newRule = {
        category: '娱乐与视频',
        type: 'domain',
        value: 'my-video-site.com',
        createdAt: new Date().toISOString()
    };
    
    rules.push(newRule);
    console.log(`✅ 添加规则: ${newRule.value} → ${newRule.category}`);
    
    // 删除规则
    const indexToRemove = rules.findIndex(r => r.value === 'company.internal');
    if (indexToRemove !== -1) {
        const removedRule = rules.splice(indexToRemove, 1)[0];
        console.log(`❌ 删除规则: ${removedRule.value} → ${removedRule.category}`);
    }
    
    console.log(`\n📋 最终规则列表 (${rules.length} 个):`);
    rules.forEach((rule, index) => {
        console.log(`${index + 1}. [${rule.category}] ${rule.type === 'domain' ? '域名' : '关键词'}: ${rule.value}`);
    });
}

// 执行测试
runCustomRulesTest();
testRuleManagement();