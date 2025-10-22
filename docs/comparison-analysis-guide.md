# 📊 Mimir 对比分析功能详解

## 🎯 功能概述

对比分析功能是Mimir的核心创新，它不仅记录你的浏览行为，更重要的是**追踪你的认知进化**。通过对比前后两天的日记，系统能够识别你的思维模式变化、行为进步和认知升级。

## 🔧 技术实现原理

### 1. 数据流程

```
今日浏览数据 → 分类分析 → 生成日记提示词 → 获取前一天日记 → 构建对比上下文 → AI分析 → 生成对比日记
```

### 2. 核心函数解析

#### `buildDiaryPrompt(classifiedData, config)` - 异步函数

**作用**：构建包含对比信息的AI提示词

**实现步骤**：

1. **基础数据上下文**：
   ```javascript
   const dataContext = `基于以下经过分类整理的浏览数据摘要：
   
   数据摘要：${JSON.stringify(classifiedData, null, 2)}
   分析日期：${this.currentDate}
   总浏览量：${classifiedData.totalItems} 条
   分类数量：${classifiedData.categories?.length || 0} 类
   主要活跃时段：${classifiedData.peakHours?.join(', ') || '未知'}`;
   ```

2. **对比上下文构建**：
   ```javascript
   let comparisonContext = '';
   if (config.enableDiaryComparison) {
       const previousDiary = await this.getPreviousDiary();
       if (previousDiary) {
           comparisonContext = `
   
   前一天日记内容：
   ${previousDiary}
   
   对比要求：请分析今天与前一天的行为模式变化，识别进步、退步或新的模式。`;
       }
   }
   ```

3. **最终提示词组合**：
   ```javascript
   return `${dataContext}${comparisonContext}${defaultCognitivePrompt}`;
   ```

#### `getPreviousDiary()` - 获取前一天日记

**作用**：从数据库中获取前一天的日记内容

**实现逻辑**：
```javascript
async getPreviousDiary() {
    try {
        // 计算前一天日期
        const currentDate = new Date(this.currentDate);
        currentDate.setDate(currentDate.getDate() - 1);
        const previousDate = currentDate.toISOString().split('T')[0];
        
        // 从数据库获取
        const diaryKey = `diary-${previousDate}`;
        const result = await window.dbWrapper.get(diaryKey);
        return result[diaryKey] || null;
    } catch (error) {
        console.warn('获取前一天日记失败:', error);
        return null;
    }
}
```

## 🧠 认知模式分析框架

### 四层思想阶梯

1. **阶梯一 - 本能与冲动**
   - 特征：即时满足驱动
   - 示例：刷短视频、看八卦、冲动消费
   - 识别：娱乐、社交、购物类浏览

2. **阶梯二 - 规则与角色**
   - 特征：外部规则与社会角色驱动
   - 示例：完成工作任务、学习专业技能、处理日程
   - 识别：工作、学习、生产力类浏览

3. **阶梯三 - 自我与反思**
   - 特征：内在探索与个人价值驱动
   - 示例：搜索哲学问题、进行自我分析、规划人生
   - 识别：哲学、心理学、个人成长类浏览

4. **阶梯四 - 整合与超越**
   - 特征：系统性思考与利他驱动
   - 示例：参与开源贡献、研究宏观议题
   - 识别：开源项目、社会议题、系统性研究

### 分析工作流

1. **[映射]**：将每个浏览活动映射到思想阶梯
2. **[识别]**：确定主导模式和次要模式，识别能量流动
3. **[生成]**：输出结构化的认知模式快报

## 📝 默认提示词详解

### Profile 设定
```
- language: 中文
- description: 一个客观、深刻的分析引擎，基于结构化的浏览摘要，生成一份纯文本的"认知模式快报"
```

### 风格戒律
- **纯文本**：禁止任何Markdown标记
- **语气**：冷静、克制、精确
- **术语**：可以犀利点评，监督用户
- **证据为王**：所有分析必须标注证据来源
- **禁忌**：禁止第一人称、说教、建议

## 🎨 自定义提示词

### 如何自定义？

1. **在设置页面**：
   - 找到"自定义日记提示词"文本框
   - 输入你的自定义要求
   - 保存设置

