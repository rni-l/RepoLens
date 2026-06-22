import fs from "node:fs/promises";
import path from "node:path";
import type { ScanError } from "../shared/types.js";
import { idFromPath, normalizeFsPath } from "./pathUtils.js";
import type { ProjectUpsertInput } from "./database.js";

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
  "next.config.js"
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
  if (markerSet.has("vite.config.ts")) {
    stacks.add("Vite");
  }
  if (markerSet.has("next.config.js")) {
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
