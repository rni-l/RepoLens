# RepoLens 项目库信息架构与批量打标 Spec

## Summary

新增 spec 文档：`docs/plan/2026-06-22-project-library-navigation-and-bulk-tagging-spec.md`。

目标是把当前“项目库 + 右侧堆叠面板”改成更清晰的桌面工作台：

- 项目详情默认隐藏，点击项目后用覆盖式右抽屉打开。
- 项目清单显示 `createdAt` 和 `updatedAt`。
- 项目支持多选，并批量追加标签。
- 左侧菜单栏从宽侧栏收窄为紧凑导航。
- “扫描源 / 标签 / 设置”成为真正独立页面。
- 页面路由使用轻量 History API：`/library`、`/tags`、`/scan-sources`、`/settings`，不新增 React Router 依赖。

## Key Changes

- 项目库页：
  - 移除常驻右侧 `side-stack`，项目表格占满主内容区。
  - 点击项目行打开右侧覆盖式抽屉；抽屉支持关闭按钮、遮罩点击、`Esc` 关闭，并在关闭后回到列表上下文。
  - `ProjectDetailPanel` 改造成可嵌入抽屉的详情表单，保存逻辑保持现有 `updateProject` 行为。

- 项目表格：
  - 增加行选择 checkbox 和表头全选 checkbox。
  - 桌面列：选择、项目、标签、状态、创建时间、最后更新时间、打开方式。
  - 移动端把时间压缩到项目名下的元信息行。
  - 时间使用本地格式 `YYYY-MM-DD HH:mm`；`createdAt/updatedAt` 表示 RepoLens 索引记录时间，不替代 `lastModifiedAt`。

- 批量打标：
  - 选择项目后显示批量工具栏。
  - 默认语义为“追加标签”，不覆盖已有标签。
  - 标签选择复用层级标签选择器；提交后清空选择并刷新列表。
  - 空选择、空标签、接口错误都要有明确禁用态或 toast。

- 独立页面：
  - `TagsPage`：全页标签管理，左侧标签树，右侧创建/重命名/移动/删除表单。
  - `ScanSourcesPage`：内联添加扫描源表单，扫描源列表支持启停、单个扫描、移除确认、扫描全部。
  - `SettingsPage`：本次做状态页增强，不新增持久设置；展示扫描源统计、打开方式可用性、AI 打标状态。
  - 左侧导航宽度从当前约 `272px` 收窄到约 `208px`，移除底部扫描卡片；中等宽度继续折叠为图标栏。

## API And Types

- 扩展 `ProjectListItem`：
  - 新增 `createdAt: string`
  - 新增 `updatedAt: string`

- 新增批量打标类型：
  - `BulkTagProjectsInput = { projectIds: string[]; tagIds: string[]; mode: "append" }`
  - `BulkTagProjectsResult = { updatedCount: number; updatedProjects: ProjectListItem[]; updatedAt: string }`

- 扩展 `AppApi`：
  - `bulkTagProjects(input: BulkTagProjectsInput): Promise<BulkTagProjectsResult>`

- 后端行为：
  - 在 SQLite transaction 内校验项目和标签存在。
  - 对每个项目/tag 使用 `INSERT OR IGNORE` 写入 `project_tag_links`。
  - 更新受影响项目的 `updated_at`。
  - CLI、Tauri Rust command、`src/lib/tauri.ts`、`mockApi` 都要暴露同名能力。

## Test Plan

- 后端测试：
  - `listProjects()` 返回 `createdAt/updatedAt`。
  - 批量追加标签会保留原有标签、去重、更新多个项目。
  - 空项目、空标签、未知项目、未知标签返回明确错误。
  - 批量失败时不产生部分写入。

- 前端验证：
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - 手动检查 `/library`、`/tags`、`/scan-sources`、`/settings` 直达和导航跳转。
  - 手动检查抽屉关闭、批量选择、批量追加标签、窄屏表格布局。

## Assumptions

- 批量打标只做“追加标签”，不做替换或批量移除。
- 设置页本次不新增 settings 表/API。
- History 模式可用：Tauri v1 配置文档说明 `distDir` 会嵌入前端资源并默认查找 `index.html`，Tauri v1 release note 也记录了为 history router 回退到 `index.html` 的能力；实现后仍必须验证生产包直达路径。参考：[Tauri v1 Configuration](https://tauri.app/v1/api/config/)、[Tauri v1 release note](https://tauri.app/fr/release/tauri/v1.0.0-beta.2/)。
