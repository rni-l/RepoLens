import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { IntegrationStatus, IntegrationTool } from "../shared/types.js";

const execFileAsync = promisify(execFile);

export type { IntegrationStatus, IntegrationTool };
export const INTEGRATION_TOOLS: IntegrationTool[] = ["claude", "codex", "opencode", "omp", "shell"];

export type IntegrationChange = {
  tool: IntegrationTool;
  changes: string[];
  notes: string[];
};

const LABELS: Record<IntegrationTool, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "opencode",
  omp: "omp (oh-my-pi)",
  shell: "zsh (cd 时自动登记)"
};

// Every file RepoLens writes into another tool's config carries this marker so uninstall can find it.
const MARKER = "repolens-integration";
const SHELL_BEGIN = `# >>> ${MARKER} >>>`;
const SHELL_END = `# <<< ${MARKER} <<<`;

const home = () => os.homedir();
const paths = {
  sharedSkill: () => path.join(home(), ".agents", "skills", "repolens"),
  claudeSkill: () => path.join(home(), ".claude", "skills", "repolens"),
  opencodeSkill: () => path.join(home(), ".config", "opencode", "skills", "repolens"),
  claudeSettings: () => path.join(home(), ".claude", "settings.json"),
  codexHooks: () => path.join(home(), ".codex", "hooks.json"),
  opencodePlugin: () => path.join(home(), ".config", "opencode", "plugin", "repolens.js"),
  ompExtension: () => path.join(home(), ".omp", "agent", "extensions", "repolens.js"),
  zshrc: () => path.join(home(), ".zshrc")
};

/** skills/repolens inside this repo; dist-backend/src/backend/integrations.js → repo root. */
export function bundledSkillDir(): string {
  return fileURLToPath(new URL("../../../skills/repolens", import.meta.url));
}

/** Command hooks should run; prefers the globally linked bin so Node upgrades don't break hooks. */
export async function resolveCliCommand(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("which", ["repolens"]);
    const resolved = stdout.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // Not linked globally; fall back to this build.
  }
  const cliFile = fileURLToPath(new URL("./repolensCli.js", import.meta.url));
  // process.execPath is a versioned Cellar path under Homebrew; the PATH shim survives upgrades.
  const node = await execFileAsync("which", ["node"]).then(({ stdout }) => stdout.trim()).catch(() => "");
  return `${shellQuote(node || process.execPath)} --no-warnings ${shellQuote(cliFile)}`;
}

export async function getIntegrationStatus(): Promise<IntegrationStatus[]> {
  return Promise.all(INTEGRATION_TOOLS.map((tool) => statusFor(tool)));
}

export async function installIntegration(tool: IntegrationTool): Promise<IntegrationChange> {
  const command = await resolveCliCommand();
  const result: IntegrationChange = { tool, changes: [], notes: [] };
  if (tool !== "shell") {
    await installSkillLinks(tool, result);
  }
  switch (tool) {
    case "claude":
      await upsertJsonHook(paths.claudeSettings(), `${command} register --hook --via claude`, result);
      break;
    case "codex":
      await upsertJsonHook(paths.codexHooks(), `${command} register --hook --via codex`, result);
      result.notes.push("Codex 首次遇到新钩子时可能需要在会话里用 /hooks 信任一次。");
      break;
    case "opencode":
      await writeManagedFile(paths.opencodePlugin(), opencodePluginSource(command), result);
      break;
    case "omp":
      await writeManagedFile(paths.ompExtension(), ompExtensionSource(command), result);
      result.notes.push("需重启 omp 才会加载新扩展。");
      break;
    case "shell":
      await upsertShellBlock(command, result);
      result.notes.push("新开终端或执行 `source ~/.zshrc` 后生效。");
      break;
  }
  return result;
}

export async function uninstallIntegration(tool: IntegrationTool): Promise<IntegrationChange> {
  const result: IntegrationChange = { tool, changes: [], notes: [] };
  switch (tool) {
    case "claude":
      await removeJsonHook(paths.claudeSettings(), result);
      await removeSymlink(paths.claudeSkill(), result);
      break;
    case "codex":
      await removeJsonHook(paths.codexHooks(), result);
      break;
    case "opencode":
      await removeManagedFile(paths.opencodePlugin(), result);
      await removeSymlink(paths.opencodeSkill(), result);
      break;
    case "omp":
      await removeManagedFile(paths.ompExtension(), result);
      break;
    case "shell":
      await removeShellBlock(result);
      break;
  }
  // The shared ~/.agents skill backs every agent integration; drop it once none remain.
  if (tool !== "shell") {
    const remaining = await Promise.all((["claude", "codex", "opencode", "omp"] as const).map((other) => statusFor(other)));
    if (!remaining.some((status) => status.hookInstalled)) {
      await removeSymlink(paths.sharedSkill(), result);
    }
  }
  return result;
}

