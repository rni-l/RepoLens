import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { RepoLensDatabase } from "../src/backend/database.js";
import { parseProjectSort, sortProjects, type SortableProject } from "../src/lib/projectSort.js";

function project(name: string, overrides: Partial<SortableProject> = {}): SortableProject {
  return {
    name,
    pinned: false,
    priority: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

const items = [
  project("old-high", { priority: 3, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }),
  project("new-low", { priority: 1, createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z" }),
  project("pinned-old", { pinned: true, priority: 0, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" }),
  project("pinned-new", { pinned: true, priority: 2, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" }),
  project("mid", { priority: 2, createdAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" })
];

const names = (list: SortableProject[]) => list.map((item) => item.name);

test("pinned projects stay first in every sort, ordered by the same rule", () => {
  assert.deepEqual(names(sortProjects(items, { key: "updated", direction: "desc" })), [
    "pinned-new",
    "pinned-old",
    "new-low",
    "mid",
    "old-high"
  ]);
  assert.deepEqual(names(sortProjects(items, { key: "updated", direction: "asc" })), [
    "pinned-old",
    "pinned-new",
    "old-high",
    "mid",
    "new-low"
  ]);
  assert.deepEqual(names(sortProjects(items, { key: "priority", direction: "desc" })), [
    "pinned-new",
    "pinned-old",
    "old-high",
    "mid",
    "new-low"
  ]);
  assert.deepEqual(names(sortProjects(items, { key: "created", direction: "asc" })), [
    "pinned-old",
    "pinned-new",
    "old-high",
    "mid",
    "new-low"
  ]);
});

test("equal priority falls back to the most recently updated project", () => {
  const tied = [
    project("a", { priority: 2, updatedAt: "2026-01-01T00:00:00.000Z" }),
    project("b", { priority: 2, updatedAt: "2026-06-01T00:00:00.000Z" })
  ];
  assert.deepEqual(names(sortProjects(tied, { key: "priority", direction: "desc" })), ["b", "a"]);
  assert.deepEqual(names(sortProjects(tied, { key: "priority", direction: "asc" })), ["b", "a"]);
});

test("parseProjectSort rejects unknown stored values", () => {
  assert.deepEqual(parseProjectSort({ key: "priority", direction: "asc" }), { key: "priority", direction: "asc" });
  assert.deepEqual(parseProjectSort({ key: "size", direction: "asc" }), { key: "updated", direction: "desc" });
  assert.deepEqual(parseProjectSort(null), { key: "updated", direction: "desc" });
});

test("database persists pinned and priority and lists pinned projects first", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-rank-"));
  const database = new RepoLensDatabase(path.join(tempDir, "index.sqlite"));
  const base = {
    source: "manual" as const,
    status: "active" as const,
    description: null,
    readmeSummary: null,
    techStacks: [],
    startCommand: null,
    testCommand: null,
    entryFiles: [],
    lastModifiedAt: null,
    lastScannedAt: new Date().toISOString()
  };
  const older = database.upsertProject({
    ...base,
    id: "project_a",
    name: "older",
    path: path.join(tempDir, "older"),
    folderUpdatedAt: "2026-01-01T00:00:00.000Z"
  }).project;
  database.upsertProject({
    ...base,
    id: "project_b",
    name: "newer",
    path: path.join(tempDir, "newer"),
    folderUpdatedAt: "2026-06-01T00:00:00.000Z"
  });

  assert.equal(older.pinned, false);
  assert.equal(older.priority, 0);

  const updated = database.updateProject(older.id, { pinned: true, priority: 3 });
  assert.equal(updated.pinned, true);
  assert.equal(updated.priority, 3);
  assert.deepEqual(database.listProjects().map((item) => item.name), ["older", "newer"]);

  assert.throws(() => database.updateProject(older.id, { priority: 7 as never }), /Priority/);
  database.close();
});
