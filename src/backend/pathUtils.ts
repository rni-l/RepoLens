import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function normalizeFsPath(input: string): string {
  return path.resolve(expandHome(input.trim()));
}

export function idFromPath(prefix: string, fsPath: string): string {
  const normalized = normalizeFsPath(fsPath);
  const digest = createHash("sha1").update(normalized).digest("hex").slice(0, 18);
  return `${prefix}_${digest}`;
}

export function defaultDatabasePath(): string {
  return path.join(os.homedir(), ".repolens", "repolens.sqlite");
}

export function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(normalizeFsPath(parent), normalizeFsPath(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
