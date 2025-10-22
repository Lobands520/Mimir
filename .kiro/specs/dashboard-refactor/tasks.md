# Implementation Plan

- [x] 1. 重构HTML结构为单列流式布局
  - 将 `.main-content-grid` 改为 `.main-content-flow`，移除左右网格布局
  - 使用 HTML5 `<details>` 和 `<summary>` 元素实现浏览历史的可折叠功能
  - 重新组织HTML结构，确保所有内容区域按垂直顺序排列
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

- [ ] 2. 重构CSS组件系统
- [x] 2.1 创建基础卡片组件和修饰符类
  - 定义统一的 `.card` 基类，包含通用样式（background, border-radius, box-shadow, padding）
  - 创建BEM风格的修饰符类：`.card--analysis`, `.card--diary`, `.card--collapsible`
  - 实现可折叠卡片的CSS样式，包括展开/收起动画效果
  - _Requirements: 4.1, 4.2, 2.3_

- [x] 2.2 实现工具类和简化选择器
  - 创建原子化CSS工具类用于间距、字体大小等常用属性
  - 简化现有的深层嵌套选择器，降低CSS耦合度
  - 移除重复的卡片样式代码，统一使用基础组件
  - _Requirements: 4.3, 4.4, 4.5_

- [x] 2.3 优化响应式布局
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 3. 创建JavaScript模块化架构
- [ ] 3.1 实现StateService状态管理模块
  - 创建 `StateService` 类，管理应用的中央状态
  - 实现状态订阅机制，支持组件监听状态变化
  - 定义完整的状态数据结构（currentDate, historyData, analysisResult等）
  - 编写状态管理的单元测试
  - _Requirements: 5.1, 5.3, 5.4_

- [ ] 3.2 实现UIManager界面管理模块
  - 创建 `UIManager` 类，负责所有DOM操作和UI渲染
  - 实现模板函数替代HTML字符串拼接
  - 创建专门的渲染方法：`renderDataOverview`, `renderHistoryList`, `renderAnalysisSection`
  - 实现加载状态和错误提示的统一管理
  - _Requirements: 5.1, 5.2, 5.4_

- [ ] 3.3 重构DataProcessor数据处理模块
  - 从原有的 `MimirDashboard` 类中提取数据处理逻辑
  - 创建独立的 `DataProcessor` 类处理数据分类和统计
  - 实现数据预处理、规则分类和统计计算功能
  - 为数据可视化准备结构化数据
  - _Requirements: 5.1, 6.5_

- [ ] 3.4 创建ApiService和ReportGenerator模块
  - 实现 `ApiService` 类封装所有API调用（AI分类、日记生成）
  - 创建 `ReportGenerator` 类专门处理年度报告生成和数据导出
  - 实现网络状态检查和错误处理机制
  - 保持与现有API接口的兼容性
  - _Requirements: 5.1, 6.2, 6.3, 6.4_

- [ ] 4. 实现增强的数据可视化功能
- [ ] 4.1 创建24小时时间轴图表
  - 实现 `TimelineChart` 类，显示一天中的浏览活动分布
  - 使用CSS和JavaScript创建24小时的柱状图表
  - 添加交互功能，鼠标悬停显示详细信息
  - 集成到分析区域的多列网格布局中
  - _Requirements: 3.1, 3.5_

- [ ] 4.2 实现分类占比饼图
  - 创建 `CategoryPieChart` 类，使用CSS conic-gradient或SVG实现饼图
  - 显示各个分类的占比情况，替代纯文本百分比
  - 添加图例和标签，提供清晰的数据展示
  - 实现响应式设计，适配不同屏幕尺寸
  - _Requirements: 3.2, 3.5_

- [ ] 4.3 开发关键词云功能
  - 实现 `KeywordCloud` 类，从浏览标题中提取高频关键词
  - 创建词云可视化，词汇大小反映出现频率
  - 实现中英文关键词提取和过滤算法
  - 添加点击关键词的交互功能
  - _Requirements: 3.3, 3.5_

- [ ] 4.4 优化现有域名排行榜显示
  - 保持现有排行榜功能，优化视觉样式
  - 在更宽的布局中改进排行榜的展示效果
  - 添加更多的交互元素和视觉反馈
  - _Requirements: 3.4, 3.5_

- [ ] 5. 集成模块并实现状态驱动的UI更新
- [ ] 5.1 创建主应用控制器
  - 创建新的主控制器类替代原有的 `MimirDashboard`
  - 实现依赖注入，协调各个模块之间的交互
  - 建立状态变化到UI更新的完整数据流
  - 确保所有事件监听器正确绑定到新的模块系统
  - _Requirements: 5.1, 5.3, 5.4_

- [ ] 5.2 实现模板引擎系统
  - 创建 `TemplateEngine` 类，提供组件化的HTML模板生成
  - 实现常用组件的模板函数：卡片、按钮、列表项等
  - 替换所有现有的HTML字符串拼接代码
  - 添加模板缓存机制提升性能
  - _Requirements: 5.2, 5.4_

- [ ] 6. 保持功能兼容性和性能优化
- [ ] 6.1 验证所有现有功能正常工作
  - 测试每日/年度视图切换功能
  - 验证AI分析和日记生成功能
  - 确保数据导出和保存功能正常
  - 测试设置页面和配置功能
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6.2 实现性能优化
  - 添加数据缓存机制，避免重复计算
  - 实现懒加载，按需渲染大型数据集
  - 优化DOM操作，减少重排和重绘
  - 添加防抖和节流机制处理用户交互
  - _Requirements: 6.6, 7.2_

- [ ] 6.3 错误处理和用户体验改进
  - 实现统一的错误处理机制
  - 添加更友好的加载状态提示
  - 优化网络错误和API失败的用户反馈
  - 确保所有交互元素在触摸设备上正常工作
  - _Requirements: 7.3, 7.4_


- [ ] 8. 代码清理和文档更新
- [ ] 8.1 清理旧代码和优化结构
  - 删除原有的 `MimirDashboard` 类和相关冗余代码
  - 清理未使用的CSS样式和JavaScript函数
  - 优化代码注释和变量命名
  - 确保代码符合一致的编码规范
  - _Requirements: 4.5, 5.4_

- [ ] 8.2 更新项目文档
  - 更新代码注释，说明新的模块架构
  - 创建组件使用说明和API文档
  - 更新README文件，反映新的项目结构
  - 记录重构过程中的重要决策和变更
  - _Requirements: 5.1, 5.2_
