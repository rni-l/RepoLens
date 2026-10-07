import readline from "node:readline";
import { RepoLensService } from "./appService.js";
import { dispatch, type BackendRequest } from "./dispatch.js";
import { errorToJson } from "./errors.js";

/**
 * Long-lived backend for the desktop app: one JSON request per stdin line, one JSON response per
 * stdout line, matched by id. Requests run concurrently, so a slow scan never blocks a quick read.
 */
const service = new RepoLensService();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", (line) => {
  if (!line.trim()) return;
  let id: unknown = null;
  void (async () => {
    try {
      const request = JSON.parse(line) as BackendRequest & { id?: unknown };
      id = request.id ?? null;
      const result = await dispatch(service, request);
      respond({ id, ok: true, result: result ?? null });
    } catch (error) {
      respond({ id, ok: false, error: errorToJson(error) });
    }
  })();
});

input.on("close", () => {
  service.close();
  process.exit(0);
});

function respond(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
