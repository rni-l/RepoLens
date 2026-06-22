import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  BulkTagProjectsInput,
  BulkTagProjectsResult,
  FieldSource,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectSource,
  ProjectStatus,
  ProjectTag,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  TagCreateInput,
  TagMoveDirection,
  TagNode,
  TagUpdatePatch
} from "../shared/types.js";
import { RepoLensError } from "./errors.js";
import { defaultDatabasePath, idFromPath, idFromStableText, normalizeFsPath } from "./pathUtils.js";

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
  folder_created_at: string | null;
  folder_updated_at: string | null;
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

type TagRow = {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
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
  folderCreatedAt?: string | null;
  folderUpdatedAt?: string | null;
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

  listTags(): TagNode[] {
    const rows = this.db
      .prepare(
        `SELECT tags.*,
                (SELECT count(*) FROM project_tag_links WHERE project_tag_links.tag_id = tags.id) AS project_count
         FROM tags
         ORDER BY path ASC`
      )
      .all() as TagRow[];
    return sortTagsForTree(rows).map(mapTagNode);
  }

  getTag(id: string): TagNode {
    const row = this.db
      .prepare(
        `SELECT tags.*,
                (SELECT count(*) FROM project_tag_links WHERE project_tag_links.tag_id = tags.id) AS project_count
         FROM tags
         WHERE id = ?`
      )
      .get(id) as TagRow | undefined;
    if (!row) {
      throw new RepoLensError("tag_not_found", "Tag was not found.");
    }
    return mapTagNode(row);
  }

  createTag(input: TagCreateInput): TagNode {
    const name = normalizeTagName(input.name);
    const parent = input.parentId ? this.getTag(input.parentId) : null;
    const tagPath = parent ? `${parent.path}/${name}` : name;
    const now = new Date().toISOString();
    const id = idFromStableText("tag", tagPath);
    this.assertSiblingNameAvailable(parent?.id ?? null, name);
    const sortOrder = this.nextTagSortOrder(parent?.id ?? null);
    this.db
      .prepare(
        `INSERT INTO tags (id, name, parent_id, path, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, parent?.id ?? null, tagPath, sortOrder, now, now);
    return this.getTag(id);
  }

  updateTag(id: string, patch: TagUpdatePatch): TagNode {
    const current = this.getTag(id);
    const name = patch.name === undefined ? current.name : normalizeTagName(patch.name);
    const parentId = patch.parentId === undefined ? current.parentId : patch.parentId ?? null;

    if (parentId === current.id) {
      throw new RepoLensError("tag_cycle", "A tag cannot be moved under itself.");
    }
    const parent = parentId ? this.getTag(parentId) : null;
    if (parent && this.isDescendant(parent, current)) {
      throw new RepoLensError("tag_cycle", "A tag cannot be moved under one of its descendants.");
    }
    this.assertSiblingNameAvailable(parent?.id ?? null, name, current.id);

    const now = new Date().toISOString();
    const oldPath = current.path;
    const newPath = parent ? `${parent.path}/${name}` : name;
    const parentChanged = parentId !== current.parentId;
    const nextSortOrder = parentChanged ? this.nextTagSortOrder(parent?.id ?? null) : current.sortOrder;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE tags SET name = ?, parent_id = ?, path = ?, sort_order = ?, updated_at = ? WHERE id = ?")
        .run(name, parent?.id ?? null, newPath, nextSortOrder, now, id);
      const descendants = (this.db.prepare("SELECT * FROM tags ORDER BY path ASC").all() as TagRow[])
        .filter((tag) => tag.path.startsWith(`${oldPath}/`));
      const update = this.db.prepare("UPDATE tags SET path = ?, updated_at = ? WHERE id = ?");
      for (const descendant of descendants) {
        update.run(`${newPath}${descendant.path.slice(oldPath.length)}`, now, descendant.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof RepoLensError) {
        throw error;
      }
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }
    return this.getTag(id);
  }

  moveTag(id: string, direction: TagMoveDirection): TagNode[] {
    if (direction !== "up" && direction !== "down") {
      throw new RepoLensError("tag_move_direction_invalid", "Tag move direction must be up or down.");
    }
    const current = this.getTag(id);
    const siblings = this.listSiblingTagRows(current.parentId);
    const currentIndex = siblings.findIndex((tag) => tag.id === current.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return this.listTags();
    }

    const target = siblings[targetIndex];
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      const update = this.db.prepare("UPDATE tags SET sort_order = ?, updated_at = ? WHERE id = ?");
      update.run(target.sort_order ?? 0, now, current.id);
      update.run(current.sortOrder, now, target.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }
    return this.listTags();
  }

  deleteTag(id: string): void {
    this.getTag(id);
    this.db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  }

  findOrCreateTagPath(segments: string[]): TagNode {
    const cleaned = normalizeTagSegments(segments);
    let parentId: string | null = null;
    let current: TagNode | null = null;
    for (const segment of cleaned) {
      const existing = this.getTagByParentAndName(parentId, segment);
      current = existing ?? this.createTag({ name: segment, parentId });
      parentId = current.id;
    }
    if (!current) {
      throw new RepoLensError("tag_name_required", "Tag path is required.");
    }
    return current;
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
      const trimmed = filters.query.trim().toLowerCase();
      const like = `%${trimmed}%`;
      const pathLike = `%${trimmed.replace(/\s*\/\s*/g, "/")}%`;
      clauses.push(
        `(lower(name) LIKE ? OR lower(path) LIKE ? OR lower(coalesce(description, '')) LIKE ? OR lower(coalesce(readme_summary, '')) LIKE ? OR lower(tech_stacks) LIKE ? OR lower(coalesce(start_command, '')) LIKE ? OR id IN (SELECT project_id FROM project_tag_links JOIN tags ON tags.id = project_tag_links.tag_id WHERE lower(tags.name) LIKE ? OR lower(tags.path) LIKE ?))`
      );
      params.push(like, like, like, like, like, like, like, pathLike);
    }

    if (clauses.length) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY favorite DESC, coalesce(folder_updated_at, updated_at) DESC, name ASC";

    let projects = (this.db.prepare(sql).all(...params) as ProjectRow[]).map((row) =>
      mapProjectListItem(row, this.listProjectTags(row.id))
    );

    if (filters.techStacks?.length) {
      const wanted = new Set(filters.techStacks.map((item) => item.toLowerCase()));
      projects = projects.filter((project) =>
        project.techStacks.some((stack) => wanted.has(stack.toLowerCase()))
      );
    }
    if (filters.tagIds?.length) {
      const allowedTagIds = this.getTagAndDescendantIds(filters.tagIds);
      projects = projects.filter((project) => project.tags.some((tag) => allowedTagIds.has(tag.id)));
    }
    if (filters.excludedTagIds?.length) {
      const excludedTagIds = this.getTagAndDescendantIds(filters.excludedTagIds);
      projects = projects.filter((project) => !project.tags.some((tag) => excludedTagIds.has(tag.id)));
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
    return mapProjectDetail(row, this.listProjectTags(projectId));
  }

  getProjectByPath(rawPath: string): ProjectDetail | null {
    const projectPath = normalizeFsPath(rawPath);
    const row = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(projectPath) as ProjectRow | undefined;
    return row ? mapProjectDetail(row, this.listProjectTags(row.id)) : null;
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

    if (patch.tagIds !== undefined) {
      this.replaceProjectTagLinks(projectId, patch.tagIds);
    }

    return this.getProject(projectId);
  }

  bulkTagProjects(input: BulkTagProjectsInput): BulkTagProjectsResult {
    if (input.mode !== "append") {
      throw new RepoLensError("bulk_tag_mode_unsupported", "Only append mode is supported.");
    }

    const projectIds = Array.from(new Set(input.projectIds.map((id) => id.trim()).filter(Boolean)));
    const tagIds = Array.from(new Set(input.tagIds.map((id) => id.trim()).filter(Boolean)));
    if (!projectIds.length) {
      throw new RepoLensError("bulk_project_required", "Select at least one project.");
    }
    if (!tagIds.length) {
      throw new RepoLensError("bulk_tag_required", "Select at least one tag.");
    }

    const projectRows = this.db
      .prepare(`SELECT id FROM projects WHERE id IN (${projectIds.map(() => "?").join(", ")})`)
      .all(...projectIds) as Array<{ id: string }>;
    const foundProjects = new Set(projectRows.map((row) => row.id));
    const missingProject = projectIds.find((id) => !foundProjects.has(id));
    if (missingProject) {
      throw new RepoLensError("project_not_found", "One or more projects were not found.");
    }

    const tagRows = this.db
      .prepare(`SELECT id FROM tags WHERE id IN (${tagIds.map(() => "?").join(", ")})`)
      .all(...tagIds) as Array<{ id: string }>;
    const foundTags = new Set(tagRows.map((row) => row.id));
    const missingTag = tagIds.find((id) => !foundTags.has(id));
    if (missingTag) {
      throw new RepoLensError("tag_not_found", "One or more tags were not found.");
    }

    const updatedAt = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      const insert = this.db.prepare("INSERT OR IGNORE INTO project_tag_links (project_id, tag_id) VALUES (?, ?)");
      for (const projectId of projectIds) {
        for (const tagId of tagIds) {
          insert.run(projectId, tagId);
        }
        this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }

    return {
      updatedCount: projectIds.length,
      updatedProjects: projectIds.map((projectId) => this.getProject(projectId)),
      updatedAt
    };
  }

  deleteProject(projectId: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }

  upsertProject(input: ProjectUpsertInput): { project: ProjectDetail; created: boolean } {
    const existing = this.getProjectByPath(input.path);
    const now = new Date().toISOString();
    const folderCreatedAt = input.folderCreatedAt ?? now;
    const folderUpdatedAt = input.folderUpdatedAt ?? input.lastModifiedAt ?? now;
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO projects (
             id, name, path, source, status, favorite, description, description_source,
             readme_summary, tech_stacks, start_command, start_command_source,
             test_command, test_command_source, entry_files, last_modified_at,
             last_scanned_at, folder_created_at, folder_updated_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?, 'auto', ?, ?, ?, 'auto', ?, 'auto', ?, ?, ?, ?, ?, ?, ?)`
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
          folderCreatedAt,
          folderUpdatedAt,
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
             last_modified_at = ?, last_scanned_at = ?, folder_created_at = ?, folder_updated_at = ?, updated_at = ?
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
        folderCreatedAt,
        folderUpdatedAt,
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

  refreshProjectFolderTimes(projectId: string, folderCreatedAt: string | null, folderUpdatedAt: string | null): ProjectDetail {
    const current = this.getProject(projectId);
    const nextCreatedAt = folderCreatedAt ?? current.createdAt;
    const nextUpdatedAt = folderUpdatedAt ?? current.updatedAt;
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE projects SET folder_created_at = ?, folder_updated_at = ?, updated_at = ? WHERE id = ?")
      .run(nextCreatedAt, nextUpdatedAt, now, projectId);
    return this.getProject(projectId);
  }

  private listProjectTags(projectId: string): ProjectTag[] {
    const rows = this.db
      .prepare(
        `SELECT tags.id, tags.name, tags.path
         FROM tags
         JOIN project_tag_links ON project_tag_links.tag_id = tags.id
         WHERE project_tag_links.project_id = ?
         ORDER BY tags.path ASC`
      )
      .all(projectId) as ProjectTag[];
    const linked = new Map(rows.map((tag) => [tag.id, tag]));
    return this.listTags().flatMap((tag) => {
      const linkedTag = linked.get(tag.id);
      return linkedTag ? [linkedTag] : [];
    });
  }

  private replaceProjectTagLinks(projectId: string, tagIds: string[]): void {
    const cleaned = Array.from(new Set(tagIds.map((tagId) => tagId.trim()).filter(Boolean)));
    if (cleaned.length) {
      const foundRows = this.db
        .prepare(`SELECT id FROM tags WHERE id IN (${cleaned.map(() => "?").join(", ")})`)
        .all(...cleaned) as Array<{ id: string }>;
      const found = new Set(foundRows.map((row) => row.id));
      const missing = cleaned.find((tagId) => !found.has(tagId));
      if (missing) {
        throw new RepoLensError("tag_not_found", "One or more tags were not found.");
      }
    }

    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM project_tag_links WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare("INSERT INTO project_tag_links (project_id, tag_id) VALUES (?, ?)");
      for (const tagId of cleaned) {
        insert.run(projectId, tagId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof RepoLensError) {
        throw error;
      }
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }
  }

  private getTagByParentAndName(parentId: string | null, name: string): TagNode | null {
    const row = this.db
      .prepare(
        parentId
          ? `SELECT tags.*,
                    (SELECT count(*) FROM project_tag_links WHERE project_tag_links.tag_id = tags.id) AS project_count
             FROM tags WHERE parent_id = ? AND name = ?`
          : `SELECT tags.*,
                    (SELECT count(*) FROM project_tag_links WHERE project_tag_links.tag_id = tags.id) AS project_count
             FROM tags WHERE parent_id IS NULL AND name = ?`
      )
      .get(...(parentId ? [parentId, name] : [name])) as TagRow | undefined;
    return row ? mapTagNode(row) : null;
  }

  private listSiblingTagRows(parentId: string | null): TagRow[] {
    const rows = this.db
      .prepare(parentId ? "SELECT * FROM tags WHERE parent_id = ?" : "SELECT * FROM tags WHERE parent_id IS NULL")
      .all(...(parentId ? [parentId] : [])) as TagRow[];
    return rows.sort(compareTagRows);
  }

  private nextTagSortOrder(parentId: string | null): number {
    const row = this.db
      .prepare(
        parentId
          ? "SELECT coalesce(max(sort_order), -1) + 1 AS next_order FROM tags WHERE parent_id = ?"
          : "SELECT coalesce(max(sort_order), -1) + 1 AS next_order FROM tags WHERE parent_id IS NULL"
      )
      .get(...(parentId ? [parentId] : [])) as { next_order: number } | undefined;
    return Number(row?.next_order ?? 0);
  }

  private assertSiblingNameAvailable(parentId: string | null, name: string, exceptId?: string): void {
    const existing = this.getTagByParentAndName(parentId, name);
    if (existing && existing.id !== exceptId) {
      throw new RepoLensError("tag_duplicate", "A sibling tag with that name already exists.");
    }
  }

  private isDescendant(candidate: TagNode, ancestor: TagNode): boolean {
    return candidate.path.startsWith(`${ancestor.path}/`);
  }

  private getTagAndDescendantIds(tagIds: string[]): Set<string> {
    const selected = tagIds.map((id) => this.getTag(id));
    const allowed = new Set<string>();
    const rows = this.db.prepare("SELECT id, path FROM tags").all() as Array<{ id: string; path: string }>;
    for (const tag of selected) {
      for (const row of rows) {
        if (row.id === tag.id || row.path.startsWith(`${tag.path}/`)) {
          allowed.add(row.id);
        }
      }
    }
    return allowed;
  }

  private migrateFlatTags(): void {
    const rows = this.db
      .prepare("SELECT project_id, tag FROM project_tags WHERE trim(tag) <> '' ORDER BY tag ASC")
      .all() as Array<{ project_id: string; tag: string }>;
    if (!rows.length) {
      return;
    }

    const now = new Date().toISOString();
    const insertTag = this.db.prepare(
      `INSERT INTO tags (id, name, parent_id, path, sort_order, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    );
    const insertLink = this.db.prepare(
      `INSERT INTO project_tag_links (project_id, tag_id)
       VALUES (?, ?)
       ON CONFLICT(project_id, tag_id) DO NOTHING`
    );
    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        const name = normalizeLegacyTagName(row.tag);
        if (!name) {
          continue;
        }
        const tagId = idFromStableText("tag", name);
        insertTag.run(tagId, name, name, this.nextTagSortOrder(null), now, now);
        insertLink.run(row.project_id, tagId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
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
        folder_created_at TEXT,
        folder_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_tags (
        project_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (project_id, tag),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        path TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(parent_id, name),
        FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_tag_links (
        project_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (project_id, tag_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tags_path ON tags(path);
      CREATE INDEX IF NOT EXISTS idx_project_tag_links_tag_id ON project_tag_links(tag_id);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.ensureProjectFolderTimeColumns();
    this.ensureTagSortOrderColumn();
    this.migrateFlatTags();
  }

  private ensureProjectFolderTimeColumns(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>).map((column) => column.name)
    );
    if (!columns.has("folder_created_at")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN folder_created_at TEXT").run();
      this.db.prepare("UPDATE projects SET folder_created_at = created_at WHERE folder_created_at IS NULL").run();
    }
    if (!columns.has("folder_updated_at")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN folder_updated_at TEXT").run();
      this.db
        .prepare("UPDATE projects SET folder_updated_at = coalesce(last_modified_at, updated_at) WHERE folder_updated_at IS NULL")
        .run();
    }
  }

  private ensureTagSortOrderColumn(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(tags)").all() as Array<{ name: string }>).map((column) => column.name)
    );
    if (!columns.has("sort_order")) {
      this.db.prepare("ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
      this.normalizeTagSortOrders();
    }
  }

  private normalizeTagSortOrders(): void {
    const rows = this.db.prepare("SELECT * FROM tags ORDER BY path ASC").all() as TagRow[];
    if (!rows.length) {
      return;
    }
    const parentIds = new Set<string | null>(rows.map((row) => row.parent_id));
    const update = this.db.prepare("UPDATE tags SET sort_order = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      for (const parentId of parentIds) {
        const siblings = rows
          .filter((row) => row.parent_id === parentId)
          .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
        siblings.forEach((row, index) => update.run(index, row.id));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw new RepoLensError("database_failed", error instanceof Error ? error.message : String(error));
    }
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

function mapProjectListItem(row: ProjectRow, tags: ProjectTag[]): ProjectListItem {
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
    favorite: Boolean(row.favorite),
    createdAt: row.folder_created_at ?? row.created_at,
    updatedAt: row.folder_updated_at ?? row.updated_at
  };
}

function mapProjectDetail(row: ProjectRow, tags: ProjectTag[]): ProjectDetail {
  return {
    ...mapProjectListItem(row, tags),
    readmeSummary: row.readme_summary,
    startCommand: row.start_command,
    testCommand: row.test_command,
    entryFiles: parseJsonArray(row.entry_files),
    descriptionSource: row.description_source,
    startCommandSource: row.start_command_source,
    testCommandSource: row.test_command_source,
    lastScannedAt: row.last_scanned_at
  };
}

function mapTagNode(row: TagRow): TagNode {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    path: row.path,
    depth: row.path.split("/").length - 1,
    sortOrder: Number(row.sort_order ?? 0),
    projectCount: Number(row.project_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sortTagsForTree(rows: TagRow[]): TagRow[] {
  const byParent = new Map<string, TagRow[]>();
  for (const row of rows) {
    const key = row.parent_id ?? "";
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(compareTagRows);
  }

  const result: TagRow[] = [];
  const append = (parentId: string | null) => {
    for (const row of byParent.get(parentId ?? "") ?? []) {
      result.push(row);
      append(row.id);
    }
  };
  append(null);
  return result;
}

function compareTagRows(left: TagRow, right: TagRow): number {
  const order = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
  if (order !== 0) {
    return order;
  }
  return left.path.localeCompare(right.path, "zh-CN");
}

function normalizeTagName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new RepoLensError("tag_name_required", "Tag name is required.");
  }
  if (trimmed.includes("/")) {
    throw new RepoLensError("tag_name_invalid", "Tag names cannot contain /.");
  }
  return trimmed;
}

function normalizeLegacyTagName(name: string): string {
  return name.trim().replaceAll("/", "／");
}

function normalizeTagSegments(segments: string[]): string[] {
  if (!segments.length) {
    throw new RepoLensError("tag_name_required", "Tag path is required.");
  }
  return segments.map(normalizeTagName);
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
