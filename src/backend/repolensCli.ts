#!/usr/bin/env -S node --no-warnings
import path from "node:path";
import { parseArgs } from "node:util";
import type { LinkEnv, ProjectDetail, ProjectListItem, ProjectStatus, TagNode } from "../shared/types.js";
import { RepoLensService, type RegisterResult } from "./appService.js";
import { loadAutoTagSettings, saveAutoTagSettings } from "./autoTagRules.js";
import { RepoLensError } from "./errors.js";
import {
  INTEGRATION_TOOLS,
  getIntegrationStatus,
  installIntegration,
  uninstallIntegration,
  type IntegrationChange,
  type IntegrationTool
} from "./integrations.js";

const HELP = `repolens — 本地项目库命令行（与 RepoLens App 共用 ~/.repolens/repolens.sqlite）

用法: repolens <命令> [参数]   项目默认取当前目录，用 -C <路径|项目id> 指定其他项目

登记与查看
  register [路径]              登记项目（幂等）。--auto 仅在扫描根内且有项目标记时登记
                               --hook 供 AI 工具 SessionStart 钩子使用  --force 允许扫描根外
  info                         查看项目的描述、标签、访问链接
  ls                           列出项目  --untagged 仅未打标  --tag <路径> 按标签  -q <关键词>  --limit N
  scan                         扫描全部根目录
  roots [add <路径>]           查看/添加扫描根目录

标签与描述
  tags                         输出标签树（打标前先看，优先复用已有标签）
  tag add <标签路径...>        打标，如 tag add 项目类型/POC 业务领域/AI
  tag rm <标签路径...>         去标
  tag clear-auto               清除规则/AI 自动打的标签
  describe "<一句话描述>"      写描述（之后扫描不会覆盖）
  status <状态>                active | archived | experimental | learning | client
  autotag                      按规则重新打标  --all-untagged 对所有未打标项目执行
  rules [add <正则> <标签> | rm <序号> | prefix <父标签|none>]   管理规则打标

访问链接
  link ls
  link add --env <local|test|prod|other> --url <URL> [--label 前端] [--port N]
  link set <链接id> [--env ..] [--url ..] [--label ..] [--port ..]
  link rm <链接id>
  link open [--env test]       在浏览器打开（默认第一条）

集成
  setup <claude|codex|opencode|omp|shell|all>   安装钩子 + Skill
        --uninstall 卸载   --status 查看状态

通用参数: --json 输出 JSON  --agent 标记为 AI 操作（Claude Code 内自动识别）  -h 帮助`;

const STATUSES: ProjectStatus[] = ["active", "archived", "experimental", "learning", "client"];
const ENVS: LinkEnv[] = ["local", "test", "prod", "other"];
const ENV_LABELS: Record<LinkEnv, string> = { local: "本地", test: "测试", prod: "正式", other: "其他" };

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "boolean" },
    quiet: { type: "boolean" },
    hook: { type: "boolean" },
    auto: { type: "boolean" },
    force: { type: "boolean" },
    agent: { type: "boolean" },
    via: { type: "string" },
    project: { type: "string", short: "C" },
    env: { type: "string" },
    url: { type: "string" },
    label: { type: "string" },
    port: { type: "string" },
    untagged: { type: "boolean" },
    "all-untagged": { type: "boolean" },
    tag: { type: "string" },
    query: { type: "string", short: "q" },
    limit: { type: "string" },
    uninstall: { type: "boolean" },
    status: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  }
});

const quiet = Boolean(flags.quiet || flags.hook);
const [command, ...args] = positionals;

if (!command || flags.help || command === "help") {
  console.log(HELP);
  process.exit(0);
}

let service: RepoLensService | null = null;
try {
  service = new RepoLensService();
  await run(service, command, args);
} catch (error) {
  if (!quiet) {
    const message = error instanceof Error ? error.message : String(error);
    if (flags.json) {
      const code = error instanceof RepoLensError ? error.code : "unknown_error";
      console.log(JSON.stringify({ ok: false, error: { code, message } }));
    } else {
      console.error(`repolens: ${message}`);
    }
    process.exitCode = 1;
  }
} finally {
  service?.close();
}

