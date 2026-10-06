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
      // `create window ... command "cd x"` runs cd as the session's only process, so the window
      // closes immediately. Open a normal shell window and type the cd into it instead.
      await runCommand("osascript", [...ITERM_OPEN_SCRIPT.flatMap((line) => ["-e", line]), projectPath], "iterm_open_failed");
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

export async function openUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RepoLensError("link_url_invalid", `Invalid link URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RepoLensError("link_url_invalid", "Only http and https links can be opened.");
  }
  await runCommand("open", [parsed.toString()], "url_open_failed");
}

// The path arrives as argv, so quotes or spaces in it cannot break the AppleScript.
const ITERM_OPEN_SCRIPT = [
  "on run argv",
  'tell application "iTerm2"',
  "activate",
  "set newWindow to (create window with default profile)",
  'tell current session of newWindow to write text "cd " & quoted form of (item 1 of argv) & " && clear"',
  "end tell",
  "end run"
];

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
