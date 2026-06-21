import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { RepoLensDatabase } from "../src/backend/database.js";
import { RepoLensService } from "../src/backend/appService.js";
import { scanRoots } from "../src/backend/scanner.js";
import { extractProjectMetadata } from "../src/backend/metadata.js";

test("scanner detects strict project roots and does not recurse into detected projects", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-scan-"));
  const dbPath = path.join(tempDir, "index.sqlite");
  const workspace = path.join(tempDir, "workspace");
  const app = path.join(workspace, "app");
  const nested = path.join(app, "examples", "nested");
  const ignored = path.join(workspace, "node_modules", "ignored-package");
  await fs.mkdir(nested, { recursive: true });
  await fs.mkdir(ignored, { recursive: true });
  await fs.writeFile(
    path.join(app, "package.json"),
    JSON.stringify({ name: "demo-app", description: "Demo app", scripts: { dev: "vite", test: "vitest" } })
  );
  await fs.writeFile(path.join(app, "README.md"), "# Demo\n\nThis is the first useful paragraph.");
  await fs.writeFile(path.join(nested, "package.json"), JSON.stringify({ name: "nested" }));
  await fs.writeFile(path.join(ignored, "package.json"), JSON.stringify({ name: "ignored" }));

  const database = new RepoLensDatabase(dbPath);
  database.addScanRoot(workspace);
  const summary = await scanRoots({ roots: database.listScanRoots(), database });
  const projects = database.listProjects();
  database.close();

  assert.equal(summary.scannedRoots, 1);
  assert.equal(summary.discoveredProjects, 1);
  assert.equal(summary.addedProjects, 1);
  assert.equal(summary.skippedDirs, 1);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "demo-app");
  assert.deepEqual(projects[0].techStacks, ["Node.js"]);
});

test("rescans preserve user-maintained project fields", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-preserve-"));
  const dbPath = path.join(tempDir, "index.sqlite");
  const projectPath = path.join(tempDir, "app");
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({ name: "app", description: "Auto description", scripts: { dev: "vite", test: "vitest" } })
  );

  const database = new RepoLensDatabase(dbPath);
  const first = await extractProjectMetadata(projectPath, "scan");
  const inserted = database.upsertProject(first).project;
  database.updateProject(inserted.id, {
    description: "User description",
    startCommand: "pnpm dev",
    testCommand: "pnpm test",
    tags: ["important"]
  });

  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({ name: "app", description: "Changed auto", scripts: { start: "node server.js", test: "node test.js" } })
  );

  const second = await extractProjectMetadata(projectPath, "scan");
  const rescanned = database.upsertProject(second).project;
  database.close();

  assert.equal(rescanned.description, "User description");
  assert.equal(rescanned.startCommand, "pnpm dev");
  assert.equal(rescanned.testCommand, "pnpm test");
  assert.deepEqual(rescanned.tags, ["important"]);
  assert.equal(rescanned.descriptionSource, "user");
  assert.equal(rescanned.startCommandSource, "user");
  assert.equal(rescanned.testCommandSource, "user");
});

test("service validates scan root folders before saving", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-root-"));
  const dbPath = path.join(tempDir, "index.sqlite");
  const workspace = path.join(tempDir, "workspace");
  await fs.mkdir(workspace, { recursive: true });

  const service = new RepoLensService(new RepoLensDatabase(dbPath));
  const root = await service.addScanRoot(workspace);
  assert.equal(root.path, workspace);

  await assert.rejects(
    () => service.addScanRoot(path.join(tempDir, "missing")),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "scan_root_not_found" &&
      error.message === "Scan root path must be an existing folder."
  );
  service.close();
});