2. **自定义示例**：
   ```
   请用幽默风趣的语言分析我的浏览行为，多使用表情符号，
   重点关注我的学习进展和时间管理，给出具体的改进建议。
   ```

3. **自定义与对比的结合**：
   - 自定义提示词会与对比上下文结合
   - 最终提示词格式：`数据上下文 + 对比上下文 + 自定义要求`

### 自定义提示词的优势

- **个性化风格**：可以要求特定的写作风格
- **关注重点**：可以指定分析的重点领域
- **输出格式**：可以要求特定的输出格式
- **情感色彩**：可以调整分析的情感倾向

## 🔄 对比分析示例

### 输入数据结构

**今日数据**：
```json
{
  "date": "2025-01-04",
  "totalItems": 45,
  "categories": [
    {
      "name": "自我与反思",
      "count": 20,
      "keyTitles": ["哲学思辨", "自我分析"]
    }
  ]
}
```

**前一天日记**：
```
认知模式快报 - 2025-01-03

主导模式：规则与角色驱动。大量时间投入工作任务处理。
次要模式：本能冲动零星出现。
能量流动：任务执行向本能冲动的泄压模式。
```

### 对比分析输出

```
认知模式快报 - 2025-01-04

主导模式：自我与反思驱动。相比昨日的任务导向，今日更多投入个人成长。

模式进化：从昨日的"规则-本能"二元模式，跃迁至"反思-整合"的高阶模式。

行为变化：娱乐时间减少60%，学习深度提升，出现系统性思考迹象。

对比洞察：昨日的工作压力"泄压"模式转变为今日的主动"跃迁"模式。
```

## ⚙️ 配置选项

### 在设置中的配置

1. **启用日记对比**：
   - 配置键：`enableDiaryComparison`
   - 默认值：`false`
   - 作用：控制是否启用对比分析

2. **自定义提示词**：
   - 配置键：`customPrompt`
   - 默认值：空字符串（使用默认认知模式分析）
   - 作用：自定义分析风格和要求

3. **流式传输**：
   - 配置键：`enableStreaming`
   - 默认值：`true`
   - 作用：实时显示日记生成过程

### 配置的持久化

```javascript
// 保存配置
this.config.enableDiaryComparison = this.dom.enableDiaryComparison.checked;
this.config.customPrompt = this.dom.customPrompt.value.trim();

// 加载配置
this.dom.enableDiaryComparison.checked = this.config.enableDiaryComparison === true;
this.dom.customPrompt.value = this.config.customPrompt || '';
```

## 🚀 使用建议

### 最佳实践

1. **连续使用**：至少连续使用3-7天才能看到明显的对比效果
2. **保持一致**：尽量在相同时间段生成日记，确保对比的有效性
3. **关注趋势**：重点关注认知模式的长期趋势，而非单日变化
4. **结合反思**：将对比结果作为自我反思的素材

### 进阶技巧

1. **周期性分析**：可以手动对比一周前、一月前的日记
2. **模式识别**：识别自己的认知模式周期和规律
3. **目标导向**：设定认知升级目标，通过对比追踪进展
4. **习惯养成**：利用对比分析来强化好习惯、改正坏习惯

## 🔍 故障排除

### 常见问题

1. **对比功能不生效**：
   - 检查设置中是否启用了"日记对比"
   - 确保前一天存在日记记录

2. **对比内容不准确**：
   - 检查前一天日记的质量和完整性
   - 考虑调整自定义提示词

3. **生成速度慢**：
   - 对比分析需要处理更多上下文，生成时间会稍长
   - 可以关闭流式传输来加快速度

### 调试方法

1. **查看控制台日志**：
   ```javascript
   console.log('前一天日记:', previousDiary);
   console.log('对比上下文:', comparisonContext);
   ```

2. **测试数据**：
   - 使用测试页面 `tests/test-diary-comparison.html`
   - 创建测试日记验证功能

## 📈 未来扩展

### 可能的增强功能

1. **多日对比**：支持与多天前的日记对比
2. **周期性分析**：自动识别周、月、季度的认知模式变化
3. **可视化对比**：图表展示认知模式的变化趋势
4. **智能建议**：基于对比结果提供个性化的改进建议

---

通过这个对比分析系统，Mimir不再只是一个简单的浏览记录工具，而是成为了你的**认知进化伙伴**，帮助你持续追踪和优化自己的思维模式。