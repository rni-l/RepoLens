---
name: repolens
description: 把项目登记到用户的本地项目库 RepoLens，并维护描述、分类标签和访问链接（本地端口、测试和正式地址）。以下情况使用：新建项目、POC 或 demo 并搭好骨架后；会话开头收到 "RepoLens：…" 提示；开发服务器端口已确定；项目部署到了测试或正式环境；用户要求整理、打标或补全项目信息，或想按标签查找以前的项目。
---

# RepoLens 项目库

RepoLens 是用户自己的本地项目目录，有桌面 App，用 `repolens` 命令行读写。用户本地有几百个项目和 POC，靠这里的**描述 + 标签 + 链接**找回它们。你正在开发的项目，你最清楚它是做什么的，所以由你来补全这些信息。

所有命令默认作用于当前目录所在的项目；要操作别的项目，加 `-C <路径或项目id>`。要解析输出时加 `--json`。
**你执行的写操作都加 `--agent`**，这样用户能在界面上看出哪些是 AI 加的，需要时一键清除。（Claude Code 会自动识别，加上也没有影响。）

## 什么时候做

| 情况 | 动作 |
|---|---|
| 会话开头收到 "RepoLens：…缺少描述/分类标签" | 先完成用户手上的任务；等你理解了项目用途，再执行下面的「补全流程」。不要为此打断用户。 |
| 新建了项目或 POC，并已执行 `git init` 或写好 `package.json` 等 | `repolens register`，然后执行「补全流程」 |
| dev server 的端口已确定，或端口改了 | `repolens link add --env local --url http://localhost:<端口> --label <服务名> --agent` |
| 部署到了测试或正式环境 | `repolens link add --env test\|prod --url <地址> --label <服务名> --agent` |
| 用户说"整理/补标签/补全项目信息" | 执行「批量补标」 |
| 用户问"之前那个 xxx 项目在哪" | `repolens ls -q <关键词>` 或 `repolens ls --tag <标签路径>` |

## 补全流程

1. 查看现状：`repolens info`。其中带 `(规则)` 的标签是按路径和语言自动打的，可以保留。
2. 查看已有分类：`repolens tags`。**优先复用已有的标签路径**，不要自造近义词（比如已有 `业务领域/AI`，就不要再建 `领域/人工智能`）。只有现有分类确实不合适时，才新建层级路径。
3. 写描述，一句话说明这个项目做什么或验证什么，不超过 60 字：
   `repolens describe "验证用 WebRTC 做浏览器端实时字幕的可行性" --agent`
4. 打标签，2 到 4 个，用 `/` 表示层级。通常覆盖：业务领域、项目类型（POC / 工具 / 正式项目）、核心技术点。
   `repolens tag add 业务领域/AI 项目类型/POC --agent`
5. 记链接：`info` 里显示为"自动识别"的本地端口是扫描配置猜出来的。确认无误就不用管；有错就用 `repolens link rm <id>` 删掉，再手动添加正确的。

## 批量补标

```bash
repolens ls --untagged --json        # 未打标的项目（含 path/description/techStacks）
repolens tags                        # 现有分类
```
逐个阅读项目的 README、package.json 或入口文件（只读，不要修改这些项目），然后：
```bash
repolens describe "<一句话>" -C <path> --agent
repolens tag add <标签...> -C <path> --agent
```
项目很多时，先给用户列出你打算使用的标签方案，确认后再批量执行。

## 其他命令

- `repolens status archived|experimental|learning|client|active`：设置项目状态（例如 POC 验证完毕后设为 archived）
- `repolens tag rm <标签>` / `repolens tag clear-auto`：去掉标签 / 清除全部自动标签
- `repolens link ls` / `repolens link set <id> --url ...` / `repolens link open --env test`
- `repolens rules`：查看路径规则打标；`repolens rules add "<正则>" <标签路径>` 可以新增规则（需用户同意）
- `repolens help`：完整用法

## 注意

- 命令报错 "No registered project contains …" 时，先运行 `repolens register`。如果提示不在扫描根内，问用户是否要 `--force` 登记，或用 `repolens roots add` 添加扫描根。
- 不要删除用户手动打的标签（`info` 里没有 `(规则)` 或 `(AI)` 后缀的那些），除非用户明确要求。
- 链接里不要写入密码、token 等敏感参数。
