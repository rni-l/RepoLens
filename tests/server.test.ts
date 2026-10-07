import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const serverPath = fileURLToPath(new URL("../src/backend/server.js", import.meta.url));

test("server answers pipelined requests by id and keeps running after errors", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-server-"));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, REPOLENS_DB_PATH: path.join(tempDir, "index.sqlite"), REPOLENS_AI_DISABLED: "1" },
    stdio: ["pipe", "pipe", "ignore"]
  });
  const responses = new Map<number, { ok: boolean; result?: unknown; error?: { message?: string } }>();
  const done = new Promise<void>((resolve) => {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      const message = JSON.parse(line);
      responses.set(message.id, message);
      if (responses.size === 3) resolve();
    });
  });

  child.stdin.write(`${JSON.stringify({ id: 1, command: "list_tags" })}\n`);
  child.stdin.write(`${JSON.stringify({ id: 2, command: "no_such_command" })}\n`);
  child.stdin.write(`${JSON.stringify({ id: 3, command: "list_projects", args: { filters: {} } })}\n`);
  await done;

  assert.deepEqual(responses.get(1), { id: 1, ok: true, result: [] });
  assert.equal(responses.get(2)?.ok, false);
  assert.match(String(responses.get(2)?.error?.message), /Unknown command/);
  assert.deepEqual(responses.get(3), { id: 3, ok: true, result: [] });

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.stdin.end();
  assert.equal(await exited, 0);
});
