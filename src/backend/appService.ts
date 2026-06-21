import fs from "node:fs/promises";
import type {
  AppApi,
  OpenAction,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectUpdatePatch,
  ScanRoot,
  ScanRootUpdatePatch,
  ScanSummary
} from "../shared/types.js";
import { RepoLensDatabase } from "./database.js";
import { RepoLensError } from "./errors.js";
import { extractProjectMetadata, pathExists } from "./metadata.js";
import { detectOpenActions, openPath } from "./openActions.js";
import { normalizeFsPath } from "./pathUtils.js";
import { scanRoots } from "./scanner.js";

export class RepoLensService implements AppApi {
  constructor(private readonly database: RepoLensDatabase = new RepoLensDatabase()) {}

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
}