async function run(service: RepoLensService, command: string, args: string[]): Promise<void> {
  switch (command) {
    case "register":
      return register(service, args[0] ?? process.cwd());
    case "info":
      return printProject(await target(service, args[0]));
    case "ls":
    case "list":
      return list(service);
    case "scan": {
      const summary = await service.scanAllRoots();
      return output(summary, () =>
        `扫描 ${summary.scannedRoots} 个根目录：发现 ${summary.discoveredProjects}，新增 ${summary.addedProjects}，更新 ${summary.updatedProjects}` +
        (summary.errors.length ? `，${summary.errors.length} 个错误` : "")
      );
    }
    case "roots":
      return roots(service, args);
    case "tags":
      return printTags(await service.listTags());
    case "tag":
      return tag(service, args);
    case "describe": {
      const text = args.join(" ").trim();
      if (!text) {
        throw new RepoLensError("description_required", '用法: repolens describe "<一句话描述>"');
      }
      const project = await target(service);
      return printProject(await service.updateProject(project.id, { description: text }));
    }
    case "status": {
      const status = args[0] as ProjectStatus;
      if (!STATUSES.includes(status)) {
        throw new RepoLensError("status_invalid", `状态必须是: ${STATUSES.join(" | ")}`);
      }
      const project = await target(service);
      return printProject(await service.updateProject(project.id, { status }));
    }
    case "autotag":
      return autotag(service);
    case "rules":
      return rules(service, args);
    case "link":
    case "links":
      return link(service, args);
    case "setup":
      return setup(args);
    default:
      throw new RepoLensError("unknown_command", `未知命令: ${command}（repolens help 查看用法）`);
  }
}

async function register(service: RepoLensService, rawPath: string): Promise<void> {
  const result = await service.registerProject(rawPath, {
    auto: Boolean(flags.auto || flags.hook),
    force: Boolean(flags.force)
  });

  if (flags.hook) {
    // SessionStart hooks (Claude Code, Codex) inject additionalContext into the agent's context.
    const context = hookContext(result);
    if (context) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
    }
    return;
  }
  if (quiet) {
    return;
  }
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.status === "skipped") {
    const reasons = {
      outside_scan_roots: "不在任何扫描根目录内（repolens roots 查看；--force 强制登记）",
      no_project_marker: "没有找到项目标记文件（.git / package.json 等）",
      not_a_directory: "不是一个目录"
    };
    console.log(`跳过 ${result.path}：${reasons[result.reason]}`);
    return;
  }
  console.log(`${result.status === "registered" ? "已登记" : "已更新"}：${result.project.name}`);
  if (result.addedRuleTags.length) {
    console.log(`规则标签：${result.addedRuleTags.join("、")}`);
  }
  printProject(result.project);
}

function hookContext(result: RegisterResult): string | null {
  if (result.status === "skipped") {
    return result.looksNew
      ? "RepoLens：当前目录看起来是一个新项目文件夹。搭好项目骨架（git init / package.json 等）后，运行 `repolens register`，再按 repolens skill 补全标签、描述和访问链接。"
      : null;
  }
  if (!result.needsEnrichment) {
    return null;
  }
  const missing = [
    !result.project.description?.trim() ? "描述" : null,
    !result.project.tags.some((tag) => tag.source !== "rule") ? "分类标签" : null
  ].filter(Boolean);
  return `RepoLens：项目「${result.project.name}」已登记到本地项目库，但还缺少${missing.join("和")}。不必打断用户当前的任务；在你理解了项目用途之后，按 repolens skill 用 \`repolens describe\`、\`repolens tag add\` 补全；若有本地端口或测试/正式访问地址，用 \`repolens link add\` 记录。`;
}

async function target(service: RepoLensService, positional?: string): Promise<ProjectDetail> {
  return service.resolveProject(flags.project ?? positional ?? process.cwd());
}

async function list(service: RepoLensService): Promise<void> {
  const filters: Parameters<RepoLensService["listProjects"]>[0] = {
    untagged: Boolean(flags.untagged || flags["all-untagged"]),
    query: flags.query
  };
  if (flags.tag) {
    const tag = (await service.listTags()).find((item) => item.path === flags.tag || item.name === flags.tag);
    if (!tag) {
      throw new RepoLensError("tag_not_found", `标签不存在: ${flags.tag}`);
    }
    filters.tagIds = [tag.id];
  }
  let projects = await service.listProjects(filters);
  if (flags.limit) {
    projects = projects.slice(0, Number(flags.limit));
  }
  if (flags.json) {
    console.log(
      JSON.stringify(
        projects.map((project) => ({
          id: project.id,
          name: project.name,
          path: project.path,
          status: project.status,
          description: project.description,
          techStacks: project.techStacks,
          tags: project.tags.map((tag) => tag.path),
          links: project.links.map(({ env, label, url }) => ({ env, label, url }))
        })),
        null,
        2
      )
    );
    return;
  }
  for (const project of projects) {
    console.log(formatListLine(project));
  }
  console.log(`\n共 ${projects.length} 个项目`);
}

async function roots(service: RepoLensService, args: string[]): Promise<void> {
  if (args[0] === "add") {
    if (!args[1]) {
      throw new RepoLensError("path_required", "用法: repolens roots add <路径>");
    }
    const root = await service.addScanRoot(path.resolve(args[1]));
    return output(root, () => `已添加扫描根目录 ${root.path}（运行 repolens scan 扫描）`);
  }
  const list = await service.listScanRoots();
  return output(list, () => list.map((root) => `${root.enabled ? "✓" : "✗"} ${root.path}`).join("\n") || "还没有扫描根目录");
}

