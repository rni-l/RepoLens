import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { RepoLensDatabase } from "../src/backend/database.js";
import { RepoLensError } from "../src/backend/errors.js";
import { idFromPath } from "../src/backend/pathUtils.js";

test("migrates legacy flat tags into root tag nodes idempotently", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tags-migration-"));
  const dbPath = path.join(tempDir, "index.sqlite");
  const projectPath = path.join(tempDir, "app");

  const database = new RepoLensDatabase(dbPath);
  const project = database.upsertProject(projectInput(projectPath, "demo-app")).project;
  database.close();

  const raw = new DatabaseSync(dbPath);
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.prepare("INSERT INTO project_tags (project_id, tag) VALUES (?, ?)").run(project.id, "important");
  raw.prepare("INSERT INTO project_tags (project_id, tag) VALUES (?, ?)").run(project.id, "internal");
  raw.close();

  const reopened = new RepoLensDatabase(dbPath);
  const tagsAfterFirstMigration = reopened.listTags();
  assert.deepEqual(tagsAfterFirstMigration.map((tag) => tag.path), ["important", "internal"]);
  assert.deepEqual(reopened.getProject(project.id).tags.map((tag) => tag.path), ["important", "internal"]);
  reopened.close();

  const migratedAgain = new RepoLensDatabase(dbPath);
  assert.deepEqual(migratedAgain.listTags().map((tag) => tag.path), ["important", "internal"]);
  assert.deepEqual(migratedAgain.getProject(project.id).tags.map((tag) => tag.path), ["important", "internal"]);
  migratedAgain.close();
});

test("creates nested tags and rejects duplicate siblings", async () => {
  const database = new RepoLensDatabase(await tempDbPath("repolens-tags-crud-"));
  const domain = database.createTag({ name: "业务域" });
  const water = database.createTag({ name: "水健康", parentId: domain.id });
  const transform = database.createTag({ name: "数据转换", parentId: water.id });

  assert.equal(domain.path, "业务域");
  assert.equal(water.path, "业务域/水健康");
  assert.equal(transform.path, "业务域/水健康/数据转换");
  assert.equal(transform.depth, 2);

  assert.throws(
    () => database.createTag({ name: "数据转换", parentId: water.id }),
    (error: unknown) => error instanceof RepoLensError && error.code === "tag_duplicate"
  );
  database.close();
});

test("renaming and moving tags recomputes descendant paths and prevents cycles", async () => {
  const database = new RepoLensDatabase(await tempDbPath("repolens-tags-move-"));
  const domain = database.createTag({ name: "业务域" });
  const water = database.createTag({ name: "水健康", parentId: domain.id });
  const transform = database.createTag({ name: "数据转换", parentId: water.id });
  const type = database.createTag({ name: "项目类型" });

  const renamed = database.updateTag(water.id, { name: "饮水业务" });
  assert.equal(renamed.path, "业务域/饮水业务");
  assert.equal(database.getTag(transform.id).path, "业务域/饮水业务/数据转换");

  database.updateTag(water.id, { parentId: type.id });
  assert.equal(database.getTag(water.id).path, "项目类型/饮水业务");
  assert.equal(database.getTag(transform.id).path, "项目类型/饮水业务/数据转换");

  assert.throws(
    () => database.updateTag(type.id, { parentId: transform.id }),
    (error: unknown) => error instanceof RepoLensError && error.code === "tag_cycle"
  );
  database.close();
});

test("updates projects with structured tag links and rejects unknown tag ids", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tags-project-"));
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  const project = database.upsertProject(projectInput(path.join(tempDir, "app"), "demo-app")).project;
  const root = database.createTag({ name: "项目类型" });
  const cli = database.createTag({ name: "CLI 工具", parentId: root.id });

  const updated = database.updateProject(project.id, { tagIds: [cli.id, cli.id] });
  assert.deepEqual(updated.tags.map((tag) => tag.path), ["项目类型/CLI 工具"]);

  assert.throws(
    () => database.updateProject(project.id, { tagIds: ["tag_missing"] }),
    (error: unknown) => error instanceof RepoLensError && error.code === "tag_not_found"
  );
  database.close();
});

test("tag filters include descendant assignments and query search matches tag paths", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tags-filter-"));
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  const waterProject = database.upsertProject(projectInput(path.join(tempDir, "water"), "water-tool")).project;
  const todoProject = database.upsertProject(projectInput(path.join(tempDir, "todo"), "todo-app")).project;
  const domain = database.createTag({ name: "业务域" });
  const water = database.createTag({ name: "水健康", parentId: domain.id });
  const transform = database.createTag({ name: "数据转换", parentId: water.id });
  const type = database.createTag({ name: "项目类型" });
  const webApp = database.createTag({ name: "Web App", parentId: type.id });

  database.updateProject(waterProject.id, { tagIds: [transform.id] });
  database.updateProject(todoProject.id, { tagIds: [webApp.id] });

  assert.deepEqual(database.listProjects({ tagIds: [water.id] }).map((project) => project.id), [waterProject.id]);
  assert.deepEqual(database.listProjects({ query: "水健康" }).map((project) => project.id), [waterProject.id]);
  assert.deepEqual(database.listProjects({ query: "业务域 / 水健康" }).map((project) => project.id), [waterProject.id]);
  assert.deepEqual(database.listProjects({ query: "Web App" }).map((project) => project.id), [todoProject.id]);
  database.close();
});

test("deleting a parent tag removes descendants and project links", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tags-delete-"));
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  const project = database.upsertProject(projectInput(path.join(tempDir, "app"), "demo-app")).project;
  const root = database.createTag({ name: "业务域" });
  const child = database.createTag({ name: "水健康", parentId: root.id });

  database.updateProject(project.id, { tagIds: [child.id] });
  database.deleteTag(root.id);

  assert.deepEqual(database.listTags(), []);
  assert.deepEqual(database.getProject(project.id).tags, []);
  database.close();
});

async function tempDbPath(prefix: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(tempDir, "index.sqlite");
}

function projectInput(projectPath: string, name: string) {
  const normalizedPath = path.resolve(projectPath);
  return {
    id: idFromPath("project", normalizedPath),
    name,
    path: normalizedPath,
    source: "scan" as const,
    status: "active" as const,
    description: `${name} description`,
    readmeSummary: null,
    techStacks: ["Node.js"],
    startCommand: "npm run dev",
    testCommand: "npm test",
    entryFiles: ["src/main.ts"],
    lastModifiedAt: null,
    lastScannedAt: new Date().toISOString()
  };
}
