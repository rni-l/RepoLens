import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  FieldSource,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectSource,
  ProjectStatus,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch
} from "../shared/types.js";
import { RepoLensError } from "./errors.js";
import { defaultDatabasePath, idFromPath, normalizeFsPath } from "./pathUtils.js";

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  source: ProjectSource;
  status: ProjectStatus;
  favorite: number;
  description: string | null;
  description_source: FieldSource;
  readme_summary: string | null;
  tech_stacks: string;
  start_command: string | null;
  start_command_source: FieldSource;
  test_command: string | null;
  test_command_source: FieldSource;
  entry_files: string;
  last_modified_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

type ScanRootRow = {
  id: string;
  path: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type ProjectUpsertInput = {
  id: string;
  name: string;
  path: string;
  source: ProjectSource;
  status: ProjectStatus;
  description: string | null;
  readmeSummary: string | null;
  techStacks: string[];
  startCommand: string | null;
  testCommand: string | null;
  entryFiles: string[];
  lastModifiedAt: string | null;
  lastScannedAt: string;
};

export class RepoLensDatabase {
  private db: DatabaseSync;

  constructor(dbPath = defaultDatabasePath()) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listScanRoots(): ScanRoot[] {
    const rows = this.db
      .prepare("SELECT * FROM scan_roots ORDER BY created_at ASC")
      .all() as ScanRootRow[];
    return rows.map(mapScanRoot);
  }

  getScanRoot(id: string): ScanRoot {
    const row = this.db.prepare("SELECT * FROM scan_roots WHERE id = ?").get(id) as ScanRootRow | undefined;
    if (!row) {
      throw new RepoLensError("scan_root_not_found", "Scan root was not found.");
    }
    return mapScanRoot(row);
  }

  addScanRoot(rawPath: string): ScanRoot {
    const rootPath = normalizeFsPath(rawPath);
    const now = new Date().toISOString();
    const id = idFromPath("root", rootPath);
    try {
      this.db
        .prepare(
          `INSERT INTO scan_roots (id, path, enabled, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(path) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at`
        )
        .run(id, rootPath, now, now);
    } catch (error) {
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }
    return this.getScanRoot(id);
  }

  updateScanRoot(id: string, patch: ScanRootUpdatePatch): ScanRoot {
    const current = this.getScanRoot(id);
    const nextPath = patch.path === undefined ? current.path : normalizeFsPath(patch.path);
    const nextEnabled = patch.enabled === undefined ? current.enabled : patch.enabled;
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE scan_roots SET path = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(nextPath, nextEnabled ? 1 : 0, now, id);
    return this.getScanRoot(id);
  }

  removeScanRoot(id: string): void {
    this.db.prepare("DELETE FROM scan_roots WHERE id = ?").run(id);
  }

  listProjects(filters: ProjectFilters = {}): ProjectListItem[] {
    let sql = "SELECT * FROM projects";
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.source) {
      clauses.push("source = ?");
      params.push(filters.source);
    }
    if (filters.favoriteOnly) {
      clauses.push("favorite = 1");
    }
    if (filters.statuses?.length) {
      clauses.push(`status IN (${filters.statuses.map(() => "?").join(", ")})`);
      params.push(...filters.statuses);
    }
    if (filters.query?.trim()) {
      const like = `%${filters.query.trim().toLowerCase()}%`;
      clauses.push(
        `(lower(name) LIKE ? OR lower(path) LIKE ? OR lower(coalesce(description, '')) LIKE ? OR lower(coalesce(readme_summary, '')) LIKE ? OR lower(tech_stacks) LIKE ? OR lower(coalesce(start_command, '')) LIKE ? OR id IN (SELECT project_id FROM project_tags WHERE lower(tag) LIKE ?))`
      );
      params.push(like, like, like, like, like, like, like);
    }

    if (clauses.length) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY favorite DESC, updated_at DESC, name ASC";

    let projects = (this.db.prepare(sql).all(...params) as ProjectRow[]).map((row) =>
      mapProjectListItem(row, this.listTags(row.id))
    );

    if (filters.techStacks?.length) {
      const wanted = new Set(filters.techStacks.map((item) => item.toLowerCase()));
      projects = projects.filter((project) =>
        project.techStacks.some((stack) => wanted.has(stack.toLowerCase()))
      );
    }
    if (filters.tags?.length) {
      const wanted = new Set(filters.tags.map((item) => item.toLowerCase()));
      projects = projects.filter((project) => project.tags.some((tag) => wanted.has(tag.toLowerCase())));
    }
    if (filters.scanRootId) {
      const root = this.getScanRoot(filters.scanRootId);
      projects = projects.filter((project) => project.path.startsWith(root.path));
    }

    return projects;
  }

  getProject(projectId: string): ProjectDetail {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!row) {
      throw new RepoLensError("project_not_found", "Project was not found.");
    }
    return mapProjectDetail(row, this.listTags(projectId));
  }

  getProjectByPath(rawPath: string): ProjectDetail | null {
    const projectPath = normalizeFsPath(rawPath);
    const row = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(projectPath) as ProjectRow | undefined;
    return row ? mapProjectDetail(row, this.listTags(row.id)) : null;
  }

  updateProject(projectId: string, patch: ProjectUpdatePatch): ProjectDetail {
    const current = this.getProject(projectId);
    const now = new Date().toISOString();

    const next = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      descriptionSource: patch.description === undefined ? current.descriptionSource : "user",
      status: patch.status ?? current.status,
      favorite: patch.favorite ?? current.favorite,
      startCommand: patch.startCommand === undefined ? current.startCommand : patch.startCommand,
      startCommandSource: patch.startCommand === undefined ? current.startCommandSource : "user",
      testCommand: patch.testCommand === undefined ? current.testCommand : patch.testCommand,
      testCommandSource: patch.testCommand === undefined ? current.testCommandSource : "user"
    };

    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, description = ?, description_source = ?, status = ?, favorite = ?,
             start_command = ?, start_command_source = ?, test_command = ?, test_command_source = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.name,
        next.description,
        next.descriptionSource,
        next.status,
        next.favorite ? 1 : 0,
        next.startCommand,
        next.startCommandSource,
        next.testCommand,
        next.testCommandSource,
        now,
        projectId
      );

    if (patch.tags) {
      this.replaceTags(projectId, patch.tags);
    }

    return this.getProject(projectId);
  }

  deleteProject(projectId: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }

  upsertProject(input: ProjectUpsertInput): { project: ProjectDetail; created: boolean } {
    const existing = this.getProjectByPath(input.path);
    const now = new Date().toISOString();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO projects (
             id, name, path, source, status, favorite, description, description_source,
             readme_summary, tech_stacks, start_command, start_command_source,
             test_command, test_command_source, entry_files, last_modified_at,
             last_scanned_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?, 'auto', ?, ?, ?, 'auto', ?, 'auto', ?, ?, ?, ?, ?)`
        )
        .run(
          input.id,
          input.name,
          input.path,
          input.source,
          input.status,
          input.description,
          input.readmeSummary,
          JSON.stringify(input.techStacks),
          input.startCommand,
          input.testCommand,
          JSON.stringify(input.entryFiles),
          input.lastModifiedAt,
          input.lastScannedAt,
          now,
          now
        );
      return { project: this.getProject(input.id), created: true };
    }

    const description = existing.descriptionSource === "user" ? existing.description : input.description;
    const startCommand = existing.startCommandSource === "user" ? existing.startCommand : input.startCommand;
    const testCommand = existing.testCommandSource === "user" ? existing.testCommand : input.testCommand;
    const nextStatus: ProjectStatus = existing.status === "missing" ? "active" : existing.status;

    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, source = ?, status = ?, description = ?, readme_summary = ?,
             tech_stacks = ?, start_command = ?, test_command = ?, entry_files = ?,
             last_modified_at = ?, last_scanned_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.name,
        existing.source === "manual" ? "manual" : input.source,
        nextStatus,
        description,
        input.readmeSummary,
        JSON.stringify(input.techStacks),
        startCommand,
        testCommand,
        JSON.stringify(input.entryFiles),
        input.lastModifiedAt,
        input.lastScannedAt,
        now,
        existing.id
      );

    return { project: this.getProject(existing.id), created: false };
  }

  markMissingProjects(existingPaths: Set<string>): number {
    const rows = this.db.prepare("SELECT id, path, status FROM projects").all() as ProjectRow[];
    let changed = 0;
    const now = new Date().toISOString();
    for (const row of rows) {
      if (!existingPaths.has(row.path) && row.status !== "missing") {
        this.db.prepare("UPDATE projects SET status = 'missing', updated_at = ? WHERE id = ?").run(now, row.id);
        changed += 1;
      }
    }
    return changed;
  }

  private listTags(projectId: string): string[] {
    const rows = this.db
      .prepare("SELECT tag FROM project_tags WHERE project_id = ? ORDER BY tag ASC")
      .all(projectId) as Array<{ tag: string }>;
    return rows.map((row) => row.tag);
  }

  private replaceTags(projectId: string, tags: string[]): void {
    const cleaned = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
    this.db.prepare("DELETE FROM project_tags WHERE project_id = ?").run(projectId);
    const insert = this.db.prepare("INSERT INTO project_tags (project_id, tag) VALUES (?, ?)");
    for (const tag of cleaned) {
      insert.run(projectId, tag);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scan_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        favorite INTEGER NOT NULL,
        description TEXT,
        description_source TEXT NOT NULL,
        readme_summary TEXT,
        tech_stacks TEXT NOT NULL,
        start_command TEXT,
        start_command_source TEXT NOT NULL,
        test_command TEXT,
        test_command_source TEXT NOT NULL,
        entry_files TEXT NOT NULL,
        last_modified_at TEXT,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_tags (
        project_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (project_id, tag),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
}

function mapScanRoot(row: ScanRootRow): ScanRoot {
  return {
    id: row.id,
    path: row.path,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProjectListItem(row: ProjectRow, tags: string[]): ProjectListItem {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? "",
    techStacks: parseJsonArray(row.tech_stacks),
    status: row.status,
    tags,
    lastModifiedAt: row.last_modified_at,
    source: row.source,
    favorite: Boolean(row.favorite)
  };
}

function mapProjectDetail(row: ProjectRow, tags: string[]): ProjectDetail {
  return {
    ...mapProjectListItem(row, tags),
    readmeSummary: row.readme_summary,
    startCommand: row.start_command,
    testCommand: row.test_command,
    entryFiles: parseJsonArray(row.entry_files),
    descriptionSource: row.description_source,
    startCommandSource: row.start_command_source,
    testCommandSource: row.test_command_source,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
