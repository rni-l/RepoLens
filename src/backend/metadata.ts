import fs from "node:fs/promises";
import path from "node:path";
import type { ScanError } from "../shared/types.js";
import { idFromPath, normalizeFsPath } from "./pathUtils.js";
import type { AutoLinkInput, ProjectUpsertInput } from "./database.js";

export const STRICT_PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "deno.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "Cargo.toml",
  "go.mod"
] as const;

export const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode"
]);

type PackageJson = {
  name?: unknown;
  description?: unknown;
  scripts?: Record<string, unknown>;
};

export type ExtractedProject = ProjectUpsertInput & {
  markerNames: string[];
  extractionErrors: ScanError[];
};

export async function hasStrictProjectMarker(projectPath: string): Promise<string[]> {
  const entries = await safeReadDirNames(projectPath);
  return STRICT_PROJECT_MARKERS.filter((marker) => entries.has(marker));
}

export async function extractProjectMetadata(projectPathInput: string, source: "scan" | "manual"): Promise<ExtractedProject> {
  const projectPath = normalizeFsPath(projectPathInput);
  const markerNames = await hasStrictProjectMarker(projectPath);
  const extractionErrors: ScanError[] = [];
  const packageJson = await readPackageJson(projectPath, extractionErrors);
  const stats = await fs.stat(projectPath);
  const readmeSummary = await readReadmeSummary(projectPath);
  const name = stringValue(packageJson?.name) || path.basename(projectPath);
  const packageDescription = stringValue(packageJson?.description);
  const techStacks = detectTechStacks(projectPath, markerNames);
  const { startCommand, testCommand } = detectCommands(packageJson, markerNames);
  const entryFiles = await detectEntryFiles(projectPath);
  const autoLinks = await detectLocalLinks(projectPath, packageJson, techStacks);
  const now = new Date().toISOString();

  return {
    id: idFromPath("project", projectPath),
    name,
    path: projectPath,
    source,
    status: "active",
    description: packageDescription || readmeSummary || null,
    readmeSummary,
    techStacks,
    startCommand,
    testCommand,
    entryFiles,
    lastModifiedAt: stats.mtime.toISOString(),
    folderCreatedAt: dateToIso(stats.birthtime) ?? dateToIso(stats.ctime),
    folderUpdatedAt: dateToIso(stats.mtime),
    lastScannedAt: now,
    autoLinks,
    markerNames,
    extractionErrors
  };
}

