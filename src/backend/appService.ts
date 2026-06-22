import fs from "node:fs/promises";
import type {
  AiTaggingStatus,
  ApplyTagSuggestionsInput,
  AppApi,
  GenerateTagSuggestionsInput,
  GenerateTagSuggestionsResult,
  OpenAction,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  ScanSummary,
  TagCreateInput,
  TagNode,
  TagUpdatePatch
} from "../shared/types.js";
import {
  buildAiTagPayload,
  DeterministicMockAiTagProvider,
  generateValidatedTagSuggestions,
  type AiTagProvider
} from "./aiTagProvider.js";
import { RepoLensDatabase } from "./database.js";
import { RepoLensError } from "./errors.js";
import { extractProjectMetadata, pathExists } from "./metadata.js";
import { OpenAiCompatibleTagProvider } from "./openAiCompatibleTagProvider.js";
import { detectOpenActions, openPath } from "./openActions.js";
import { normalizeFsPath } from "./pathUtils.js";
import { scanRoots } from "./scanner.js";

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
    return this.database.listProjects(filters);
  }

  async getProject(projectId: string): Promise<ProjectDetail> {
    return this.database.getProject(projectId);
  }

  async updateProject(projectId: string, patch: ProjectUpdatePatch): Promise<ProjectDetail> {
    return this.database.updateProject(projectId, patch);
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
}
