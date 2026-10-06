import fs from "node:fs/promises";
import path from "node:path";
import type { ScanError, ScanSummary } from "../shared/types.js";
import { applyAutoTagRules } from "./autoTagRules.js";
import type { RepoLensDatabase } from "./database.js";
import { IGNORED_DIRECTORIES, extractProjectMetadata, hasStrictProjectMarker } from "./metadata.js";
import { normalizeFsPath } from "./pathUtils.js";

type ScanOptions = {
  roots: Array<{ id: string; path: string; enabled: boolean }>;
  database: RepoLensDatabase;
};

export async function scanRoots(options: ScanOptions): Promise<ScanSummary> {
  const summary: ScanSummary = {
    scannedRoots: 0,
    discoveredProjects: 0,
    addedProjects: 0,
    updatedProjects: 0,
    skippedDirs: 0,
    errors: []
  };

  const existingPaths = new Set<string>();

  for (const root of options.roots.filter((item) => item.enabled)) {
    const rootPath = normalizeFsPath(root.path);
    const rootStats = await statRoot(rootPath, summary.errors);
    if (!rootStats) {
      continue;
    }

    summary.scannedRoots += 1;
    await walkDirectory(rootPath, summary, async (projectPath) => {
      const project = await extractProjectMetadata(projectPath, "scan");
      summary.errors.push(...project.extractionErrors);
      existingPaths.add(project.path);
      const result = options.database.upsertProject(project);
      summary.discoveredProjects += 1;
      if (result.created) {
        summary.addedProjects += 1;
        applyAutoTagRules(options.database, result.project.id);
      } else {
        summary.updatedProjects += 1;
      }
    });
  }

  try {
    options.database.markMissingProjects(existingPaths);
  } catch (error) {
    summary.errors.push({
      path: "sqlite",
      kind: "database_failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return summary;
}

async function walkDirectory(
  directory: string,
  summary: ScanSummary,
  onProject: (projectPath: string) => Promise<void>
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    summary.errors.push(toReadError(directory, error));
    return;
  }

  try {
    const markers = await hasStrictProjectMarker(directory);
    if (markers.length > 0) {
      await onProject(directory);
      return;
    }
  } catch (error) {
    summary.errors.push(toReadError(directory, error));
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      summary.skippedDirs += 1;
      continue;
    }
    await walkDirectory(path.join(directory, entry.name), summary, onProject);
  }
}

async function statRoot(rootPath: string, errors: ScanError[]) {
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      errors.push({
        path: rootPath,
        kind: "root_not_found",
        message: "Scan root is not a directory."
      });
      return null;
    }
    return stats;
  } catch (error) {
    const kind = typeof error === "object" && error !== null && "code" in error && error.code === "EACCES"
      ? "permission_denied"
      : "root_not_found";
    errors.push({
      path: rootPath,
      kind,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function toReadError(fsPath: string, error: unknown): ScanError {
  const kind = typeof error === "object" && error !== null && "code" in error && error.code === "EACCES"
    ? "permission_denied"
    : "read_failed";
  return {
    path: fsPath,
    kind,
    message: error instanceof Error ? error.message : String(error)
  };
}
