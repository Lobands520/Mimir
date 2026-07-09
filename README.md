# Mimir

一个用于长期保存浏览历史、做本地分析并生成 AI 日记的浏览器扩展。

## 当前结构

- `background.js`
  统一后台入口，负责历史采集、定时补偿同步和消息分发。
- `lib/mimir-config.js`
  公共配置、分类映射、默认设置和日期工具。
- `lib/mimir-db.js`
  IndexedDB 数据层，保存历史、分类缓存、日记、年度报告和设置。
- `lib/db-wrapper.js`
  兼容旧页面的键值包装层。
- `lib/mimir-core.js`
  核心服务层，负责备份状态、迁移、建议规则和后台任务。
- `dashboard.html` / `dashboard.js`
  仪表盘、AI 分析和日记生成页面。
- `settings.html` / `settings.js`
  AI 配置、自定义规则、迁移和备份状态。
- `data-manager.html` / `data-manager.js`
  数据查看、筛选、删除和导出。

## 保留的能力

- 浏览历史分析与分类
- AI 增强分类
- 自定义日记 Prompt
- 认知模式快报 Prompt
- 年度报告与面板入口

## 重构方向

- 扩展负责采集、分析和本地缓存
- IndexedDB 作为主本地数据库
- 后续可继续接入 GitHub 或其他外部归档层做长期备份

## 开发方式

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 载入当前目录