async function tag(service: RepoLensService, args: string[]): Promise<void> {
  const [action, ...tagPaths] = args;
  const project = await target(service);
  switch (action) {
    case "add":
      requireArgs(tagPaths, "repolens tag add <标签路径...>");
      return printProject(await service.addProjectTagPaths(project.id, tagPaths, actorSource()));
    case "rm":
    case "remove":
      requireArgs(tagPaths, "repolens tag rm <标签路径...>");
      return printProject(await service.removeProjectTagPaths(project.id, tagPaths));
    case "clear-auto":
      return printProject(await service.clearAutoTags(project.id));
    default:
      throw new RepoLensError("unknown_command", "用法: repolens tag add|rm|clear-auto ...");
  }
}

async function autotag(service: RepoLensService): Promise<void> {
  const projects = flags["all-untagged"]
    ? await service.listProjects({ untagged: true })
    : [await target(service)];
  const results: Array<{ name: string; added: string[] }> = [];
  for (const project of projects) {
    results.push({ name: project.name, added: await service.applyAutoTagRules(project.id) });
  }
  return output(results, () => {
    const changed = results.filter((item) => item.added.length);
    return [
      ...changed.map((item) => `${item.name}: ${item.added.join("、")}`),
      `${projects.length} 个项目，${changed.length} 个新增规则标签`
    ].join("\n");
  });
}

async function rules(service: RepoLensService, args: string[]): Promise<void> {
  const database = service.getDatabase();
  const settings = loadAutoTagSettings(database);
  const [action, ...rest] = args;
  if (action === "add") {
    const [pattern, tagPath] = rest;
    if (!pattern || !tagPath) {
      throw new RepoLensError("rule_invalid", "用法: repolens rules add <正则> <标签路径>");
    }
    new RegExp(pattern, "i");
    settings.rules.push({ pattern, tag: tagPath });
    saveAutoTagSettings(database, settings);
  } else if (action === "rm") {
    const index = Number(rest[0]) - 1;
    if (!Number.isInteger(index) || !settings.rules[index]) {
      throw new RepoLensError("rule_not_found", "用法: repolens rules rm <序号>（序号见 repolens rules）");
    }
    settings.rules.splice(index, 1);
    saveAutoTagSettings(database, settings);
  } else if (action === "prefix") {
    if (!rest[0]) {
      throw new RepoLensError("rule_invalid", "用法: repolens rules prefix <父标签|none>");
    }
    settings.techStackPrefix = rest[0] === "none" ? null : rest[0];
    saveAutoTagSettings(database, settings);
  } else if (action) {
    throw new RepoLensError("unknown_command", "用法: repolens rules [add|rm|prefix]");
  }
  return output(settings, () =>
    [
      `语言标签: ${settings.techStackPrefix ? `${settings.techStackPrefix}/<语言>` : "关闭"}`,
      "路径规则（匹配相对扫描根的路径，不区分大小写）:",
      ...settings.rules.map((rule, index) => `  ${index + 1}. /${rule.pattern}/ → ${rule.tag}`),
      "规则只在项目首次登记时自动执行；已有项目用 repolens autotag 补。"
    ].join("\n")
  );
}

async function link(service: RepoLensService, args: string[]): Promise<void> {
  const [action = "ls", id] = args;
  switch (action) {
    case "ls":
    case "list": {
      const project = await target(service);
      return output(project.links, () => formatLinks(project) || "还没有访问链接");
    }
    case "add": {
      if (!flags.url) {
        throw new RepoLensError("link_url_required", "用法: repolens link add --env <local|test|prod|other> --url <URL>");
      }
      const project = await target(service);
      return printProject(
        await service.addProjectLink({
          projectId: project.id,
          env: parseEnv(flags.env ?? "local"),
          url: flags.url,
          label: flags.label,
          port: flags.port === undefined ? undefined : parsePort(flags.port),
          source: actorSource() === "agent" ? "agent" : "user"
        })
      );
    }
    case "set": {
      requireArgs(id ? [id] : [], "repolens link set <链接id> [--env ..] [--url ..] [--label ..] [--port ..]");
      return printProject(
        await service.updateProjectLink(id, {
          env: flags.env === undefined ? undefined : parseEnv(flags.env),
          url: flags.url,
          label: flags.label,
          port: flags.port === undefined ? undefined : parsePort(flags.port)
        })
      );
    }
    case "rm":
    case "remove":
      requireArgs(id ? [id] : [], "repolens link rm <链接id>");
      return printProject(await service.deleteProjectLink(id));
    case "open": {
      const project = await target(service);
      const candidates = flags.env ? project.links.filter((item) => item.env === flags.env) : project.links;
      if (!candidates[0]) {
        throw new RepoLensError("link_not_found", "没有可打开的链接");
      }
      await service.openUrl(candidates[0].url);
      return output(candidates[0], () => `已打开 ${candidates[0].url}`);
    }
    default:
      throw new RepoLensError("unknown_command", "用法: repolens link ls|add|set|rm|open");
  }
}

