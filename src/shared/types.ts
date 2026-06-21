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

export type ProjectListItem = {
  id: string;
  name: string;
  path: string;
  description: string;
  techStacks: string[];
  status: ProjectStatus;
  tags: string[];
  lastModifiedAt: string | null;
  source: ProjectSource;
  favorite: boolean;
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
  tags?: string[];
  scanRootId?: string;
  source?: ProjectSource;
  favoriteOnly?: boolean;
};

export type ProjectUpdatePatch = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  favorite?: boolean;
  tags?: string[];
  startCommand?: string | null;
  testCommand?: string | null;
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
  addManualProject(path: string): Promise<ProjectDetail>;
  deleteProject(projectId: string): Promise<void>;
  listScanRoots(): Promise<ScanRoot[]>;
  addScanRoot(path: string): Promise<ScanRoot>;
  updateScanRoot(id: string, patch: ScanRootUpdatePatch): Promise<ScanRoot>;
  removeScanRoot(id: string): Promise<void>;
  scanAllRoots(): Promise<ScanSummary>;
  scanRoot(rootId: string): Promise<ScanSummary>;
  detectOpenActions(): Promise<OpenActionAvailability[]>;
  openProject(projectId: string, action: OpenAction): Promise<void>;
};
