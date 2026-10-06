import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AiTaggingStatus,
  ApplyTagSuggestionsInput,
  AppApi,
  BulkTagProjectsInput,
  BulkTagProjectsResult,
  GenerateTagSuggestionsInput,
  GenerateTagSuggestionsResult,
  OpenAction,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectLinkInput,
  ProjectLinkPatch,
  ProjectListItem,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  ScanSummary,
  TagCreateInput,
  TagMoveDirection,
  TagNode,
  TagSource,
  TagUpdatePatch
} from "../shared/types.js";
import {
  buildAiTagPayload,
  DeterministicMockAiTagProvider,
  generateValidatedTagSuggestions,
  type AiTagProvider
} from "./aiTagProvider.js";
import { applyAutoTagRules } from "./autoTagRules.js";
import { RepoLensDatabase } from "./database.js";
import { RepoLensError } from "./errors.js";
import { extractProjectMetadata, hasStrictProjectMarker, pathExists } from "./metadata.js";
import { OpenAiCompatibleTagProvider } from "./openAiCompatibleTagProvider.js";
import { getIntegrationStatus } from "./integrations.js";
import { detectOpenActions, openPath, openUrl } from "./openActions.js";
import { isSubPath, normalizeFsPath } from "./pathUtils.js";
import { scanRoots } from "./scanner.js";

export type RegisterOptions = {
  /**
   * Hook/shell mode: only register folders inside an enabled scan root that look like projects
   * (a marker file on the way down from the root). Explicit mode also accepts a bare folder.
   */
  auto?: boolean;
  /** Allow folders outside every scan root (explicit mode only). */
  force?: boolean;
};

export type RegisterResult =
  | {
      status: "registered" | "updated";
      project: ProjectDetail;
      addedRuleTags: string[];
      /** No description yet, or no tags beyond rule tags: an agent should fill these in. */
      needsEnrichment: boolean;
    }
  | {
      status: "skipped";
      reason: "outside_scan_roots" | "no_project_marker" | "not_a_directory";
      path: string;
      /** Looks like a freshly created folder for a new project. */
      looksNew: boolean;
    };

type RepoLensServiceOptions = {
  aiProvider?: AiTagProvider | null;
  env?: NodeJS.ProcessEnv;
};

export class RepoLensService implements AppApi {
  constructor(
    private readonly database: RepoLensDatabase = new RepoLensDatabase(),
    private readonly options: RepoLensServiceOptions = {}
  ) {}

  close(): void {
    this.database.close();
  }

  async listProjects(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
    await this.refreshFolderTimesForList();
    return this.database.listProjects(filters);
  }

  async getProject(projectId: string): Promise<ProjectDetail> {
    const project = this.database.getProject(projectId);
    await this.refreshFolderTimes(project);
    return this.database.getProject(projectId);
  }

  async updateProject(projectId: string, patch: ProjectUpdatePatch): Promise<ProjectDetail> {
    return this.database.updateProject(projectId, patch);
  }

  async bulkTagProjects(input: BulkTagProjectsInput): Promise<BulkTagProjectsResult> {
    return this.database.bulkTagProjects(input);
  }

