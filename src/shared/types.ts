export type ProjectStatus =
  | "active"
  | "archived"
  | "experimental"
  | "learning"
  | "client"
  | "missing";

export type ProjectSource = "scan" | "manual";

export type FieldSource = "auto" | "user";

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
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTag = {
  id: string;
  name: string;
  path: string;
};

export type TagCreateInput = {
  name: string;
  parentId?: string | null;
};

export type TagUpdatePatch = {
  name?: string;
  parentId?: string | null;
};

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
  lastModifiedAt: string | null;
  source: ProjectSource;
  favorite: boolean;
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
  scanRootId?: string;
  source?: ProjectSource;
  favoriteOnly?: boolean;
};

export type ProjectUpdatePatch = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  favorite?: boolean;
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
};
