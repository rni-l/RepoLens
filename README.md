## build

```
npm run build && npm run tauri build
```

## repolens 命令行

与 App 共用 `~/.repolens/repolens.sqlite`。安装（全局链接到 PATH）：

```
npm run install:cli
```

常用命令（默认作用于当前目录所在项目，`-C <路径>` 指定其他项目）：

```
repolens register                 # 登记当前项目
repolens info                     # 描述 / 标签 / 访问链接
repolens tag add 业务领域/AI 项目类型/POC
repolens describe "一句话描述"
repolens link add --env test --url https://test.example.com --label 后台
repolens ls --untagged            # 未打标项目
repolens rules                    # 规则打标（路径正则 → 标签）
repolens help
```

## AI 工具自动登记

```
repolens setup all                # 为已安装的 Claude Code / Codex / opencode / omp / zsh 安装钩子和 repolens Skill
repolens setup --status
repolens setup all --uninstall
```

- 会话开始时，钩子自动登记当前项目。如果项目缺少描述或标签，Claude Code 和 Codex 会收到提示，由 AI 按 `skills/repolens/SKILL.md` 补全。
- zsh 钩子在 `cd` 进扫描根目录下的项目时，于后台完成登记。
- 规则标签和 AI 打的标签都会标记来源，可在详情页或用 `repolens tag clear-auto` 一键清除。
- 修改配置文件前会备份为 `*.repolens.bak`。