async function setup(args: string[]): Promise<void> {
  if (flags.status || !args[0]) {
    const statuses = await getIntegrationStatus();
    return output(statuses, () =>
      statuses
        .map((item) => {
          const state = item.hookInstalled ? "✓ 已安装" : item.detected ? "· 未安装" : "  未检测到该工具";
          const skill = item.tool === "shell" ? "" : item.skillInstalled ? "  Skill ✓" : "  Skill ✗";
          return `${item.tool.padEnd(9)} ${state}${skill}   ${item.label}`;
        })
        .join("\n") + "\n\n安装: repolens setup <工具|all>   卸载: 加 --uninstall"
    );
  }
  const tools: IntegrationTool[] =
    args[0] === "all"
      ? (await getIntegrationStatus()).filter((item) => item.detected).map((item) => item.tool)
      : args.map((tool) => {
          if (!INTEGRATION_TOOLS.includes(tool as IntegrationTool)) {
            throw new RepoLensError("unknown_tool", `未知工具: ${tool}（可选 ${INTEGRATION_TOOLS.join(" | ")} | all）`);
          }
          return tool as IntegrationTool;
        });
  const results: IntegrationChange[] = [];
  for (const tool of tools) {
    results.push(flags.uninstall ? await uninstallIntegration(tool) : await installIntegration(tool));
  }
  return output(results, () =>
    results
      .map((result) =>
        [
          `[${result.tool}]${result.changes.length ? "" : " 无需改动"}`,
          ...result.changes.map((change) => `  ${change}`),
          ...result.notes.map((note) => `  提示: ${note}`)
        ].join("\n")
      )
      .join("\n")
  );
}

function printProject(project: ProjectDetail): void {
  if (flags.json) {
    console.log(JSON.stringify(project, null, 2));
    return;
  }
  if (quiet) {
    return;
  }
  const tags = project.tags.map((tag) => (tag.source && tag.source !== "user" ? `${tag.path}(${tag.source === "rule" ? "规则" : "AI"})` : tag.path));
  const lines = [
    `${project.name}  [${project.status}]`,
    `  路径    ${project.path}`,
    `  描述    ${project.description || "（无）"}`,
    `  技术栈  ${project.techStacks.join(", ") || "（无）"}`,
    `  标签    ${tags.join(" · ") || "（无）"}`,
    `  链接    ${formatLinks(project).replace(/\n/g, "\n          ") || "（无）"}`,
    `  id      ${project.id}`
  ];
  console.log(lines.join("\n"));
}

function printTags(tags: TagNode[]): void {
  if (flags.json) {
    console.log(JSON.stringify(tags.map(({ path: tagPath, projectCount }) => ({ path: tagPath, projectCount })), null, 2));
    return;
  }
  for (const tag of tags) {
    console.log(`${"  ".repeat(tag.depth)}${tag.name}  (${tag.projectCount})`);
  }
}

function formatLinks(project: ProjectListItem): string {
  return project.links
    .map((item) => {
      const meta = [item.label, item.source === "auto" ? "自动识别" : null].filter(Boolean).join(", ");
      return `${ENV_LABELS[item.env]}  ${item.url}${meta ? `  (${meta})` : ""}  [${item.id}]`;
    })
    .join("\n");
}

function formatListLine(project: ProjectListItem): string {
  const tags = project.tags.map((tag) => tag.path).join(", ");
  return `${project.name}\t${project.path}${tags ? `\t[${tags}]` : ""}`;
}

function output<T>(data: T, render: () => string): void {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (!quiet) {
    console.log(render());
  }
}

function actorSource(): "agent" | "user" {
  // Claude Code exports CLAUDECODE=1 to the commands it runs; other agents pass --agent (see the skill).
  return flags.agent || process.env.CLAUDECODE === "1" ? "agent" : "user";
}

function parseEnv(value: string): LinkEnv {
  if (!ENVS.includes(value as LinkEnv)) {
    throw new RepoLensError("link_env_invalid", `--env 必须是: ${ENVS.join(" | ")}`);
  }
  return value as LinkEnv;
}

function parsePort(value: string): number | null {
  if (value === "" || value === "none") {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RepoLensError("link_port_invalid", "--port 必须是 1-65535 的整数");
  }
  return port;
}

function requireArgs(values: string[], usage: string): void {
  if (!values.length) {
    throw new RepoLensError("usage", `用法: ${usage}`);
  }
}
