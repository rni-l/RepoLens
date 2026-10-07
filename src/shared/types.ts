export type ProjectStatus =
  | "active"
  | "archived"
  | "experimental"
  | "learning"
  | "client"
  | "missing";

export type ProjectSource = "scan" | "manual";

export type FieldSource = "auto" | "user";

/** 0 = 未设置, 1 = 低, 2 = 中, 3 = 高. */
export type ProjectPriority = 0 | 1 | 2 | 3;

export type OpenAction =
  | "folder"
  | "terminal"
  | "iterm2"
  | "vscode"
  | "cursor";

export type TagNode = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  sortOrder: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TagSource = "user" | "rule" | "agent";

export type ProjectTag = {
  id: string;
  name: string;
  path: string;
  source?: TagSource;
};

export type LinkEnv = "local" | "test" | "prod" | "other";

export type LinkSource = "auto" | "user" | "agent";

export type ProjectLink = {
  id: string;
  projectId: string;
  env: LinkEnv;
  label: string;
  url: string;
  port: number | null;
  source: LinkSource;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectLinkInput = {
  projectId: string;
  env: LinkEnv;
  url: string;
  label?: string;
  port?: number | null;
  source?: Exclude<LinkSource, "auto">;
};

export type ProjectLinkPatch = {
  env?: LinkEnv;
  url?: string;
  label?: string;
  port?: number | null;
};

export type TagCreateInput = {
  name: string;
  parentId?: string | null;
};

export type TagUpdatePatch = {
  name?: string;
  parentId?: string | null;
};

export type TagMoveDirection = "up" | "down";

export type AiTagSuggestion = {
  id: string;
  kind: "existing_tag" | "new_tag_path";
  tagId?: string;
  path: string;
  segments: string[];
  confidence: number;
  rationale: string;
  sourceFields: Array<
    | "name"
    | "path"
    | "description"
    | "readmeSummary"
    | "techStacks"
    | "commands"
    | "entryFiles"
  >;
};

export type GenerateTagSuggestionsInput = {
  projectId: string;
  maxSuggestions?: number;
  allowNewTags?: boolean;
};

export type GenerateTagSuggestionsResult = {
  projectId: string;
  suggestions: AiTagSuggestion[];
  model: string;
  promptPreview: string;
  createdAt: string;
};

export type ApplyTagSuggestionsInput = {
  projectId: string;
  suggestions: Array<{
    tagId?: string;
    segments: string[];
  }>;
  mode: "append" | "replace";
};

export type AiTaggingStatus = {
  available: boolean;
  provider: string;
  model: string | null;
  reason?: "not_configured" | "disabled";
};

export type ProjectListItem = {
  id: string;
  name: string;
  path: string;
  description: string;
  techStacks: string[];
  status: ProjectStatus;
  tags: ProjectTag[];
  links: ProjectLink[];
  lastModifiedAt: string | null;
  source: ProjectSource;
  favorite: boolean;
  pinned: boolean;
  priority: ProjectPriority;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectListItem & {
  readmeSummary: string | null;
  startCommand: string | null;
  testCommand: string | null;
  entryFiles: string[];
  descriptionSource: FieldSource;
  startCommandSource: FieldSource;
  testCommandSource: FieldSource;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScanRoot = {
  id: string;
  path: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFilters = {
  query?: string;
  statuses?: ProjectStatus[];
  techStacks?: string[];
  tagIds?: string[];
  excludedTagIds?: string[];
  scanRootId?: string;
  source?: ProjectSource;
  favoriteOnly?: boolean;
  untagged?: boolean;
};

export type ProjectUpdatePatch = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  favorite?: boolean;
  pinned?: boolean;
  priority?: ProjectPriority;
  tagIds?: string[];
  startCommand?: string | null;
  testCommand?: string | null;
};

export type BulkTagProjectsInput = {
  projectIds: string[];
  tagIds: string[];
  mode: "append";
};

export type BulkTagProjectsResult = {
  updatedCount: number;
  updatedProjects: ProjectListItem[];
  updatedAt: string;
};

export type ScanRootUpdatePatch = {
  path?: string;
  enabled?: boolean;
};

export type ScanSummary = {
  scannedRoots: number;
  discoveredProjects: number;
  addedProjects: number;
  updatedProjects: number;
  skippedDirs: number;
  errors: ScanError[];
};

export type ScanError = {
  path: string;
  kind:
    | "root_not_found"
    | "permission_denied"
    | "read_failed"
    | "manifest_parse_failed"
    | "database_failed";
  message: string;
};

export type OpenActionAvailability = {
  action: OpenAction;
  label: string;
  available: boolean;
  reason?: string;
};

export type IntegrationTool = "claude" | "codex" | "opencode" | "omp" | "shell";

export type IntegrationStatus = {
  tool: IntegrationTool;
  label: string;
  /** The tool itself seems to be installed on this machine. */
  detected: boolean;
  hookInstalled: boolean;
  skillInstalled: boolean;
  files: string[];
};

export type AppApi = {
  listProjects(filters?: ProjectFilters): Promise<ProjectListItem[]>;
  getProject(projectId: string): Promise<ProjectDetail>;
  updateProject(projectId: string, patch: ProjectUpdatePatch): Promise<ProjectDetail>;
  bulkTagProjects(input: BulkTagProjectsInput): Promise<BulkTagProjectsResult>;
  addManualProject(path: string): Promise<ProjectDetail>;
  deleteProject(projectId: string): Promise<void>;
  listTags(): Promise<TagNode[]>;
  createTag(input: TagCreateInput): Promise<TagNode>;
  updateTag(id: string, patch: TagUpdatePatch): Promise<TagNode>;
  moveTag(id: string, direction: TagMoveDirection): Promise<TagNode[]>;
  deleteTag(id: string): Promise<void>;
  getAiTaggingStatus(): Promise<AiTaggingStatus>;
  generateTagSuggestions(input: GenerateTagSuggestionsInput): Promise<GenerateTagSuggestionsResult>;
  applyTagSuggestions(input: ApplyTagSuggestionsInput): Promise<ProjectDetail>;
  listScanRoots(): Promise<ScanRoot[]>;
  addScanRoot(path: string): Promise<ScanRoot>;
  updateScanRoot(id: string, patch: ScanRootUpdatePatch): Promise<ScanRoot>;
  removeScanRoot(id: string): Promise<void>;
  scanAllRoots(): Promise<ScanSummary>;
  scanRoot(rootId: string): Promise<ScanSummary>;
  detectOpenActions(): Promise<OpenActionAvailability[]>;
  openProject(projectId: string, action: OpenAction): Promise<void>;
  addProjectLink(input: ProjectLinkInput): Promise<ProjectDetail>;
  updateProjectLink(id: string, patch: ProjectLinkPatch): Promise<ProjectDetail>;
  deleteProjectLink(id: string): Promise<ProjectDetail>;
  clearAutoTags(projectId: string): Promise<ProjectDetail>;
  openUrl(url: string): Promise<void>;
  getIntegrationStatus(): Promise<IntegrationStatus[]>;
};