  async addManualProject(projectPathInput: string): Promise<ProjectDetail> {
    const projectPath = normalizeFsPath(projectPathInput);
    const stats = await fs.stat(projectPath).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new RepoLensError("manual_project_not_found", "Manual project path must be an existing folder.");
    }
    const project = await extractProjectMetadata(projectPath, "manual");
    return this.database.upsertProject(project).project;
  }

  async registerProject(inputPath: string, options: RegisterOptions = {}): Promise<RegisterResult> {
    const target = normalizeFsPath(inputPath);
    const stats = await fs.stat(target).catch(() => null);
    if (!stats?.isDirectory()) {
      return { status: "skipped", reason: "not_a_directory", path: target, looksNew: false };
    }

    const existing = this.database.findProjectContainingPath(target);
    if (existing) {
      return this.upsertRegisteredProject(existing.path, existing.source, existing);
    }

    const root = this.findScanRoot(target);
    if (!root && (options.auto || !options.force)) {
      return { status: "skipped", reason: "outside_scan_roots", path: target, looksNew: false };
    }

    // Mirror the scanner: walking down from the root, the first folder with a marker is the project.
    const candidates = root ? pathsFromRoot(root, target) : [target];
    for (const candidate of candidates) {
      const markers = await hasStrictProjectMarker(candidate).catch(() => []);
      if (markers.length) {
        return this.upsertRegisteredProject(candidate, root ? "scan" : "manual", null);
      }
    }

    if (options.auto) {
      return { status: "skipped", reason: "no_project_marker", path: target, looksNew: await looksLikeNewFolder(target, root) };
    }
    if (root && target === root) {
      return { status: "skipped", reason: "no_project_marker", path: target, looksNew: false };
    }
    // An explicit register of a bare folder is a deliberate choice; "manual" keeps rescans from marking it missing.
    return this.upsertRegisteredProject(target, "manual", null);
  }

  /** Accepts a project id, or any path inside a registered project. */
  async resolveProject(ref: string): Promise<ProjectDetail> {
    if (/^project_[0-9a-f]+$/.test(ref)) {
      return this.database.getProject(ref);
    }
    const project = this.database.findProjectContainingPath(ref);
    if (!project) {
      throw new RepoLensError("project_not_found", `No registered project contains ${normalizeFsPath(ref)}. Run \`repolens register\` first.`);
    }
    return project;
  }

  async addProjectTagPaths(projectId: string, tagPaths: string[], source: TagSource): Promise<ProjectDetail> {
    const tagIds = tagPaths.map((tagPath) => this.database.findOrCreateTagPath(splitTagPath(tagPath)).id);
    this.database.addProjectTagLinks(projectId, tagIds, source);
    return this.database.getProject(projectId);
  }

  async removeProjectTagPaths(projectId: string, tagPaths: string[]): Promise<ProjectDetail> {
    const tagIds = tagPaths.map((tagPath) => {
      const tag = this.database.getTagByPath(splitTagPath(tagPath).join("/"));
      if (!tag) {
        throw new RepoLensError("tag_not_found", `Tag was not found: ${tagPath}`);
      }
      return tag.id;
    });
    this.database.removeProjectTagLinks(projectId, tagIds);
    return this.database.getProject(projectId);
  }

  async applyAutoTagRules(projectId: string): Promise<string[]> {
    return applyAutoTagRules(this.database, projectId);
  }

  async clearAutoTags(projectId: string): Promise<ProjectDetail> {
    this.database.removeTagLinksBySource(projectId, ["rule", "agent"]);
    return this.database.getProject(projectId);
  }

  async addProjectLink(input: ProjectLinkInput): Promise<ProjectDetail> {
    const link = this.database.addProjectLink(input);
    return this.database.getProject(link.projectId);
  }

  async updateProjectLink(id: string, patch: ProjectLinkPatch): Promise<ProjectDetail> {
    const link = this.database.updateProjectLink(id, patch);
    return this.database.getProject(link.projectId);
  }

  async deleteProjectLink(id: string): Promise<ProjectDetail> {
    const link = this.database.deleteProjectLink(id);
    return this.database.getProject(link.projectId);
  }

  async openUrl(url: string): Promise<void> {
    await openUrl(url);
  }

  async getIntegrationStatus() {
    return getIntegrationStatus();
  }

  getDatabase(): RepoLensDatabase {
    return this.database;
  }

  async deleteProject(projectId: string): Promise<void> {
    this.database.deleteProject(projectId);
  }

  async listTags(): Promise<TagNode[]> {
    return this.database.listTags();
  }

  async createTag(input: TagCreateInput): Promise<TagNode> {
    return this.database.createTag(input);
  }

  async updateTag(id: string, patch: TagUpdatePatch): Promise<TagNode> {
    return this.database.updateTag(id, patch);
  }

  async moveTag(id: string, direction: TagMoveDirection): Promise<TagNode[]> {
    return this.database.moveTag(id, direction);
  }

  async deleteTag(id: string): Promise<void> {
    this.database.deleteTag(id);
  }

  async getAiTaggingStatus(): Promise<AiTaggingStatus> {
    const provider = this.resolveAiProvider();
    if (provider) {
      return {
        available: true,
        provider: provider.name,
        model: provider.model
      };
    }
    return {
      available: false,
      provider: "none",
      model: null,
      reason: this.aiDisabled() ? "disabled" : "not_configured"
    };
  }

  async generateTagSuggestions(input: GenerateTagSuggestionsInput): Promise<GenerateTagSuggestionsResult> {
    const provider = this.resolveAiProvider();
    if (!provider) {
      throw new RepoLensError("ai_not_configured", "AI tag suggestions are not configured.");
    }
    const project = this.database.getProject(input.projectId);
    const payload = buildAiTagPayload(project, this.database.listTags());
    return generateValidatedTagSuggestions(provider, payload, input);
  }

  async applyTagSuggestions(input: ApplyTagSuggestionsInput): Promise<ProjectDetail> {
    const project = this.database.getProject(input.projectId);
    const tagIds = new Set(input.mode === "append" ? project.tags.map((tag) => tag.id) : []);
    for (const suggestion of input.suggestions) {
      const tag = suggestion.tagId
        ? this.database.getTag(suggestion.tagId)
        : this.database.findOrCreateTagPath(suggestion.segments);
      tagIds.add(tag.id);
    }
    return this.database.updateProject(input.projectId, { tagIds: Array.from(tagIds) });
  }

  async listScanRoots(): Promise<ScanRoot[]> {
    return this.database.listScanRoots();
  }

  async addScanRoot(path: string): Promise<ScanRoot> {
    const rootPath = normalizeFsPath(path);
    const stats = await fs.stat(rootPath).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new RepoLensError("scan_root_not_found", "Scan root path must be an existing folder.");
    }
    return this.database.addScanRoot(rootPath);
  }

  async updateScanRoot(id: string, patch: ScanRootUpdatePatch): Promise<ScanRoot> {
    return this.database.updateScanRoot(id, patch);
  }

  async removeScanRoot(id: string): Promise<void> {
    this.database.removeScanRoot(id);
  }

  async scanAllRoots(): Promise<ScanSummary> {
    return scanRoots({
      roots: this.database.listScanRoots(),
      database: this.database
    });
  }

  async scanRoot(rootId: string): Promise<ScanSummary> {
    return scanRoots({
      roots: [this.database.getScanRoot(rootId)],
      database: this.database
    });
  }

  async detectOpenActions(): Promise<OpenActionAvailability[]> {
    return detectOpenActions();
  }

  async openProject(projectId: string, action: OpenAction): Promise<void> {
    const project = this.database.getProject(projectId);
    if (!(await pathExists(project.path))) {
      this.database.updateProject(projectId, { status: "missing" });
      throw new RepoLensError("project_path_missing", "Project path does not exist.");
    }
    await openPath(project.path, action);
  }

  private async upsertRegisteredProject(
    projectPath: string,
    source: "scan" | "manual",
    existing: ProjectDetail | null
  ): Promise<RegisterResult> {
    const metadata = await extractProjectMetadata(projectPath, source);
    const { project, created } = this.database.upsertProject(metadata);
    const addedRuleTags = created ? applyAutoTagRules(this.database, project.id) : [];
    const current = this.database.getProject(project.id);
    const hasCuratedTags = current.tags.some((tag) => tag.source !== "rule");
    return {
      status: existing ? "updated" : "registered",
      project: current,
      addedRuleTags,
      needsEnrichment: !current.description?.trim() || !hasCuratedTags
    };
  }

  private findScanRoot(target: string): string | null {
    return (
      this.database
        .listScanRoots()
        .filter((root) => root.enabled && isSubPath(root.path, target))
        .map((root) => root.path)
        .sort((left, right) => right.length - left.length)[0] ?? null
    );
  }

  private resolveAiProvider(): AiTagProvider | null {
    if (this.options.aiProvider !== undefined) {
      return this.options.aiProvider;
    }
    if (this.aiDisabled()) {
      return null;
    }
    const env = this.options.env ?? process.env;
    if (env.REPOLENS_AI_PROVIDER === "mock" || env.NODE_ENV === "development") {
      return new DeterministicMockAiTagProvider();
    }
    if (!env.REPOLENS_AI_API_KEY) {
      return null;
    }
    return new OpenAiCompatibleTagProvider({
      apiKey: env.REPOLENS_AI_API_KEY,
      baseUrl: env.REPOLENS_AI_BASE_URL,
      model: env.REPOLENS_AI_MODEL
    });
  }

  private aiDisabled(): boolean {
    const env = this.options.env ?? process.env;
    return env.REPOLENS_AI_DISABLED === "1" || env.REPOLENS_AI_PROVIDER === "disabled";
  }

  private async refreshFolderTimesForList(): Promise<void> {
    const projects = this.database.listProjects({});
    await Promise.all(projects.map((project) => this.refreshFolderTimes(project)));
  }

  private async refreshFolderTimes(project: ProjectListItem): Promise<void> {
    const stats = await fs.stat(project.path).catch(() => null);
    if (!stats?.isDirectory()) {
      return;
    }
    const folderCreatedAt = dateToIso(stats.birthtime) ?? dateToIso(stats.ctime);
    const folderUpdatedAt = dateToIso(stats.mtime);
    if (folderCreatedAt !== project.createdAt || folderUpdatedAt !== project.updatedAt) {
      this.database.refreshProjectFolderTimes(project.id, folderCreatedAt, folderUpdatedAt);
    }
  }
}

function pathsFromRoot(root: string, target: string): string[] {
  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  return [root, ...segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1)))];
}

async function looksLikeNewFolder(target: string, root: string | null): Promise<boolean> {
  if (!root || target === root || target === os.homedir()) {
    return false;
  }
  const [entries, stats] = await Promise.all([
    fs.readdir(target, { withFileTypes: true }).catch(() => null),
    fs.stat(target).catch(() => null)
  ]);
  if (!entries || !stats) {
    return false;
  }
  // Grouping folders hold subfolders; a fresh POC folder is recent and (nearly) empty.
  const visible = entries.filter((entry) => !entry.name.startsWith("."));
  const createdAt = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs;
  return visible.length <= 5 && !visible.some((entry) => entry.isDirectory()) && Date.now() - createdAt < 7 * 24 * 3600 * 1000;
}

function splitTagPath(tagPath: string): string[] {
  const segments = tagPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) {
    throw new RepoLensError("tag_name_required", "Tag path is required.");
  }
  return segments;
}

function dateToIso(date: Date): string | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return date.toISOString();
}
