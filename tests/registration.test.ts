import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { RepoLensDatabase } from "../src/backend/database.js";
import { RepoLensService } from "../src/backend/appService.js";
import { computeRuleTagPaths, DEFAULT_AUTO_TAG_SETTINGS } from "../src/backend/autoTagRules.js";
import { detectLocalLinks, extractProjectMetadata, portsInCommand } from "../src/backend/metadata.js";
import { scanRoots } from "../src/backend/scanner.js";

async function workspace(prefix: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const root = path.join(tempDir, "root");
  await fs.mkdir(root, { recursive: true });
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  database.addScanRoot(root);
  const service = new RepoLensService(database, { aiProvider: null });
  return { tempDir, root, database, service };
}

async function writeProject(dir: string, files: Record<string, string>) {
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
}

test("portsInCommand reads common port flags", () => {
  assert.deepEqual(portsInCommand("vite --port 5280"), [5280]);
  assert.deepEqual(portsInCommand("next dev -p 3100"), [3100]);
  assert.deepEqual(portsInCommand("PORT=4000 node server.js"), [4000]);
  assert.deepEqual(portsInCommand("uvicorn app:app --port=8001"), [8001]);
  assert.deepEqual(portsInCommand("tsc -p tsconfig.json"), []);
});

test("detectLocalLinks merges scripts, env and compose, skipping database ports", async () => {
  const { tempDir } = await workspace("repolens-ports-");
  const project = path.join(tempDir, "app");
  await writeProject(project, {
    ".env": "PORT=4000\nDB_PORT=5432\n",
    "docker-compose.yml": 'services:\n  web:\n    ports:\n      - "8080:80"\n      - "5432:5432"\n'
  });
  const links = await detectLocalLinks(project, { scripts: { dev: "vite --port 5280" } }, ["Vite"]);
  assert.deepEqual(
    links.map((link) => link.url),
    ["http://localhost:5280", "http://localhost:4000", "http://localhost:8080"]
  );
});

test("detectLocalLinks falls back to framework defaults", async () => {
  const { tempDir } = await workspace("repolens-default-port-");
  const links = await detectLocalLinks(tempDir, { scripts: { dev: "vite" } }, ["Node.js", "Vite"]);
  assert.deepEqual(links.map((link) => link.port), [5173]);
});

test("rule tags use the language and path relative to the scan root", () => {
  const tags = computeRuleTagPaths(
    { path: "/work/poc/realtime-caption", techStacks: ["Node.js", "TypeScript", "Vite"] },
    DEFAULT_AUTO_TAG_SETTINGS,
    ["/work"]
  );
  assert.deepEqual(tags, ["代码类型/TypeScript", "项目类型/POC"]);

  // "poc" in the scan root path itself must not match.
  const outside = computeRuleTagPaths({ path: "/poc-root/app", techStacks: [] }, DEFAULT_AUTO_TAG_SETTINGS, ["/poc-root"]);
  assert.deepEqual(outside, []);
});

test("register resolves the project root from a subfolder and applies rule tags once", async () => {
  const { root, database, service } = await workspace("repolens-register-");
  const project = path.join(root, "demo-chat");
  await writeProject(project, {
    "package.json": JSON.stringify({ name: "demo-chat", scripts: { dev: "vite --port 5300" } }),
    "src/main.ts": ""
  });

  const first = await service.registerProject(path.join(project, "src"), { auto: true });
  assert.ok(first.status === "registered");
  assert.equal(first.project.path, project);
  assert.deepEqual(first.addedRuleTags, ["代码类型/Node.js", "项目类型/POC"]);
  assert.equal(first.needsEnrichment, true);
  assert.deepEqual(first.project.links.map((link) => link.url), ["http://localhost:5300"]);

  // A user removing a rule tag must not see it come back on the next registration.
  await service.removeProjectTagPaths(first.project.id, ["项目类型/POC"]);
  const second = await service.registerProject(project, { auto: true });
  assert.ok(second.status === "updated");
  assert.deepEqual(second.addedRuleTags, []);
  assert.deepEqual(second.project.tags.map((tag) => tag.path), ["代码类型/Node.js"]);

  await service.updateProject(first.project.id, { description: "Chat POC" });
  const third = await service.addProjectTagPaths(first.project.id, ["业务领域/AI"], "agent");
  assert.equal(third.tags.find((tag) => tag.path === "业务领域/AI")?.source, "agent");
  const fourth = await service.registerProject(project, { auto: true });
  assert.ok(fourth.status !== "skipped");
  assert.equal(fourth.needsEnrichment, false);
  database.close();
});

