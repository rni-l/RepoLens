import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTagsForTree, pruneSelectedTagIds, type SortableTagNode } from "../src/lib/tagState.js";

test("orders tag tree by sibling sortOrder instead of path text", () => {
  const rootA: SortableTagNode = { id: "root-a", parentId: null, path: "A", sortOrder: 1 };
  const rootB: SortableTagNode = { id: "root-b", parentId: null, path: "B", sortOrder: 0 };
  const childA: SortableTagNode = { id: "child-a", parentId: "root-b", path: "B/A", sortOrder: 1 };
  const childB: SortableTagNode = { id: "child-b", parentId: "root-b", path: "B/B", sortOrder: 0 };

  assert.deepEqual(
    orderTagsForTree([rootA, childA, rootB, childB]).map((tag) => tag.id),
    ["root-b", "child-b", "child-a", "root-a"]
  );
});

test("prunes selected tag ids that no longer exist", () => {
  assert.deepEqual(pruneSelectedTagIds(["a", "missing", "b"], ["a", "b"]), ["a", "b"]);
});