async function statusFor(tool: IntegrationTool): Promise<IntegrationStatus> {
  const base = { tool, label: LABELS[tool] };
  switch (tool) {
    case "claude": {
      const file = paths.claudeSettings();
      return {
        ...base,
        detected: await exists(path.join(home(), ".claude")),
        hookInstalled: await jsonHookInstalled(file),
        skillInstalled: await exists(path.join(paths.claudeSkill(), "SKILL.md")),
        files: [file, paths.claudeSkill()]
      };
    }
    case "codex": {
      const file = paths.codexHooks();
      return {
        ...base,
        detected: await exists(path.join(home(), ".codex")),
        hookInstalled: await jsonHookInstalled(file),
        skillInstalled: await exists(path.join(paths.sharedSkill(), "SKILL.md")),
        files: [file, paths.sharedSkill()]
      };
    }
    case "opencode": {
      const file = paths.opencodePlugin();
      return {
        ...base,
        detected: await exists(path.join(home(), ".config", "opencode")),
        hookInstalled: await managedFileInstalled(file),
        skillInstalled: await exists(path.join(paths.opencodeSkill(), "SKILL.md")),
        files: [file, paths.opencodeSkill()]
      };
    }
    case "omp": {
      const file = paths.ompExtension();
      return {
        ...base,
        detected: await exists(path.join(home(), ".omp")),
        hookInstalled: await managedFileInstalled(file),
        skillInstalled: await exists(path.join(paths.sharedSkill(), "SKILL.md")),
        files: [file, paths.sharedSkill()]
      };
    }
    case "shell": {
      const file = paths.zshrc();
      const content = await readText(file);
      return {
        ...base,
        detected: true,
        hookInstalled: content?.includes(SHELL_BEGIN) ?? false,
        skillInstalled: false,
        files: [file]
      };
    }
  }
}

async function installSkillLinks(tool: IntegrationTool, result: IntegrationChange): Promise<void> {
  const source = bundledSkillDir();
  if (!(await exists(path.join(source, "SKILL.md")))) {
    result.notes.push(`未找到 Skill 源文件 ${source}，跳过 Skill 安装。`);
    return;
  }
  // ~/.agents/skills is read by Codex and omp directly; other tools link to it, matching how this machine is set up.
  await ensureSymlink(paths.sharedSkill(), source, result);
  if (tool === "claude") {
    await ensureSymlink(paths.claudeSkill(), paths.sharedSkill(), result);
  }
  if (tool === "opencode") {
    await ensureSymlink(paths.opencodeSkill(), paths.sharedSkill(), result);
  }
}

async function ensureSymlink(linkPath: string, target: string, result: IntegrationChange): Promise<void> {
  const current = await fs.lstat(linkPath).catch(() => null);
  if (current) {
    if (!current.isSymbolicLink()) {
      result.notes.push(`${linkPath} 已存在且不是软链接，未覆盖。`);
      return;
    }
    if ((await fs.readlink(linkPath)) === target) {
      return;
    }
    await fs.unlink(linkPath);
  }
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  await fs.symlink(target, linkPath);
  result.changes.push(`链接 ${linkPath} → ${target}`);
}

async function removeSymlink(linkPath: string, result: IntegrationChange): Promise<void> {
  const current = await fs.lstat(linkPath).catch(() => null);
  if (current?.isSymbolicLink()) {
    await fs.unlink(linkPath);
    result.changes.push(`删除 ${linkPath}`);
  }
}

type HookEntry = { matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> };
type HooksFile = { hooks?: Record<string, HookEntry[] | undefined> } & Record<string, unknown>;

function isOurHookEntry(entry: HookEntry): boolean {
  return entry.hooks?.some((hook) => typeof hook.command === "string" && hook.command.includes(" register --hook")) ?? false;
}

async function jsonHookInstalled(file: string): Promise<boolean> {
  const data = await readJson(file);
  return data?.hooks?.SessionStart?.some(isOurHookEntry) ?? false;
}

async function upsertJsonHook(file: string, command: string, result: IntegrationChange): Promise<void> {
  const data: HooksFile = (await readJson(file)) ?? {};
  const hooks = (data.hooks ??= {});
  const others = (hooks.SessionStart ?? []).filter((entry) => !isOurHookEntry(entry));
  const ours: HookEntry = { matcher: "startup", hooks: [{ type: "command", command, timeout: 15 }] };
  const previous = JSON.stringify(hooks.SessionStart ?? []);
  hooks.SessionStart = [...others, ours];
  if (JSON.stringify(hooks.SessionStart) === previous) {
    return;
  }
  await writeWithBackup(file, `${JSON.stringify(data, null, 2)}\n`);
  result.changes.push(`${file}: SessionStart 钩子 → ${command}`);
}