export async function pathExists(projectPath: string): Promise<boolean> {
  try {
    await fs.access(projectPath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDirNames(directory: string): Promise<Set<string>> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return new Set(entries.map((entry) => entry.name));
}

async function readPackageJson(projectPath: string, errors: ScanError[]): Promise<PackageJson | null> {
  const packagePath = path.join(projectPath, "package.json");
  try {
    const raw = await fs.readFile(packagePath, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    errors.push({
      path: packagePath,
      kind: "manifest_parse_failed",
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function readReadmeSummary(projectPath: string): Promise<string | null> {
  for (const readmeName of ["README.md", "README.MD", "readme.md"]) {
    try {
      const raw = await fs.readFile(path.join(projectPath, readmeName), "utf8");
      const summary = raw
        .split(/\n\s*\n/g)
        .map((paragraph) => paragraph.replace(/^#+\s*/gm, "").trim())
        .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("!["))[0];
      return summary ? truncate(summary.replace(/\s+/g, " "), 360) : null;
    } catch (error) {
      if (!isMissingFileError(error)) {
        return null;
      }
    }
  }
  return null;
}

function detectTechStacks(projectPath: string, markerNames: string[]): string[] {
  const markerSet = new Set(markerNames);
  const stacks = new Set<string>();

  if (markerSet.has("package.json") || markerSet.has("tsconfig.json") || markerSet.has("deno.json")) {
    stacks.add("Node.js");
  }
  if (markerSet.has("tsconfig.json")) {
    stacks.add("TypeScript");
  }
  if (markerNames.some((marker) => marker.startsWith("vite.config."))) {
    stacks.add("Vite");
  }
  if (markerNames.some((marker) => marker.startsWith("next.config."))) {
    stacks.add("Next.js");
  }
  if (markerSet.has("pyproject.toml") || markerSet.has("requirements.txt")) {
    stacks.add("Python");
  }
  if (markerSet.has("pom.xml") || markerSet.has("build.gradle")) {
    stacks.add("Java");
  }
  if (markerSet.has("composer.json")) {
    stacks.add("PHP");
  }
  if (markerSet.has("Cargo.toml")) {
    stacks.add("Rust");
  }
  if (markerSet.has("go.mod")) {
    stacks.add("Go");
  }
  if (projectPath.includes("feishu") || projectPath.includes("飞书")) {
    stacks.add("Feishu");
  }

  return Array.from(stacks);
}

function detectCommands(packageJson: PackageJson | null, markerNames: string[]): { startCommand: string | null; testCommand: string | null } {
  if (packageJson?.scripts) {
    const scripts = packageJson.scripts;
    const startScript = typeof scripts.dev === "string" ? "dev" : typeof scripts.start === "string" ? "start" : null;
    const testScript = typeof scripts.test === "string" ? "test" : null;
    return {
      startCommand: startScript ? `npm run ${startScript}` : null,
      testCommand: testScript ? "npm test" : null
    };
  }

  const markerSet = new Set(markerNames);
  if (markerSet.has("requirements.txt")) {
    return { startCommand: null, testCommand: null };
  }

  return { startCommand: null, testCommand: null };
}

const PORT_SCRIPT_NAMES = ["dev", "start", "serve", "preview", "server"];
const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
// Databases and brokers commonly published by compose files; not something to open in a browser.
const NON_HTTP_PORTS = new Set([1433, 1521, 2181, 3306, 5432, 5672, 6379, 9092, 11211, 27017]);
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

/** Best-effort local URLs from scripts, configs and env files; never throws. */
export async function detectLocalLinks(
  projectPath: string,
  packageJson: PackageJson | null,
  techStacks: string[]
): Promise<AutoLinkInput[]> {
  const found = new Map<number, string>();
  const add = (port: number, label: string) => {
    if (Number.isInteger(port) && port >= 80 && port <= 65535 && !found.has(port)) {
      found.set(port, label);
    }
  };

  const scripts = packageJson?.scripts ?? {};
  for (const name of [...PORT_SCRIPT_NAMES, ...Object.keys(scripts)]) {
    const script = scripts[name];
    if (typeof script !== "string") {
      continue;
    }
    for (const port of portsInCommand(script)) {
      add(port, name);
    }
  }

  for (const file of ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts"]) {
    const raw = await readOptionalFile(path.join(projectPath, file));
    const match = raw?.match(/\bport\s*:\s*(\d{2,5})/);
    if (match) {
      add(Number(match[1]), "vite");
    }
  }

  for (const file of ENV_FILES) {
    const raw = await readOptionalFile(path.join(projectPath, file));
    for (const match of raw?.matchAll(/^\s*(?:export\s+)?(?:VITE_|APP_|SERVER_|WEB_|API_|FRONTEND_|BACKEND_)?PORT\s*=\s*["']?(\d{2,5})/gm) ?? []) {
      add(Number(match[1]), file);
    }
  }

  for (const file of COMPOSE_FILES) {
    const raw = await readOptionalFile(path.join(projectPath, file));
    for (const match of raw?.matchAll(/^\s*-\s*["']?(?:[\d.]+:)?(\d{2,5}):\d{2,5}(?:\/\w+)?["']?\s*$/gm) ?? []) {
      if (!NON_HTTP_PORTS.has(Number(match[1]))) {
        add(Number(match[1]), "docker");
      }
    }
  }

  for (const file of ["main.py", "app.py", "manage.py"]) {
    const raw = await readOptionalFile(path.join(projectPath, file));
    const match = raw?.match(/\bport\s*=\s*(\d{4,5})/);
    if (match) {
      add(Number(match[1]), "python");
    }
  }

  if (!found.size) {
    const devScript = typeof scripts.dev === "string" ? scripts.dev : "";
    if (techStacks.includes("Next.js") || /\bnext\s+dev\b/.test(devScript)) {
      add(3000, "next 默认");
    } else if (techStacks.includes("Vite") || /\bvite\b/.test(devScript)) {
      add(5173, "vite 默认");
    }
  }

  return Array.from(found, ([port, label]) => ({
    env: "local" as const,
    label,
    url: `http://localhost:${port}`,
    port
  }));
}

export function portsInCommand(command: string): number[] {
  const ports: number[] = [];
  for (const match of command.matchAll(/(?:--port[=\s]+|(?:^|\s)-p\s+|\bPORT=)(\d{2,5})\b/g)) {
    ports.push(Number(match[1]));
  }
  return ports;
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    // Skip huge files; configs that matter here are small.
    return stats.isFile() && stats.size < 256 * 1024 ? await fs.readFile(filePath, "utf8") : null;
  } catch {
    return null;
  }
}

async function detectEntryFiles(projectPath: string): Promise<string[]> {
  const candidates = [
    "src/main.tsx",
    "src/main.ts",
    "src/index.tsx",
    "src/index.ts",
    "main.py",
    "app.py"
  ];
  const found: string[] = [];
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(path.join(projectPath, candidate));
      if (stats.isFile()) {
        found.push(candidate);
      }
    } catch {
      // Entry files are optional.
    }
  }
  return found;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function dateToIso(date: Date): string | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return date.toISOString();
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