test("auto register skips folders outside roots or without markers", async () => {
  const { tempDir, root, database, service } = await workspace("repolens-skip-");
  const outside = path.join(tempDir, "elsewhere");
  await writeProject(outside, { "package.json": "{}" });
  const emptyPoc = path.join(root, "new-idea");
  await fs.mkdir(emptyPoc);

  const outsideResult = await service.registerProject(outside, { auto: true });
  assert.equal(outsideResult.status, "skipped");
  assert.equal(outsideResult.status === "skipped" && outsideResult.reason, "outside_scan_roots");

  const emptyResult = await service.registerProject(emptyPoc, { auto: true });
  assert.equal(emptyResult.status === "skipped" && emptyResult.reason, "no_project_marker");
  assert.equal(emptyResult.status === "skipped" && emptyResult.looksNew, true);

  // Explicit registration of a bare folder is allowed and survives rescans.
  const explicit = await service.registerProject(emptyPoc);
  assert.equal(explicit.status, "registered");
  await scanRoots({ roots: database.listScanRoots(), database });
  assert.equal(database.getProjectByPath(emptyPoc)?.status, "active");
  database.close();
});

test("rescans replace auto links but keep user links", async () => {
  const { root, database, service } = await workspace("repolens-links-");
  const project = path.join(root, "web");
  await writeProject(project, { "package.json": JSON.stringify({ scripts: { dev: "vite --port 5400" } }) });
  const registered = await service.registerProject(project);
  assert.ok(registered.status !== "skipped");
  const id = registered.project.id;

  await service.addProjectLink({ projectId: id, env: "prod", url: "https://web.example.com/", label: "官网" });
  await writeProject(project, { "package.json": JSON.stringify({ scripts: { dev: "vite --port 5401" } }) });
  await scanRoots({ roots: database.listScanRoots(), database });

  const links = database.getProject(id).links;
  assert.deepEqual(
    links.map((link) => [link.env, link.url, link.source]),
    [
      ["local", "http://localhost:5401", "auto"],
      ["prod", "https://web.example.com", "user"]
    ]
  );

  // Editing an auto link claims it so the next scan leaves it alone.
  await service.updateProjectLink(links[0].id, { label: "前端" });
  await scanRoots({ roots: database.listScanRoots(), database });
  assert.equal(database.getProject(id).links.filter((link) => link.env === "local").length, 1);
  assert.equal(database.getProject(id).links[0].source, "user");
  database.close();
});

test("clearAutoTags keeps user tags and UI tag edits keep sources", async () => {
  const { root, database, service } = await workspace("repolens-clear-");
  const project = path.join(root, "playground-x");
  await writeProject(project, { "package.json": "{}" });
  const registered = await service.registerProject(project);
  assert.ok(registered.status !== "skipped");
  const id = registered.project.id;
  const mine = database.findOrCreateTagPath(["优先级", "高"]);
  const current = database.getProject(id);
  database.updateProject(id, { tagIds: [...current.tags.map((tag) => tag.id), mine.id] });
  assert.deepEqual(
    database.getProject(id).tags.map((tag) => [tag.path, tag.source]),
    [
      ["代码类型/Node.js", "rule"],
      ["项目类型/POC", "rule"],
      ["优先级/高", "user"]
    ]
  );

  const cleared = await service.clearAutoTags(id);
  assert.deepEqual(cleared.tags.map((tag) => tag.path), ["优先级/高"]);
  database.close();
});

test("existing databases gain the tag source column with user as default", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-migrate-"));
  const dbPath = path.join(tempDir, "old.sqlite");
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE project_tag_links (project_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (project_id, tag_id));
    INSERT INTO project_tag_links VALUES ('project_a', 'tag_a');
  `);
  legacy.close();

  const database = new RepoLensDatabase(dbPath);
  database.close();
  const check = new DatabaseSync(dbPath);
  const row = check.prepare("SELECT source FROM project_tag_links").get() as { source: string };
  check.close();
  assert.equal(row.source, "user");
});

test("metadata extraction exposes auto links for scanned projects", async () => {
  const { root } = await workspace("repolens-extract-");
  const project = path.join(root, "next-app");
  await writeProject(project, { "package.json": JSON.stringify({ scripts: { dev: "next dev" } }), "next.config.mjs": "" });
  const extracted = await extractProjectMetadata(project, "scan");
  assert.ok(extracted.techStacks.includes("Next.js"));
  assert.deepEqual(extracted.autoLinks?.map((link) => link.url), ["http://localhost:3000"]);
});
