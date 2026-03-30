# 保留历史分析数据 — 实现方案

## 现状
- `src/lib/storage.ts` 已有完整的 Dexie/IndexedDB 存储模块（saveSession, getSessions, deleteSession），但**从未被使用**
- 每次分析完关闭页面后数据全部丢失
- 首页只有文件上传，没有历史记录入口

## 实现步骤

### 1. 分析完成后自动保存 session（App.tsx）
- 在两个创建 session 的地方（自动分析成功 + TrackSetup 手动完成）调用 `saveSession(session)`
- 导入 storage 模块

### 2. 首页增加历史记录列表（FileUpload.tsx）
- 新增 props：`sessions`（历史列表）、`onLoadSession`、`onDeleteSession`
- 在文件上传区域下方显示历史记录卡片列表
- 每条记录显示：日期、文件名、圈数、最快圈速
- 点击加载，右侧删除按钮（带确认）
- 无历史记录时不显示该区域

### 3. App.tsx 加载和管理历史数据
- 组件挂载时从 IndexedDB 加载历史列表（只取元数据，不加载完整 GPS 数据）
- 传递 sessions 列表给 FileUpload
- 实现 `handleLoadSession`：从 IndexedDB 读取完整 session，设置为当前 session
- 实现 `handleDeleteSession`：从 IndexedDB 删除，刷新列表

### 4. 优化存储结构（storage.ts）
- 新增 `getSessionSummaries()` 方法：只返回 id、filename、date、圈数、最快圈速，避免加载大量 GPS 数据
- 在 SessionRecord 中增加 summary 字段用于快速检索

## 涉及文件
1. `src/lib/storage.ts` — 新增 summary 查询
2. `src/App.tsx` — 导入 storage，保存/加载/删除逻辑
3. `src/components/FileUpload.tsx` — 展示历史记录列表

## 不做的事
- 不做跨 session 对比（后续迭代）
- 不做导出/导入
- 不做按赛道分组
