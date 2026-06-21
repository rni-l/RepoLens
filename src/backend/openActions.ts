import fs from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { OpenAction, OpenActionAvailability } from "../shared/types.js";
import { RepoLensError } from "./errors.js";

const execFileAsync = promisify(execFile);

const LABELS: Record<OpenAction, string> = {
  folder: "Folder",
  terminal: "Terminal",
  iterm2: "iTerm2",
  vscode: "VS Code",
  cursor: "Cursor"
};

export async function detectOpenActions(): Promise<OpenActionAvailability[]> {
  const [hasOpen, hasCode, hasCursor] = await Promise.all([
    commandExists("open"),
    commandExists("code"),
    commandExists("cursor")
  ]);

  const itermExists = fs.existsSync("/Applications/iTerm.app") || fs.existsSync("/Applications/iTerm2.app");

  return [
    {
      action: "folder",
      label: LABELS.folder,
      available: hasOpen,
      reason: hasOpen ? undefined : "macOS open command is unavailable."
    },
    {
      action: "terminal",
      label: LABELS.terminal,
      available: process.platform === "darwin" && hasOpen,
      reason: process.platform === "darwin" && hasOpen ? undefined : "Terminal open action is macOS-only."
    },
    {
      action: "iterm2",
      label: LABELS.iterm2,
      available: process.platform === "darwin" && itermExists,
      reason: process.platform === "darwin" && itermExists ? undefined : "iTerm2 is not installed."
    },
    {
      action: "vscode",
      label: LABELS.vscode,
      available: hasCode,
      reason: hasCode ? undefined : "VS Code command is not configured."
    },
    {
      action: "cursor",
      label: LABELS.cursor,
      available: hasCursor,
      reason: hasCursor ? undefined : "Cursor command is not configured."
    }
  ];
}

export async function openPath(projectPath: string, action: OpenAction): Promise<void> {
  if (!fs.existsSync(projectPath)) {
    throw new RepoLensError("project_path_missing", "Project path does not exist.");
  }

  switch (action) {
    case "folder":
      await runCommand("open", [projectPath], "folder_open_failed");
      return;
    case "terminal":
      await runCommand("open", ["-a", "Terminal", projectPath], "terminal_open_failed");
      return;
    case "iterm2":
      await runCommand(
        "osascript",
        ["-e", `tell application "iTerm2" to create window with default profile command "cd ${escapeShell(projectPath)}"`],
        "iterm_open_failed"
      );
      return;
    case "vscode":
      await runCommand("code", [projectPath], "vscode_open_failed");
      return;
    case "cursor":
      await runCommand("cursor", [projectPath], "cursor_open_failed");
      return;
    default:
      throw new RepoLensError("unknown_open_action", `Unknown open action: ${action}`);
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], code: string): Promise<void> {
  const available = command === "open" || command === "osascript" ? true : await commandExists(command);
  if (!available) {
    throw new RepoLensError(`${code}_unavailable`, `${command} command is not configured.`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", (error) => reject(new RepoLensError(code, error.message)));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function escapeShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
