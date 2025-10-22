// 测试改进后的AI分类效果

console.log('🧪 测试改进后的AI分类功能');

// 模拟测试数据
const testData = [
    { title: 'GitHub - user/repo', domain: 'github.com', timestamp: Date.now() },
    { title: 'Stack Overflow - How to...', domain: 'stackoverflow.com', timestamp: Date.now() },
    { title: 'Unknown Blog Post', domain: 'unknown-blog.com', timestamp: Date.now() },
    { title: 'Random Tool Documentation', domain: 'random-tool.io', timestamp: Date.now() },
    { title: 'Some Shopping Site', domain: 'shop-example.net', timestamp: Date.now() },
    { title: 'New Tab', domain: 'chrome://newtab', timestamp: Date.now() },
];

// 测试规则分类
function testRuleClassification() {
    console.log('\n📋 测试规则分类...');
    
    let classified = 0;
    let other = 0;
    
    testData.forEach(item => {
        // 模拟分类逻辑
        if (item.domain.includes('github.com') || item.domain.includes('stackoverflow.com')) {
            classified++;
            console.log(`✅ ${item.title} → 编程与开发`);
        } else if (item.domain.includes('chrome://')) {
            console.log(`🚫 ${item.title} → 已过滤`);
        } else {
            other++;
            console.log(`❓ ${item.title} → 其他`);
        }
    });
    
    const coverageRate = (classified / (classified + other)) * 100;
    console.log(`\n📊 规则分类结果:`);
    console.log(`- 成功分类: ${classified} 个`);
    console.log(`- 其他类别: ${other} 个`);
    console.log(`- 覆盖率: ${coverageRate.toFixed(1)}%`);
    
    return { classified, other, coverageRate };
}

// 测试AI分类触发条件
function testAITriggerConditions(ruleResult) {
    console.log('\n🤖 测试AI分类触发条件...');
    
    const { coverageRate, other } = ruleResult;
    
    console.log(`当前覆盖率: ${coverageRate.toFixed(1)}%`);
    console.log(`未分类条目: ${other} 个`);
    
    // 新的触发条件
    const shouldTriggerAI = coverageRate < 60 || other > 3;
    
    if (shouldTriggerAI) {
        console.log('✅ 满足AI分类触发条件');
        console.log('原因:', coverageRate < 60 ? '覆盖率低于60%' : '未分类条目超过3个');
    } else {
        console.log('❌ 不满足AI分类触发条件');
    }
    
    return shouldTriggerAI;
}

// 模拟AI分类效果
function simulateAIClassification(otherCount) {
    console.log('\n🎯 模拟AI分类效果...');
    
    // 假设AI能成功重分类70%的"其他"条目
    const successRate = 0.7;
    const reclassified = Math.floor(otherCount * successRate);
    const remaining = otherCount - reclassified;
    
    console.log(`AI处理结果:`);
    console.log(`- 成功重分类: ${reclassified} 个`);
    console.log(`- 剩余其他: ${remaining} 个`);
    console.log(`- 改进率: ${(successRate * 100).toFixed(1)}%`);
    
    return { reclassified, remaining, successRate };
}

// 运行测试
function runTest() {
    console.log('🚀 开始测试...\n');
    
    const ruleResult = testRuleClassification();
    const shouldTriggerAI = testAITriggerConditions(ruleResult);
    
    if (shouldTriggerAI) {
        const aiResult = simulateAIClassification(ruleResult.other);
        
        console.log('\n📈 最终效果对比:');
        console.log(`改进前 - 其他类别: ${ruleResult.other} 个`);
        console.log(`改进后 - 其他类别: ${aiResult.remaining} 个`);
        console.log(`总体改进: ${ruleResult.other - aiResult.remaining} 个条目被重新分类`);
    }
    
    console.log('\n✅ 测试完成!');
}

// 执行测试
runTest();