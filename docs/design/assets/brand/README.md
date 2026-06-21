# RepoLens Logo 资产

核心概念：本地代码目录 + 镜头焦点 + 路径节点。图形表达 RepoLens 的首要任务：扫描用户显式配置的本地代码目录，定位项目，并快速打开到常用开发工具。

## 文件

- `repolens-logo-horizontal.svg`：横版 Logo，用于页面导航、落地页、封面和文档页。
- `repolens-mark.svg`：独立图形标识，用于小尺寸 UI、导航栏和标识位。
- `repolens-app-icon.svg`：应用图标源文件，1024 画布，适合 Tauri/macOS 图标导出。
- `repolens-app-icon-1024.png`、`512.png`、`256.png`、`128.png`、`64.png`、`32.png`、`16.png`：应用图标 / favicon 常用 PNG 尺寸。

## 使用

- 页面内容显示优先使用横版：`assets/brand/repolens-logo-horizontal.svg`
- 导航栏和紧凑 UI 优先使用图形：`assets/brand/repolens-mark.svg`
- 应用图标、dock、启动器、favicon 使用 PNG 导出件，源文件保留为 `repolens-app-icon.svg`

## 视觉规则

- 颜色沿用项目当前 Canva 风格：紫色 `#7d2ae8` 到青色 `#00c4cc` 的主渐变。
- 小尺寸下优先使用图形标识，不使用横版文字。
- 不在图标内加入更多文字；RepoLens 字样只出现在横版 Logo 里。
