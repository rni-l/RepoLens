import path from "node:path";
import type { RepoLensDatabase } from "./database.js";
import { isSubPath } from "./pathUtils.js";

export type AutoTagRule = {
  /** Case-insensitive regex tested against "<path relative to scan root>" (or the folder name outside roots). */
  pattern: string;
  /** Tag path such as "项目类型/POC". */
  tag: string;
};

export type AutoTagSettings = {
  /** Parent tag for language tags, e.g. "代码类型" → "代码类型/Python". null disables language tags. */
  techStackPrefix: string | null;
  rules: AutoTagRule[];
};

export const AUTO_TAG_SETTINGS_KEY = "autoTagRules";

export const DEFAULT_AUTO_TAG_SETTINGS: AutoTagSettings = {
  techStackPrefix: "代码类型",
  rules: [{ pattern: "(^|[/_.-])(poc|demo|playground|sandbox)([/_.-]|$)", tag: "项目类型/POC" }]
};

// Frameworks (Vite, Next.js) and Feishu stay in techStacks only; tags carry the language.
const LANGUAGE_STACKS = ["TypeScript", "Node.js", "Python", "Java", "PHP", "Rust", "Go"];

export function loadAutoTagSettings(database: RepoLensDatabase): AutoTagSettings {
  const stored = database.getSetting<Partial<AutoTagSettings>>(AUTO_TAG_SETTINGS_KEY);
  return {
    techStackPrefix:
      stored?.techStackPrefix === undefined ? DEFAULT_AUTO_TAG_SETTINGS.techStackPrefix : stored.techStackPrefix,
    rules: Array.isArray(stored?.rules) ? stored.rules : DEFAULT_AUTO_TAG_SETTINGS.rules
  };
}

export function saveAutoTagSettings(database: RepoLensDatabase, settings: AutoTagSettings): void {
  database.setSetting(AUTO_TAG_SETTINGS_KEY, settings);
}

export function computeRuleTagPaths(
  project: { path: string; techStacks: string[] },
  settings: AutoTagSettings,
  scanRootPaths: string[]
): string[] {
  const tagPaths = new Set<string>();

  if (settings.techStackPrefix) {
    // A TypeScript project is also Node.js; keep only the more specific language.
    const languages = LANGUAGE_STACKS.filter((stack) => project.techStacks.includes(stack));
    const effective = languages.includes("TypeScript") ? languages.filter((stack) => stack !== "Node.js") : languages;
    for (const stack of effective) {
      tagPaths.add(`${settings.techStackPrefix}/${stack}`);
    }
  }

  const root = scanRootPaths
    .filter((rootPath) => isSubPath(rootPath, project.path))
    .sort((left, right) => right.length - left.length)[0];
  const subject = root ? path.relative(root, project.path) || path.basename(project.path) : path.basename(project.path);
  for (const rule of settings.rules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, "i");
    } catch {
      continue;
    }
    if (rule.tag.trim() && regex.test(subject)) {
      tagPaths.add(rule.tag.trim());
    }
  }

  return Array.from(tagPaths);
}

/** Adds rule tags (source "rule") to a project; returns the tag paths that were newly linked. */
export function applyAutoTagRules(database: RepoLensDatabase, projectId: string): string[] {
  const project = database.getProject(projectId);
  const settings = loadAutoTagSettings(database);
  const roots = database.listScanRoots().map((root) => root.path);
  const added: string[] = [];
  for (const tagPath of computeRuleTagPaths(project, settings, roots)) {
    const segments = tagPath.split("/").map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) {
      continue;
    }
    const tag = database.findOrCreateTagPath(segments);
    if (database.addProjectTagLinks(projectId, [tag.id], "rule")) {
      added.push(tag.path);
    }
  }
  return added;
}