async function removeJsonHook(file: string, result: IntegrationChange): Promise<void> {
  const data = await readJson(file);
  const entries = data?.hooks?.SessionStart;
  if (!data?.hooks || !entries?.some(isOurHookEntry)) {
    return;
  }
  const remaining = entries.filter((entry) => !isOurHookEntry(entry));
  if (remaining.length) {
    data.hooks.SessionStart = remaining;
  } else {
    delete data.hooks.SessionStart;
  }
  await writeWithBackup(file, `${JSON.stringify(data, null, 2)}\n`);
  result.changes.push(`${file}: 移除 SessionStart 钩子`);
}

async function managedFileInstalled(file: string): Promise<boolean> {
  return (await readText(file))?.includes(MARKER) ?? false;
}

async function writeManagedFile(file: string, content: string, result: IntegrationChange): Promise<void> {
  const current = await readText(file);
  if (current === content) {
    return;
  }
  if (current !== null && !current.includes(MARKER)) {
    result.notes.push(`${file} 已存在且不是 RepoLens 生成的，未覆盖。`);
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
  result.changes.push(`写入 ${file}`);
}

async function removeManagedFile(file: string, result: IntegrationChange): Promise<void> {
  if (await managedFileInstalled(file)) {
    await fs.unlink(file);
    result.changes.push(`删除 ${file}`);
  }
}

async function upsertShellBlock(command: string, result: IntegrationChange): Promise<void> {
  const file = paths.zshrc();
  const current = (await readText(file)) ?? "";
  const block = [
    SHELL_BEGIN,
    "# RepoLens: cd 进扫描根目录下的项目时自动登记（后台运行，不影响终端）",
    "_repolens_chpwd() {",
    `  (${command} register --auto --quiet --via shell "$PWD" >/dev/null 2>&1 &)`,
    "}",
    "autoload -Uz add-zsh-hook && add-zsh-hook chpwd _repolens_chpwd",
    SHELL_END
  ].join("\n");
  const next = current.includes(SHELL_BEGIN)
    ? current.replace(new RegExp(`${escapeRegex(SHELL_BEGIN)}[\\s\\S]*?${escapeRegex(SHELL_END)}`), block)
    : `${current.replace(/\n*$/, "\n")}\n${block}\n`;
  if (next === current) {
    return;
  }
  await writeWithBackup(file, next);
  result.changes.push(`${file}: 添加 chpwd 钩子`);
}

async function removeShellBlock(result: IntegrationChange): Promise<void> {
  const file = paths.zshrc();
  const current = await readText(file);
  if (!current?.includes(SHELL_BEGIN)) {
    return;
  }
  const next = current.replace(new RegExp(`\\n?${escapeRegex(SHELL_BEGIN)}[\\s\\S]*?${escapeRegex(SHELL_END)}\\n?`), "\n");
  await writeWithBackup(file, next);
  result.changes.push(`${file}: 移除 chpwd 钩子`);
}

function opencodePluginSource(command: string): string {
  return `// ${MARKER}: generated by \`repolens setup opencode\`; remove with \`repolens setup opencode --uninstall\`.
import { spawn } from "node:child_process";

const COMMAND = ${JSON.stringify(command)};

export const RepoLensPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    if (event?.type !== "session.created") return;
    try {
      const child = spawn(\`\${COMMAND} register --auto --quiet --via opencode\`, {
        cwd: directory || process.cwd(),
        shell: true,
        detached: true,
        stdio: "ignore"
      });
      child.on("error", () => {});
      child.unref();
    } catch {}
  }
});
`;
}

function ompExtensionSource(command: string): string {
  return `// ${MARKER}: generated by \`repolens setup omp\`; remove with \`repolens setup omp --uninstall\`.
import { spawn } from "node:child_process";

const COMMAND = ${JSON.stringify(command)};

export default function repolens(pi) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const child = spawn(\`\${COMMAND} register --auto --quiet --via omp\`, {
        cwd: ctx?.cwd || process.cwd(),
        shell: true,
        detached: true,
        stdio: "ignore"
      });
      child.on("error", () => {});
      child.unref();
    } catch {}
  });
}
`;
}

async function writeWithBackup(file: string, content: string): Promise<void> {
  if (await exists(file)) {
    await fs.copyFile(file, `${file}.repolens.bak`);
  } else {
    await fs.mkdir(path.dirname(file), { recursive: true });
  }
  await fs.writeFile(file, content, "utf8");
}

async function readJson(file: string): Promise<HooksFile | null> {
  const raw = await readText(file);
  if (raw === null || !raw.trim()) {
    return null;
  }
  // A malformed config must never be overwritten silently.
  return JSON.parse(raw) as HooksFile;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
