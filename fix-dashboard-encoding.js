// 修复dashboard.html中的字符编码问题
// 在浏览器控制台中运行此脚本

// 修复按钮文本
const analyzeBtn = document.getElementById('analyzeBtn');
if (analyzeBtn) {
    analyzeBtn.innerHTML = '🔍 仅分析数据';
}

const generateAnnualBtn = document.getElementById('generateAnnualBtn');
if (generateAnnualBtn) {
    generateAnnualBtn.innerHTML = '📈 生成年度报告';
}

console.log('✅ 按钮文本已修复');