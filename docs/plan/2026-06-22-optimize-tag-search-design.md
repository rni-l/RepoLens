# RepoLens 标签筛选、批量打标与文件夹时间优化计划

## Summary

- 工作台标签筛选改成树层级多选组件，替换当前下拉选择；支持“反选”模式。
- 多项目打标改为右侧抽屉交互：选中项目后从右侧打开批量标签抽屉，提供更大的标签树选择区和已选标签预览。
- 工作台项目表格的“创建时间 / 最后更新”显示文件夹时间：创建时间优先 `birthtime`，无效时兜底 `ctime`，最后才用索引记录时间；最后更新使用文件夹 `mtime`。

## Key Changes

- 标签筛选：
  - 在 `ProjectSearchBar` 中用可复用树选择器替换 `select`。
  - 支持多选，匹配语义为“任一选中标签或其子孙标签命中”。
  - 增加“反选”开关；开启后排除选中标签及其所有子标签命中的项目，未打标签项目保留。
  - 筛选区显示已选标签完整路径，可单独移除、清空全部，并明确展示当前是“包含”还是“排除”。

- 批量打标：
  - 移除当前 `BulkTagBar` 内的小型滚动选择框。
  - 新增批量打标右侧抽屉：顶部显示已选项目数量，中部为可搜索/展开的层级标签树，底部显示已选标签和“追加标签 / 清除选择 / 关闭”操作。
  - 复用同一个树选择基础组件，但筛选模式和打标模式使用不同文案、布局密度和禁用态。
  - 批量打标仍只做 append，不覆盖已有标签。

- API / 类型 / 数据：
  - 扩展 `ProjectFilters`：新增 `excludedTagIds?: string[]`。
  - `listProjects()` 同时支持 `tagIds` 和 `excludedTagIds`；二者都按标签子树展开。
  - 扩展扫描提取数据，保存文件夹时间：`folderCreatedAt` 与 `folderUpdatedAt`，其中 `folderUpdatedAt = stats.mtime`。
  - 项目列表对外的 `createdAt / updatedAt` 改为返回文件夹时间；数据库行审计时间保留在内部，不再用于工作台表格展示。
  - mock API 同步支持 `excludedTagIds` 和文件夹时间字段，保证 Vite 开发模式行为一致。

## Test Plan

- 后端测试：
  - `listProjects({ tagIds: [parent] })` 继续包含子孙标签项目。
  - `listProjects({ excludedTagIds: [parent] })` 排除父标签及子孙标签项目，并保留未打标签项目。
  - 多个 `excludedTagIds` 任一命中即排除。
  - 同时传 `tagIds` 和 `excludedTagIds` 时先按包含条件收窄，再排除命中的项目。
  - 扫描写入项目时，`createdAt` 映射文件夹 `birthtime -> ctime -> 索引创建时间`，`updatedAt` 映射 `mtime`。
  - 重新扫描不会因为人工打标或字段编辑把工作台时间改回数据库行更新时间。

- 前端验证：
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - 手动检查工作台：标签树多选、清空、反选、反选后未打标签项目保留。
  - 手动检查批量打标抽屉：打开/关闭、搜索标签、多选标签、追加成功、错误 toast、窄屏布局。
  - 手动检查项目表格时间：创建/更新列显示文件夹时间，不随打标签操作变化。

## Assumptions

- “反选”采用已确认语义：排除所选标签及其所有子标签命中的项目。
- 标签多选采用 OR 语义：项目命中任一选中标签子树即可显示。
- 批量打标采用已确认交互：右侧抽屉。
- 文件夹创建时间采用已确认兜底：`birthtime` 无效时用 `ctime`，再无可用值才用索引创建时间。
