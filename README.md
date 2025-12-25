# Mimir - 个人记忆与反思仪表盘

## 📁 项目结构

```
浏览历史_/
├── 📄 manifest.json          # 扩展清单
├── 📁 pages/                 # 用户界面页面
│   ├── popup.html            # 弹窗入口
│   ├── dashboard.html        # 仪表盘
│   ├── settings.html         # 设置页面
│   ├── data-manager.html     # 数据管理器
│   ├── dashboard-fixed-buttons.html # 仪表盘按钮模板
│   └── test-markdown-diary.html     # Markdown 日记渲染测试
├── 📁 scripts/               # 业务逻辑脚本
│   ├── background.js         # Service Worker 后台服务
│   ├── popup.js              # 弹窗交互逻辑
│   ├── dashboard.js          # 仪表盘逻辑
│   ├── settings.js           # 设置页面逻辑
│   ├── data-manager.js       # 数据管理器逻辑
│   └── fix-dashboard-encoding.js # 仪表盘字符修复脚本
├── 📁 styles/                # 样式文件
│   ├── popup.css             # 弹窗样式（暖色调主题）
│   ├── dashboard.css         # 仪表盘样式
│   ├── data-manager.css      # 数据管理器样式
│   └── settings.css          # 设置页面样式
├── 📁 lib/                   # IndexedDB 与工具库
│   ├── idb.js
│   ├── mimir-db.js
│   ├── db-wrapper.js
│   ├── migration.js
│   ├── error-handler.js
│   ├── error-handler-sw.js
│   └── error-ui.js
├── 📁 icon/                  # 扩展图标资源
├── 📁 tests/                 # 功能测试与调试页面
├── 📁 docs/                  # 项目文档
└── 🔧 规格文档 (.kiro/specs/) # IndexedDB 迁移规格
    ├── design.md
    └── tasks.md
```

## 🚀 主要功能

### 📊 数据管理
- **历史记录备份**: 自动备份浏览历史，突破浏览器3个月限制
- **智能分类**: AI自动分类浏览内容
- **个性化日记**: 基于浏览数据生成反思日记
- **数据可视化**: 图表展示浏览习惯和趋势

### 🔧 技术特性
- **IndexedDB存储**: 高性能本地数据库存储
- **自动备份**: 每小时自动增量备份
- **错误处理**: 完善的错误处理和恢复机制
- **数据迁移**: 从chrome.storage平滑迁移到IndexedDB

## 📋 使用方法

### 安装
1. 下载项目文件
2. 打开Chrome扩展程序页面 (`chrome://extensions/`)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目文件夹

### 首次设置
1. 点击扩展图标打开设置页面
2. 配置AI API密钥（可选）
3. 点击"完整备份所有历史记录"进行初始备份
4. 在数据管理器中查看备份结果

### 日常使用
- **查看分析**: 点击扩展图标查看仪表盘
- **管理数据**: 在设置页面点击"数据管理"
- **导出数据**: 在数据管理器中导出备份数据
- **自动备份**: 系统每小时自动备份新记录

## 🔍 测试和调试

### 测试页面
- `tests/test-full-history-backup.html` - 完整备份功能测试
- `tests/test-database-fixes.html` - 数据库修复验证
- `tests/test-error-handling.html` - 错误处理测试

### 调试工具
- `tests/background-debug.js` - 调试版后台脚本
- `tests/manifest-debug.json` - 调试版清单文件

## 📚 文档说明

### 用户文档
- `docs/Mimir使用指南.md` - 详细的使用说明
- `docs/数据库问题修复总结.md` - 常见问题解决方案

### 技术文档
- `docs/历史记录限制修复总结.md` - 历史记录限制修复技术细节
- `docs/task9-error-handling-summary.md` - 错误处理系统实现

## 🛠️ 开发说明

### 核心组件
- **MimirDB**: IndexedDB数据库封装类
- **DatabaseWrapper**: chrome.storage兼容接口
- **MimirMigration**: 数据迁移工具
- **ErrorHandler**: 错误处理和恢复系统

### 数据结构
- **history**: 浏览历史记录
- **classified_cache**: AI分类缓存
- **diaries**: 个人日记
- **annual_reports**: 年度报告
- **settings**: 用户设置

## 🔒 隐私保护

- **本地存储**: 所有数据仅存储在用户浏览器中
- **可选AI**: AI功能完全可选，可关闭
- **数据控制**: 用户完全控制自己的数据
- **导出功能**: 支持完整数据导出

## 📞 支持

如遇问题：
1. 查看 `docs/` 目录中的相关文档
2. 使用 `tests/` 目录中的测试页面诊断问题
3. 检查浏览器控制台的错误信息
4. 参考错误处理系统的恢复建议

---

**版本**: 1.0  
**更新时间**: 2024年8月  
**兼容性**: Chrome 88+, Edge 88+