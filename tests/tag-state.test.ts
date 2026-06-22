import test from "node:test";
import assert from "node:assert/strict";
import { pruneSelectedTagIds } from "../src/lib/tagState.js";

test("pruneSelectedTagIds preserves array identity when nothing changes", () => {
  const selected: string[] = [];
  assert.equal(pruneSelectedTagIds(selected, []), selected);

  const populated = ["tag_a", "tag_b"];
  assert.equal(pruneSelectedTagIds(populated, ["tag_a", "tag_b", "tag_c"]), populated);
});

test("pruneSelectedTagIds returns a new array only when invalid ids are removed", () => {
  const selected = ["tag_a", "tag_missing", "tag_b"];
  const next = pruneSelectedTagIds(selected, ["tag_a", "tag_b"]);

  assert.notEqual(next, selected);
  assert.deepEqual(next, ["tag_a", "tag_b"]);
});
